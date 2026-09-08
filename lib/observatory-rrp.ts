/**
 * 관측소 — 역레포(RRP) 잔액 수집 및 저장
 *
 * 데이터 출처는 FRED 하나만 사용한다.
 *  - RRPONTSYD: Overnight Reverse Repurchase Agreements: Treasury Securities
 *    Sold by the Federal Reserve in the Temporary Open Market Operations
 *
 * ⚠ 단위 — FRED 원본이 이미 **십억 달러(Billions of US Dollars)** 다. (실측 확인)
 *   재할인 창구(WLCFLPCL)·지급준비금(WRESBAL)이 백만 달러인 것과 다르다.
 *   여기서 ÷1000 을 하면 잔액이 1/1000 로 줄어 항상 경보로 붙박인다.
 *   **변환하지 않는다.**
 *
 * ⚠ 방향 — 이 지표는 값이 작을수록 위험하다. 판정 부등호는
 *   lib/observatory-constants.ts 의 evaluateRrp 참고.
 */
import { redis } from "@/lib/redis";
import type { RrpPoint } from "@/lib/observatory-constants";

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

export const RRP_KEY = "observatory:rrp";

/** RRPONTSYD 시리즈 시작일 */
export const RRP_START = "2003-02-07";

/** 사용하는 FRED 시리즈 id */
export const RRP_SERIES_ID = "RRPONTSYD";

interface FredObs {
  date: string;
  value: string;
}

/**
 * FRED 문자열 → 십억 달러 숫자. 변환 없이 그대로 읽는다.
 *
 * 결측치(".")는 건너뛴다. SRF 처럼 0 으로 채우면 안 된다.
 * SRF 는 값이 클수록 위험해서 결측을 0(=안 쓰임)으로 봐도 안전한 쪽이지만,
 * RRP 는 작을수록 위험하다 — 휴장일 결측을 0 으로 채우면 있지도 않은
 * "쿠션 소진" 경보를 만들어낸다.
 */
function toBillions(v: string): number | null {
  if (v === "." || v === "") return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** Redis 에 저장된 시계열 (날짜 오름차순). 없으면 빈 배열 */
export async function loadRrp(): Promise<RrpPoint[]> {
  // @upstash/redis 는 직렬화/역직렬화를 자동 처리한다 (JSON.parse 금지)
  const stored = await redis.get<RrpPoint[]>(RRP_KEY);
  return Array.isArray(stored) ? stored : [];
}

export interface RrpCollectResult {
  /** 이번 실행이 전체 백필이었는지 */
  backfill: boolean;
  /** FRED 조회 시작일 */
  observationStart: string;
  /** 이번 실행으로 새로 추가된 날짜 수 */
  added: number;
  /** 저장 후 전체 데이터 수 */
  total: number;
  latestDate: string | null;
  /** 십억 달러 단위 */
  latestBalanceBillions: number | null;
}

/**
 * FRED 에서 RRP 잔액을 가져와 Redis 에 병합 저장한다.
 *
 * Redis 가 비어 있으면 RRP_START 부터 전체 백필,
 * 있으면 마지막 저장일부터 증분 수집한다.
 * (마지막 저장일을 포함해 다시 받는 이유: FRED 는 직전 관측치를 사후 정정하기도 한다)
 */
export async function collectRrp(): Promise<RrpCollectResult> {
  const existing = await loadRrp();
  const backfill = existing.length === 0;
  const observationStart = backfill
    ? RRP_START
    : existing[existing.length - 1].date;

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error("FRED_API_KEY not set");

  const url = `${FRED_BASE}?series_id=${RRP_SERIES_ID}&api_key=${apiKey}&file_type=json&observation_start=${observationStart}`;
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`FRED ${RRP_SERIES_ID}: ${res.status}`);

  const json = (await res.json()) as { observations?: FredObs[] };
  const observations = json.observations ?? [];

  const merged = new Map<string, RrpPoint>(existing.map((p) => [p.date, p]));
  const before = merged.size;

  for (const o of observations) {
    if (!o.date) continue;
    const balanceBillions = toBillions(o.value);
    // 결측이면 건너뛴다 (기존에 저장된 값이 있으면 그대로 남는다)
    if (balanceBillions === null) continue;
    merged.set(o.date, { date: o.date, balanceBillions });
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
      latestBalanceBillions: null,
    };
  }

  await redis.set(RRP_KEY, series);

  const latest = series[series.length - 1];
  return {
    backfill,
    observationStart,
    added: series.length - before,
    total: series.length,
    latestDate: latest.date,
    latestBalanceBillions: latest.balanceBillions,
  };
}
