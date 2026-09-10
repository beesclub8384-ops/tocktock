/**
 * 관측소 2 — 은행: 채권 미실현손실 수집 및 저장
 *
 * ⚠ 출처가 관측소 1 과 다르다. FRED 가 아니라 **FDIC 분기 은행실적보고서(QBP)**
 *   의 Time Series Spreadsheets(.xlsx)를 받아서 판다.
 *   (FRED 의 FDIC 계열 시리즈는 2021년에 갱신이 끊겨 못 쓴다)
 *
 * 실측으로 확인한 사실 (2026-09-11):
 *   - 파일 하나에 1984Q1~현재 전체 히스토리가 들어 있다.
 *     → 매 분기 **최신 파일 하나만** 받으면 과거까지 통째로 갱신된다.
 *   - AFS/HTM 미실현손익은 1994Q1 부터 값이 있다 (그 이전은 N/A).
 *   - 시트 `Balance Sheet`, 단위는 **백만 달러**, 분기가 열 헤더다.
 *   - 지난 분기 파일 URL 은 전부 404 다. 최신 파일만 살아 있으므로
 *     수집에 실패해도 Redis 의 마지막 성공분을 절대 지우지 않는다.
 *   - 분기 페이지 슬러그가 불규칙하다 (`q1-2026` 인데 `2q-2026`).
 *     → URL 을 추측하지 않고 반드시 링크를 타고 찾는다 (2홉 탐색).
 */
import * as XLSX from "xlsx";
import { redis } from "@/lib/redis";
import {
  ghostLossBillions,
  type UnrealizedLossPoint,
} from "@/lib/observatory-constants";

export const BANKS_UL_KEY = "observatory:unrealized-losses";

const FDIC_BASE = "https://www.fdic.gov";
const QBP_INDEX = `${FDIC_BASE}/quarterly-banking-profile`;

/** AFS/HTM 미실현손익이 실제로 존재하는 첫 분기 */
export const UL_FIRST_QUARTER = "1994Q1";

/**
 * 워크북에서 찾을 행 라벨.
 *
 * ⚠ 행 번호(R40/R43/R76)로 찾지 않는다. FDIC 가 항목을 하나만 끼워 넣어도
 *   번호가 밀리는데, 그러면 엉뚱한 행을 읽고도 에러가 안 난다 — 무음 실패다.
 *   라벨로 찾고, 못 찾으면 던진다.
 */
const LABEL_AFS = "available for sale on non-equity securities unrealized gain/loss";
const LABEL_HTM = "held to maturity on non-equity securities unrealized gain/loss";
const LABEL_EQUITY = "total equity capital";

/** Redis 에 함께 저장하는 수집 메타 */
export interface UnrealizedLossMeta {
  /** 실제로 받은 xlsx 주소 (진단용) */
  sourceUrl: string;
  /**
   * 새 분기를 처음 확인한 날 YYYY-MM-DD.
   *
   * ⚠ FDIC 의 공식 "발표일" 이 아니다. 분기 페이지·보도자료 HTML 어디에도
   *   발표일이 기계가 읽을 형태로 없어서(JSON-LD 없음) 추출을 포기했다.
   *   대신 cron 이 새 분기를 처음 본 날을 적고, 화면에도 "발표 확인일" 이라고
   *   그대로 쓴다. 없는 정확도를 지어내지 않기 위해서다.
   */
  confirmedAt: string;
}

export interface UnrealizedLossStore {
  series: UnrealizedLossPoint[];
  meta: UnrealizedLossMeta | null;
}

/** Redis 에 저장된 시계열. 없으면 빈 값 */
export async function loadUnrealizedLosses(): Promise<UnrealizedLossStore> {
  // @upstash/redis 는 직렬화/역직렬화를 자동 처리한다 (JSON.stringify 금지)
  const stored = await redis.get<UnrealizedLossStore>(BANKS_UL_KEY);
  if (stored && Array.isArray(stored.series)) return stored;
  return { series: [], meta: null };
}

/* ────────────────────────────────────────────────────────────
 * 분기 계산
 * ──────────────────────────────────────────────────────────── */

