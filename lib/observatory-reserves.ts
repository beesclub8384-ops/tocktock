/**
 * 관측소 — 지급준비금 총량(Reserve Balances) 수집 및 저장
 *
 * 데이터 출처는 FRED 하나만 사용한다.
 *  - WRESBAL: Reserve Balances with Federal Reserve Banks (Week Average,
 *    Ending Wednesday)
 *
 * ⚠ 단위 — FRED 원본은 **백만 달러(Millions of U.S. Dollars)** 다.
 *   (2026-09-08 실측: units="Millions of U.S. Dollars",
 *    2026-09-02 값 2894531 → 2,894.5십억 달러 ≈ 2.89조 달러)
 *   과거 이 시리즈가 십억 달러로 제공되던 시절 자료를 보고 변환을 생략하면
 *   2,894,531십억으로 읽혀 지표가 영원히 초록에 붙박인다.
 *   재할인 창구(WLCFLPCL)와 같이 ÷1000 하고, 역레포(RRPONTSYD)는 이미
 *   십억이라 변환하지 않는다 — 시리즈마다 다르니 반드시 실측할 것.
 *   ÷1000 은 **이 파일에서 한 번만** 하고 Redis 에는 십억 달러로 저장한다.
 *
 * ⚠ 주기 — 주간(수요일 기준). 연준 H.4.1 이 목요일 오후(미국 동부)에 나오므로
 *   재할인 창구와 같은 주기 처리를 쓴다. 평시에도 최신값이 최대 7일 전이 정상.
 *
 * ⚠ 방향 — 이 지표는 값이 작을수록 위험하다.
 */
import { redis } from "@/lib/redis";
import type { ReservesPoint } from "@/lib/observatory-constants";

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

export const RESERVES_KEY = "observatory:reserves";

/** WRESBAL 시리즈 시작일 */
export const RESERVES_START = "2002-12-18";

/** 사용하는 FRED 시리즈 id */
export const RESERVES_SERIES_ID = "WRESBAL";

interface FredObs {
  date: string;
  value: string;
}

/**
 * FRED 백만 달러 문자열 → 십억 달러 숫자.
 *
 * 결측치(".")는 건너뛴다. 이 시리즈의 결측은 "그 주 지급준비금이 0" 이 아니라
 * "값을 모른다" 는 뜻이라, 0으로 저장하면 없던 경보를 만들어낸다.
 */
function toBillions(v: string): number | null {
  if (v === "." || v === "") return null;
  const millions = parseFloat(v);
  if (!Number.isFinite(millions)) return null;
  // 백만 → 십억. 백만 달러 자리까지 보존하려고 소수 셋째 자리에서 반올림
  return Math.round((millions / 1000) * 1000) / 1000;
}

/** Redis 에 저장된 시계열 (날짜 오름차순). 없으면 빈 배열 */
export async function loadReserves(): Promise<ReservesPoint[]> {
  // @upstash/redis 는 직렬화/역직렬화를 자동 처리한다 (JSON.parse 금지)
  const stored = await redis.get<ReservesPoint[]>(RESERVES_KEY);
  return Array.isArray(stored) ? stored : [];
}

export interface ReservesCollectResult {
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
 * FRED 에서 지급준비금 총량을 가져와 Redis 에 병합 저장한다.
 *
 * Redis 가 비어 있으면 RESERVES_START 부터 전체 백필,
 * 있으면 마지막 저장일부터 증분 수집한다.
 * (마지막 저장일을 포함해 다시 받는 이유: FRED 는 직전 관측치를 사후 정정하기도 한다.
 *  주간 시리즈는 특히 다음 주 발표 때 직전 주 값이 정정되는 일이 있다)
 */
export async function collectReserves(): Promise<ReservesCollectResult> {
  const existing = await loadReserves();
  const backfill = existing.length === 0;
  const observationStart = backfill
    ? RESERVES_START
    : existing[existing.length - 1].date;

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error("FRED_API_KEY not set");

  const url = `${FRED_BASE}?series_id=${RESERVES_SERIES_ID}&api_key=${apiKey}&file_type=json&observation_start=${observationStart}`;
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`FRED ${RESERVES_SERIES_ID}: ${res.status}`);

  const json = (await res.json()) as { observations?: FredObs[] };
  const observations = json.observations ?? [];

  const merged = new Map<string, ReservesPoint>(existing.map((p) => [p.date, p]));
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

  await redis.set(RESERVES_KEY, series);

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
