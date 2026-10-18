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
import { isOriginSource } from "@/lib/observatory-source-config";
import { fetchOriginObservations } from "@/lib/observatory-origin";
import type { RrpPoint } from "@/lib/observatory-constants";

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

export const RRP_KEY = "observatory:rrp";

/**
 * 원출처(뉴욕 연은 운영 결과)로 처음 전체를 다시 쌓았는지 표시 (미션 6).
 * 이 값이 없으면 한 번 전체를 받아 저장분을 **통째로 바꾼다**(FRED 에서 받았던 옛 값·FRED 에만 있던 날을 남기지 않으려고).
 * 그 뒤에는 최근 구간만 받아 합친다. 다시 쌓고 싶으면 이 키를 지운다.
 */
export const RRP_KEY_ORIGIN_MARKER = "observatory:origin-marker:rrp";
const ORIGIN_MARKER_VALUE = "nyfed-rp-v1";
/** 이어 받을 때 마지막 저장일보다 며칠 앞에서부터 다시 받는다(정정·늦은 결제일 반영) */
const ORIGIN_OVERLAP_DAYS = 10;

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
  // 원출처 전환 (lib/observatory-source-config.ts) — FRED 경로는 되돌릴 수 있게 그대로 둔다
  const originMode = isOriginSource(RRP_SERIES_ID);
  const rebuild = originMode && (await redis.get<string>(RRP_KEY_ORIGIN_MARKER)) !== ORIGIN_MARKER_VALUE;
  const backfill = existing.length === 0 || rebuild;
  const observationStart = backfill
    ? RRP_START
    : originMode
      ? shiftDate(existing[existing.length - 1].date, -ORIGIN_OVERLAP_DAYS)
      : existing[existing.length - 1].date;

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey && !originMode) throw new Error("FRED_API_KEY not set");

  const url = `${FRED_BASE}?series_id=${RRP_SERIES_ID}&api_key=${apiKey}&file_type=json&observation_start=${observationStart}`;
  let json: { observations?: FredObs[] };
  if (originMode) {
    json = { observations: await fetchOriginObservations(RRP_SERIES_ID, observationStart) };
  } else {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`FRED ${RRP_SERIES_ID}: ${res.status}`);
    json = (await res.json()) as { observations?: FredObs[] };
  }
  const observations = json.observations ?? [];

  const merged = new Map<string, RrpPoint>((rebuild ? [] : existing).map((p) => [p.date, p]));
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

  // 재구축 결과가 저장분보다 크게 짧으면(응답이 잘렸을 수 있다) 저장하지 않고 에러로 남긴다.
  // 역레포는 FRED 와 같은 기간이라 정상이면 거의 같거나 조금 길다(휴장 전날 운영 7일).
  if (rebuild && series.length < existing.length * 0.9) {
    throw new Error(`원출처 재구축 결과 ${series.length}건 — 저장된 ${existing.length}건보다 크게 적어 저장하지 않음`);
  }
  await redis.set(RRP_KEY, series);
  if (rebuild) await redis.set(RRP_KEY_ORIGIN_MARKER, ORIGIN_MARKER_VALUE);

  const latest = series[series.length - 1];
  return {
    backfill,
    observationStart,
    // 재구축이면 저장분 전체를 바꾼 것이라 '새로 생긴 날'은 이전 저장분 대비로 센다
    added: series.length - (rebuild ? existing.length : before),
    total: series.length,
    latestDate: latest.date,
    latestBalanceBillions: latest.balanceBillions,
  };
}

/** YYYY-MM-DD 를 days 만큼 옮긴다 */
function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
