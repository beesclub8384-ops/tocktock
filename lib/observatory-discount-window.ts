/**
 * 관측소 — 재할인 창구 대출 잔액(Discount Window Primary Credit) 수집 및 저장
 *
 * 데이터 출처는 FRED 하나만 사용한다.
 *  - WLCFLPCL: Assets: Liquidity and Credit Facilities: Loans: Primary Credit:
 *    Wednesday Level
 *
 * ⚠ 단위 주의 — FRED 원본은 **백만 달러(Millions of U.S. Dollars)** 다.
 *   SRF(RPONTTLD)가 십억 달러로 오는 것과 다르다. 변환하지 않으면
 *   5,282(=52.8억 달러)가 "5,282십억 달러"로 읽혀 지표가 늘 경보로 붙박인다.
 *   그래서 ÷1000 변환은 **이 파일에서 한 번만** 하고, Redis 에는 십억 달러로
 *   저장한다. 조회 라우트와 차트에서는 절대 다시 변환하지 않는다.
 *
 * ⚠ 주기 주의 — 주간(수요일 기준) 시리즈다. 연준 H.4.1 이 목요일 오후(미국 동부)
 *   에 나오므로, 평일 매일 도는 수집 cron 기준으로는 금요일 실행에서 그 주
 *   수요일 값이 처음 잡힌다. 평시에도 최신값이 최대 7일 전인 게 정상이다.
 */
import { redis } from "@/lib/redis";
import type { DiscountWindowPoint } from "@/lib/observatory-constants";

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

export const DISCOUNT_WINDOW_KEY = "observatory:discount-window";

/** WLCFLPCL 시리즈 시작일 */
export const DISCOUNT_WINDOW_START = "2002-12-18";

/** 사용하는 FRED 시리즈 id */
export const DISCOUNT_WINDOW_SERIES_ID = "WLCFLPCL";

interface FredObs {
  date: string;
  value: string;
}

/**
 * FRED 백만 달러 문자열 → 십억 달러 숫자.
 *
 * 결측치는 "." 로 온다. SRF 와 달리 여기서는 0으로 채우지 않는다.
 * 이 시리즈의 결측은 "그 주 잔액이 0" 이 아니라 "값을 모른다" 는 뜻이라,
 * 0으로 저장하면 없는 급감을 만들어낸다.
 */
function toBillions(v: string): number | null {
  if (v === "." || v === "") return null;
  const millions = parseFloat(v);
  if (!Number.isFinite(millions)) return null;
  // 백만 → 십억. 백만 달러 자리까지 보존하려고 소수 셋째 자리에서 반올림
  return Math.round((millions / 1000) * 1000) / 1000;
}

/** Redis 에 저장된 시계열 (날짜 오름차순). 없으면 빈 배열 */
export async function loadDiscountWindow(): Promise<DiscountWindowPoint[]> {
  // @upstash/redis 는 직렬화/역직렬화를 자동 처리한다 (JSON.parse 금지)
  const stored = await redis.get<DiscountWindowPoint[]>(DISCOUNT_WINDOW_KEY);
  return Array.isArray(stored) ? stored : [];
}

export interface DiscountWindowCollectResult {
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
 * FRED 에서 재할인 창구 잔액을 가져와 Redis 에 병합 저장한다.
 *
 * Redis 가 비어 있으면 DISCOUNT_WINDOW_START 부터 전체 백필,
 * 있으면 마지막 저장일부터 증분 수집한다.
 * (마지막 저장일을 포함해 다시 받는 이유: FRED 는 직전 관측치를 사후 정정하기도 한다.
 *  주간 시리즈는 특히 다음 주 발표 때 직전 주 값이 정정되는 일이 있다)
 */
export async function collectDiscountWindow(): Promise<DiscountWindowCollectResult> {
  const existing = await loadDiscountWindow();
  const backfill = existing.length === 0;
  const observationStart = backfill
    ? DISCOUNT_WINDOW_START
    : existing[existing.length - 1].date;

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error("FRED_API_KEY not set");

  const url = `${FRED_BASE}?series_id=${DISCOUNT_WINDOW_SERIES_ID}&api_key=${apiKey}&file_type=json&observation_start=${observationStart}`;
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`FRED ${DISCOUNT_WINDOW_SERIES_ID}: ${res.status}`);

  const json = (await res.json()) as { observations?: FredObs[] };
  const observations = json.observations ?? [];

  const merged = new Map<string, DiscountWindowPoint>(
    existing.map((p) => [p.date, p])
  );
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

  await redis.set(DISCOUNT_WINDOW_KEY, series);

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
