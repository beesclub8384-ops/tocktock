/**
 * 매집 의심 종목 자동 스캔.
 *
 * 입력: investor-flow:archive (자동 누적 데이터, universe 종목)
 * 산출: 외국인+기관 누적 매수가 시총 0.5% 이상이면서 개인은 순매도인 종목 목록.
 *       가격이 거의 안 움직인 순서(|가격변동률| 오름차순)로 정렬 — "조용한 매집" 우선.
 *
 * 실행: 매일 KST 07:00 (월~금) cron으로 갱신, Redis에 26시간 TTL로 저장.
 *
 * 단위 일관: 모든 금액은 원(₩). priceChange/accumulationRatio는 % 단위.
 */

import { redis } from "@/lib/redis";
import { loadStockUniverse, fetchAllListedStocks } from "@/lib/stock-universe";
import { loadArchive } from "@/lib/investor-flow-archive";

export interface AccumulationSignal {
  code: string;
  name: string;
  /** 시가총액 (원) */
  marketCap: number;
  /** 10영업일 누적 외국인 순매수 대금 (원). 매수=양수, 매도=음수 */
  foreignNet: number;
  institutionNet: number;
  individualNet: number;
  /** (외국인+기관 순매수) / 시총 × 100 (%) */
  accumulationRatio: number;
  /** 10영업일 가격 변동률 (%) */
  priceChange: number;
}

export interface AccumulationScanResult {
  /** ISO 생성 시각 */
  generatedAt: string;
  /** 마지막 영업일 (YYYY-MM-DD) — archive에서 가장 최신 날짜 */
  asOfDate: string;
  signalCount: number;
  signals: AccumulationSignal[];
}

const RESULT_KEY = "accumulation-scan:v1";
const RESULT_TTL_SEC = 26 * 60 * 60; // 26h — 매일 cron 갱신을 살짝 넘기는 안전치

const WINDOW_DAYS = 10;
const ACCUMULATION_RATIO_MIN = 0.3; // %

/**
 * universe 종목들에 대해 archive 기반 매집 신호 스캔.
 *
 * - 시가총액은 fetchAllListedStocks() (Naver marketValue API)로 한 번에 확보.
 *   universe 종목 코드와 join.
 * - 각 종목의 archive에서 마지막 10영업일을 골라 누적 합산.
 * - 거래대금(value)이 null인 행은 KIS가 제공 안 한 경우 → 종가×수량으로 추정.
 * - 정렬: |priceChange| 오름차순 (조용한 종목이 위로).
 */
export async function runAccumulationScan(): Promise<AccumulationScanResult> {
  const universe = await loadStockUniverse();
  if (universe.symbols.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      asOfDate: "",
      signalCount: 0,
      signals: [],
    };
  }

  // 시가총액 + 종목명 일괄 조회 (Naver marketValue, 약 5초)
  const allListed = await fetchAllListedStocks();
  const meta = new Map<string, { name: string; marketCap: number }>();
  for (const s of allListed) {
    meta.set(s.code, { name: s.name, marketCap: s.marketCapKRW });
  }

  // archive 일괄 로드 — 30개씩 병렬
  const BATCH = 30;
  const codes = universe.symbols;
  const blobs: ({ entries: ArchiveEntry[]; updatedAt: string } | null)[] =
    new Array(codes.length).fill(null);
  for (let i = 0; i < codes.length; i += BATCH) {
    const slice = codes.slice(i, i + BATCH);
    const loaded = await Promise.all(
      slice.map((c) =>
        loadArchive(c).then((b) =>
          b ? { entries: b.entries, updatedAt: b.updatedAt } : null
        )
      )
    );
    for (let j = 0; j < slice.length; j++) blobs[i + j] = loaded[j];
  }

  let asOfDate = "";
  const signals: AccumulationSignal[] = [];

  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    const blob = blobs[i];
    if (!blob || blob.entries.length < WINDOW_DAYS) continue;

    const info = meta.get(code);
    if (!info || info.marketCap <= 0) continue;

    // 마지막 10영업일
    const window = blob.entries.slice(-WINDOW_DAYS);
    const last = window[window.length - 1];
    const first = window[0];
    if (!last.close || !first.close || first.close <= 0) continue;

    if (last.date > asOfDate) asOfDate = last.date;

    // 거래대금 합계 (KIS value 우선, 없으면 close × shares 추정)
    const sumValue = (key: "foreign" | "institution" | "individual"): number => {
      let total = 0;
      for (const e of window) {
        const valKey =
          key === "foreign"
            ? "foreignValue"
            : key === "institution"
              ? "institutionValue"
              : "individualValue";
        const sharesKey =
          key === "foreign"
            ? "foreignShares"
            : key === "institution"
              ? "institutionShares"
              : "individualShares";
        const v = e[valKey];
        if (v != null) {
          total += v;
        } else if (e.close != null) {
          total += (e[sharesKey] ?? 0) * e.close;
        }
      }
      return total;
    };

    const foreignNet = sumValue("foreign");
    const institutionNet = sumValue("institution");
    const individualNet = sumValue("individual");

    const accumulationRatio =
      ((foreignNet + institutionNet) / info.marketCap) * 100;
    const priceChange = ((last.close - first.close) / first.close) * 100;

    if (accumulationRatio < ACCUMULATION_RATIO_MIN) continue;
    if (individualNet >= 0) continue;

    signals.push({
      code,
      name: info.name,
      marketCap: info.marketCap,
      foreignNet,
      institutionNet,
      individualNet,
      accumulationRatio,
      priceChange,
    });
  }

  // |가격 변동률| 오름차순 — 조용한 종목 우선
  signals.sort((a, b) => Math.abs(a.priceChange) - Math.abs(b.priceChange));

  return {
    generatedAt: new Date().toISOString(),
    asOfDate,
    signalCount: signals.length,
    signals,
  };
}

export async function saveAccumulationScan(
  result: AccumulationScanResult
): Promise<void> {
  await redis.set(RESULT_KEY, result, { ex: RESULT_TTL_SEC });
}

export async function loadAccumulationScan(): Promise<AccumulationScanResult | null> {
  try {
    return await redis.get<AccumulationScanResult>(RESULT_KEY);
  } catch {
    return null;
  }
}

/* ──────────────────────────────────────────────────────────
 *  내부 타입 — investor-flow-archive와 동일 형태 유지
 * ────────────────────────────────────────────────────────── */

interface ArchiveEntry {
  date: string;
  close: number | null;
  foreignShares: number;
  institutionShares: number;
  individualShares: number;
  foreignValue: number | null;
  institutionValue: number | null;
  individualValue: number | null;
}