/** 분기 말일 "2026-06-30" */
function quarterEndDate(year: number, q: number): string {
  const endMonth = q * 3; // 3, 6, 9, 12
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  return `${year}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

/** 정렬용 숫자 키 (2026Q2 → 20262) */
export function quarterOrder(quarter: string): number {
  const m = /^(\d{4})Q([1-4])$/.exec(quarter);
  return m ? Number(m[1]) * 10 + Number(m[2]) : 0;
}

/**
 * 지금 시점에서 "이미 발표됐어야 할" 가장 최근 분기.
 *
 * QBP 는 분기 말 뒤 약 2개월에 나온다 (2026Q2 → 2026-09-01 발표).
 * 저장된 분기가 이 값에 이미 도달했으면 HTTP 요청을 아예 하지 않는다 —
 * 분기 데이터를 매일 2.6MB 씩 받아올 이유가 없다.
 */
export function expectedLatestQuarter(now: Date = new Date()): string {
  // 2개월 전으로 되돌린 시점이 속한 분기의 **직전** 분기가 확실히 나와 있다
  const shifted = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1)
  );
  const y = shifted.getUTCFullYear();
  const q = Math.floor(shifted.getUTCMonth() / 3) + 1;
  const prevQ = q === 1 ? 4 : q - 1;
  const prevY = q === 1 ? y - 1 : y;
  return `${prevY}Q${prevQ}`;
}

/* ────────────────────────────────────────────────────────────
 * 2홉 탐색 — 최신 xlsx 주소 찾기
 * ──────────────────────────────────────────────────────────── */

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    // 기본 UA 로도 200 이지만, 공공 사이트라 누가 긁는지 밝혀 둔다
    headers: { "User-Agent": "TockTock/1.0 (observatory data collector)" },
  });
  if (!res.ok) throw new Error(`FDIC ${url}: ${res.status}`);
  return res.text();
}

/**
 * 최신 QBP Time Series 스프레드시트 주소를 찾는다.
 *
 *   1홉: /quarterly-banking-profile → 최신 분기 페이지 링크
 *   2홉: 그 페이지 → qbp-time-series-spreadsheets-*.xlsx
 */
export async function findLatestWorkbookUrl(): Promise<string> {
  const index = await fetchText(QBP_INDEX);

  // 예: /quarterly-banking-profile/quarterly-banking-profile-2q-2026
  //     /quarterly-banking-profile/quarterly-banking-profile-q1-2026
  const releaseLinks = Array.from(
    index.matchAll(
      /href="(\/quarterly-banking-profile\/quarterly-banking-profile-(?:\d?q|q\d)-\d{4})"/gi
    )
  ).map((m) => m[1]);

  if (releaseLinks.length === 0) {
    throw new Error("FDIC: 최신 분기 페이지 링크를 찾지 못했습니다 (페이지 구조 변경?)");
  }

  // 목록의 첫 링크가 최신이다 (FDIC 가 최신순으로 싣는다)
  const releaseUrl = `${FDIC_BASE}${releaseLinks[0]}`;
  const releasePage = await fetchText(releaseUrl);

  const xlsxMatch = releasePage.match(
    /href="(\/quarterly-banking-profile\/qbp-time-series-spreadsheets-[^"]+\.xlsx)"/i
  );
  if (!xlsxMatch) {
    throw new Error(
      `FDIC: ${releaseUrl} 에서 time-series xlsx 링크를 찾지 못했습니다 (페이지 구조 변경?)`
    );
  }

  return `${FDIC_BASE}${xlsxMatch[1]}`;
}

/* ────────────────────────────────────────────────────────────
 * 파싱
 * ──────────────────────────────────────────────────────────── */

/** 셀이 숫자면 숫자, "N/A" 같은 값이면 null */
function cellNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

/** 라벨이 일치하는 행을 찾는다. 못 찾으면 던진다 (무음 실패 방지) */
function findRow(grid: unknown[][], label: string): unknown[] {
  const row = grid.find((r) =>
    r.some((c) => typeof c === "string" && c.trim().toLowerCase() === label)
  );
  if (!row) {
    throw new Error(`FDIC 워크북에서 행을 찾지 못했습니다: "${label}" (양식 변경?)`);
  }
  return row;
}

/**
 * QBP 워크북(.xlsx) 바이트에서 분기 시계열을 뽑는다.
 *
 * ⚠ 원본 단위는 **백만 달러**다. 화면·판정은 전부 십억 달러라
 *   여기서 한 번만 나눈다 (/1000). 이 지점을 놓치면 비율이 1000배로 튄다.
 */
export function parseWorkbook(buf: ArrayBuffer): UnrealizedLossPoint[] {
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets["Balance Sheet"];
  if (!sheet) {
    throw new Error("FDIC 워크북에 'Balance Sheet' 시트가 없습니다 (양식 변경?)");
  }

  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: true,
  });

  // 분기 헤더 행: "1984Q1" 같은 셀이 여럿 있는 행
  const headerRow = grid.find(
    (r) =>
      r.filter((c) => typeof c === "string" && /^\d{4}Q[1-4]$/.test(c.trim()))
        .length > 4
  );
  if (!headerRow) {
    throw new Error("FDIC 워크북에서 분기 헤더 행을 찾지 못했습니다 (양식 변경?)");
  }

  const afsRow = findRow(grid, LABEL_AFS);
  const htmRow = findRow(grid, LABEL_HTM);
  const equityRow = findRow(grid, LABEL_EQUITY);

  const series: UnrealizedLossPoint[] = [];

  for (let col = 0; col < headerRow.length; col++) {
    const head = headerRow[col];
    if (typeof head !== "string") continue;
    const m = /^(\d{4})Q([1-4])$/.exec(head.trim());
    if (!m) continue;

    const afsM = cellNum(afsRow[col]);
    const htmM = cellNum(htmRow[col]);
    const eqM = cellNum(equityRow[col]);
    // 셋 중 하나라도 없는 분기는 건너뛴다 (1994 이전은 AFS/HTM 이 N/A)
    if (afsM === null || htmM === null || eqM === null || eqM === 0) continue;

    // 백만 달러 → 십억 달러
    const afsBillions = afsM / 1000;
    const htmBillions = htmM / 1000;
    const equityBillions = eqM / 1000;
    const ghost = ghostLossBillions(afsBillions, htmBillions);

    const year = Number(m[1]);
    const q = Number(m[2]);

    series.push({
      quarter: `${year}Q${q}`,
      quarterEnd: quarterEndDate(year, q),
      afsBillions,
      htmBillions,
      ghostBillions: ghost,
      equityBillions,
      ratioPct: (ghost / equityBillions) * 100,
    });
  }

  series.sort((a, b) => quarterOrder(a.quarter) - quarterOrder(b.quarter));
  return series;
}

/* ────────────────────────────────────────────────────────────
 * 수집
 * ──────────────────────────────────────────────────────────── */

export interface UnrealizedLossCollectResult {
  /** HTTP 를 아예 걸지 않고 건너뛰었는지 */
  skipped: boolean;
  /** 건너뛴 이유 (skipped 일 때만) */
  reason?: string;
  sourceUrl?: string;
  total: number;
  latestQuarter: string | null;
  latestRatioPct: number | null;
  /** 이번 실행에서 분기가 새로 넘어갔는지 */
  newQuarter: boolean;
}

/**
 * FDIC 에서 최신 워크북을 받아 Redis 에 저장한다.
 *
 * 분기 데이터라 매일 받을 이유가 없다. 저장된 분기가 "나와 있어야 할 분기"에
 * 이미 도달했으면 HTTP 요청 없이 즉시 끝낸다.
 *
 * @param force 분기 판단을 무시하고 무조건 받아온다 (수동 점검용)
 */
export async function collectUnrealizedLosses(
  force = false
): Promise<UnrealizedLossCollectResult> {
  const existing = await loadUnrealizedLosses();
  const storedPoint =
    existing.series.length > 0
      ? existing.series[existing.series.length - 1]
      : null;
  const storedLatest = storedPoint?.quarter ?? null;
  const expected = expectedLatestQuarter();

  if (
    !force &&
    storedLatest !== null &&
    quarterOrder(storedLatest) >= quarterOrder(expected)
  ) {
    return {
      skipped: true,
      reason: `저장된 ${storedLatest} 가 예상 최신 분기 ${expected} 이상 — 내려받지 않음`,
      total: existing.series.length,
      latestQuarter: storedLatest,
      latestRatioPct: storedPoint?.ratioPct ?? null,
      newQuarter: false,
    };
  }

  const sourceUrl = await findLatestWorkbookUrl();
  const res = await fetch(sourceUrl, {
    cache: "no-store",
    // 2.6MB 파일이라 넉넉히 준다
    signal: AbortSignal.timeout(60000),
    headers: { "User-Agent": "TockTock/1.0 (observatory data collector)" },
  });
  if (!res.ok) throw new Error(`FDIC xlsx: ${res.status}`);

  const series = parseWorkbook(await res.arrayBuffer());

  // 파싱 결과가 비면 기존 데이터를 지우지 않는다.
  // 지난 분기 파일 URL 이 전부 404 라 한 번 날리면 되받을 곳이 없다.
  if (series.length === 0) {
    throw new Error("FDIC 워크북 파싱 결과가 비었습니다 — 기존 데이터 유지");
  }

  const latest = series[series.length - 1];
  const newQuarter = latest.quarter !== storedLatest;

  const meta: UnrealizedLossMeta = {
    sourceUrl,
    // 분기가 그대로면 처음 확인한 날을 유지한다 (매일 오늘로 덮어쓰지 않는다)
    confirmedAt:
      newQuarter || !existing.meta
        ? new Date().toISOString().slice(0, 10)
        : existing.meta.confirmedAt,
  };

  const store: UnrealizedLossStore = { series, meta };
  await redis.set(BANKS_UL_KEY, store);

  return {
    skipped: false,
    sourceUrl,
    total: series.length,
    latestQuarter: latest.quarter,
    latestRatioPct: latest.ratioPct,
    newQuarter,
  };
}
