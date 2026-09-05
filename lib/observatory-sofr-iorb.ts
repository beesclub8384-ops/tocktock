/**
 * 관측소 — SOFR / IORB 수집 및 저장
 *
 * 데이터 출처는 FRED 하나만 사용한다.
 *  - SOFR: Secured Overnight Financing Rate (레포 금리)
 *  - IORB: Interest on Reserve Balances (연준이 지준에 주는 이자율)
 */
import { redis } from "@/lib/redis";
import type { SofrIorbPoint } from "@/lib/observatory-constants";

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

export const SOFR_IORB_KEY = "observatory:sofr-iorb";

/** IORB 시리즈 시작일. 이전 기간은 IOER/IORR 로 정의가 달라 비교 대상이 아니다 */
export const SOFR_IORB_START = "2021-07-29";

interface FredObs {
  date: string;
  value: string;
}

function toNum(v: string): number | null {
  // FRED 는 결측치를 "." 로 준다
  if (v === "." || v === "") return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** 시리즈 하나를 observationStart 이후로 조회해 date → 값(%) 맵으로 반환 */
async function fetchFredSeries(
  seriesId: string,
  observationStart: string
): Promise<Map<string, number>> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error("FRED_API_KEY not set");

  const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${observationStart}`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`FRED ${seriesId}: ${res.status}`);

  const json = (await res.json()) as { observations?: FredObs[] };
  const map = new Map<string, number>();
  for (const o of json.observations ?? []) {
    const v = toNum(o.value);
    if (v !== null) map.set(o.date, v);
  }
  return map;
}

/** Redis 에 저장된 시계열 (날짜 오름차순). 없으면 빈 배열 */
export async function loadSofrIorb(): Promise<SofrIorbPoint[]> {
  // @upstash/redis 는 직렬화/역직렬화를 자동 처리한다 (JSON.parse 금지)
  const stored = await redis.get<SofrIorbPoint[]>(SOFR_IORB_KEY);
  return Array.isArray(stored) ? stored : [];
}

export interface CollectResult {
  /** 이번 실행이 전체 백필이었는지 */
  backfill: boolean;
  /** FRED 조회 시작일 */
  observationStart: string;
  /** 이번 실행으로 새로 추가된 날짜 수 */
  added: number;
  /** 저장 후 전체 데이터 수 */
  total: number;
  latestDate: string | null;
  latestSpreadBp: number | null;
}

/**
 * FRED 에서 SOFR/IORB 를 가져와 스프레드를 계산하고 Redis 에 병합 저장한다.
 *
 * Redis 가 비어 있으면 SOFR_IORB_START 부터 전체 백필,
 * 있으면 마지막 저장일부터 증분 수집한다.
 * (마지막 저장일을 포함해 다시 받는 이유: FRED 는 직전 관측치를 사후 정정하기도 한다)
 */
export async function collectSofrIorb(): Promise<CollectResult> {
  const existing = await loadSofrIorb();
  const backfill = existing.length === 0;
  const observationStart = backfill
    ? SOFR_IORB_START
    : existing[existing.length - 1].date;

  const [sofrMap, iorbMap] = await Promise.all([
    fetchFredSeries("SOFR", observationStart),
    fetchFredSeries("IORB", observationStart),
  ]);

  const merged = new Map<string, SofrIorbPoint>(existing.map((p) => [p.date, p]));
  const before = merged.size;

  // 두 시리즈에 모두 값이 있는 날짜만 사용한다 (한쪽만 있으면 스프레드를 만들 수 없음)
  for (const [date, sofr] of sofrMap) {
    const iorb = iorbMap.get(date);
    if (iorb === undefined) continue;
    // bp = %p × 100. 부동소수 잔차를 없애려고 소수 둘째 자리에서 반올림
    const spreadBp = Math.round((sofr - iorb) * 100 * 100) / 100;
    merged.set(date, { date, sofr, iorb, spreadBp });
  }

  const series = Array.from(merged.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  // 수집 결과가 비면 기존 데이터를 지우지 않는다 (FRED 일시 장애로 인한 데이터 유실 방지)
  if (series.length === 0) {
    return {
      backfill,
      observationStart,
      added: 0,
      total: existing.length,
      latestDate: null,
      latestSpreadBp: null,
    };
  }

  await redis.set(SOFR_IORB_KEY, series);

  const latest = series[series.length - 1];
  return {
    backfill,
    observationStart,
    added: series.length - before,
    total: series.length,
    latestDate: latest.date,
    latestSpreadBp: latest.spreadBp,
  };
}
