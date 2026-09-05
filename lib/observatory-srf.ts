/**
 * 관측소 — SRF(상설 레포 창구) 사용량 수집 및 저장
 *
 * 데이터 출처는 FRED 하나만 사용한다.
 *  - RPONTTLD: Overnight Repurchase Agreements: Total Securities Purchased by
 *    the Federal Reserve in the Temporary Open Market Operations (십억 달러)
 *
 * 국채만 담는 RPONTSYD 대신 총액 시리즈(RPONTTLD)를 쓴다. 두 시리즈는 실제로
 * 1,537일에서 값이 다르며(국채 외 담보 포함분), 총액 쪽이 "연준 창구가 얼마나
 * 쓰였나"를 온전히 담는다.
 *
 * 2021년 7월 SRF 신설 이전 구간은 연준의 임시 레포 투입 기록이다.
 * 2019년 9월 레포 발작, 2020년 3월 코로나 국면이 같은 시리즈에 이어져 있어
 * 지금 수치가 역사적으로 어느 수준인지 바로 견줄 수 있다.
 */
import { redis } from "@/lib/redis";
import type { SrfPoint } from "@/lib/observatory-constants";

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

export const SRF_KEY = "observatory:srf";

/** RPONTTLD 시리즈 시작일 */
export const SRF_START = "2000-01-03";

/** 사용하는 FRED 시리즈 id */
export const SRF_SERIES_ID = "RPONTTLD";

interface FredObs {
  date: string;
  value: string;
}

/**
 * FRED 는 이 시리즈에 대해 주중(월~금) 모든 날짜의 행을 준다.
 * 값은 세 갈래인데, 사용량 관점에서는 앞의 둘이 똑같이 "안 쓰였다"는 뜻이다.
 *   "."  → 그날 레포 운영 자체가 없었음 (연휴 포함)
 *   0    → 운영은 했으나 응찰이 0
 *   양수 → 실제 사용액
 * 따라서 결측(".")도 0으로 저장한다. 값이 "모르는 값"이 아니라 "0"이기 때문이고,
 * 막대 차트에서도 구멍이 아니라 바닥으로 그려지는 편이 사실에 가깝다.
 */
function toUsage(v: string): number {
  if (v === "." || v === "") return 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/** Redis 에 저장된 시계열 (날짜 오름차순). 없으면 빈 배열 */
export async function loadSrf(): Promise<SrfPoint[]> {
  // @upstash/redis 는 직렬화/역직렬화를 자동 처리한다 (JSON.parse 금지)
  const stored = await redis.get<SrfPoint[]>(SRF_KEY);
  return Array.isArray(stored) ? stored : [];
}

export interface SrfCollectResult {
  /** 이번 실행이 전체 백필이었는지 */
  backfill: boolean;
  /** FRED 조회 시작일 */
  observationStart: string;
  /** 이번 실행으로 새로 추가된 날짜 수 */
  added: number;
  /** 저장 후 전체 데이터 수 */
  total: number;
  latestDate: string | null;
  latestUsage: number | null;
}

/**
 * FRED 에서 SRF 사용량을 가져와 Redis 에 병합 저장한다.
 *
 * Redis 가 비어 있으면 SRF_START 부터 전체 백필,
 * 있으면 마지막 저장일부터 증분 수집한다.
 * (마지막 저장일을 포함해 다시 받는 이유: FRED 는 직전 관측치를 사후 정정하기도 한다)
 */
export async function collectSrf(): Promise<SrfCollectResult> {
  const existing = await loadSrf();
  const backfill = existing.length === 0;
  const observationStart = backfill
    ? SRF_START
    : existing[existing.length - 1].date;

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error("FRED_API_KEY not set");

  const url = `${FRED_BASE}?series_id=${SRF_SERIES_ID}&api_key=${apiKey}&file_type=json&observation_start=${observationStart}`;
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`FRED ${SRF_SERIES_ID}: ${res.status}`);

  const json = (await res.json()) as { observations?: FredObs[] };
  const observations = json.observations ?? [];

  const merged = new Map<string, SrfPoint>(existing.map((p) => [p.date, p]));
  const before = merged.size;

  for (const o of observations) {
    if (!o.date) continue;
    merged.set(o.date, { date: o.date, usageBillions: toUsage(o.value) });
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
      latestUsage: null,
    };
  }

  await redis.set(SRF_KEY, series);

  const latest = series[series.length - 1];
  return {
    backfill,
    observationStart,
    added: series.length - before,
    total: series.length,
    latestDate: latest.date,
    latestUsage: latest.usageBillions,
  };
}
