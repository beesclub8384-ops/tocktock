/**
 * 관측소 — 주가지수 수집 및 저장 (오버레이용 참고 데이터)
 *
 * ⚠ 이건 관측소 "지표" 가 아니다. 신호등 판정도, 인덱스 카드도, 전용 페이지도
 *   없다. SRF 차트 위에 겹쳐 그려 "배관의 비명이 주가 하락에 선행하는가" 를
 *   눈으로 보려고 두는 참고 데이터일 뿐이다.
 *   그래서 lib/observatory-catalog.ts 에도 넣지 않고, 판정 함수가 모여 있는
 *   lib/observatory-constants.ts 에도 타입을 두지 않는다. 여기서 끝낸다.
 *
 * 데이터 출처는 FRED 하나만 사용한다.
 *  - NASDAQCOM: NASDAQ Composite (일간 종가)
 *  - SP500:     S&P 500 (일간 종가)
 *
 * ⚠ 단위 — 둘 다 **지수 포인트** 다. 변환하지 않는다. (2026-09-09 실측)
 *     NASDAQCOM units = "Index Feb 5, 1971=100"  → 2026-09-08 값 26421.41
 *     SP500     units = "Index"                  → 2026-09-08 값 7673.52
 *   금액이 아니므로 다른 관측소 시리즈처럼 ÷1000 같은 걸 하면 안 된다.
 *
 * ⚠ SP500 은 FRED 가 **최근 10년만** 제공한다 (라이선스 제약, 창이 매일 앞으로
 *   밀린다). 2026-09-09 시점 관측 시작일이 2016-09-09 다. 반면 NASDAQCOM 은
 *   1971년부터 있다. 그래서 두 지수의 시작일이 다르고, 차트에서 정규화
 *   기준일도 시리즈마다 따로 잡는다.
 *   여기서는 병합 저장이라, 한번 받아둔 S&P 과거 값은 FRED 가 창 밖으로
 *   밀어내도 우리 Redis 에 남는다 (다만 최초 수집 시점 이전으로 소급되지는 않는다).
 */
import { redis } from "@/lib/redis";

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

export const MARKET_INDEX_KEY = "observatory:market-index";

/**
 * 수집 시작일. SRF 시계열 시작일(2000-01-03)에 맞춘다.
 * 이 데이터는 SRF 차트에 겹쳐 그리는 용도라 그 이전은 받아도 쓸 데가 없다.
 */
export const MARKET_INDEX_START = "2000-01-03";

export const NASDAQ_SERIES_ID = "NASDAQCOM";
export const SP500_SERIES_ID = "SP500";

export interface MarketIndexPoint {
  /** YYYY-MM-DD */
  date: string;
  /** 나스닥 종합 지수 포인트. 그날 값이 없으면 undefined */
  nasdaq?: number;
  /** S&P 500 지수 포인트. 그날 값이 없으면 undefined */
  sp500?: number;
}

interface FredObs {
  date: string;
  value: string;
}

/** FRED 는 휴장일을 "." 로 준다. 결측은 건너뛴다 (0 으로 채우면 폭락으로 보인다) */
function toIndexValue(v: string): number | null {
  if (v === "." || v === "") return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** 시리즈 하나를 조회해 date → 지수값 맵으로 반환 */
async function fetchFredSeries(
  seriesId: string,
  observationStart: string
): Promise<Map<string, number>> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error("FRED_API_KEY not set");

  const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${observationStart}`;
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`FRED ${seriesId}: ${res.status}`);

  const json = (await res.json()) as { observations?: FredObs[] };
  const map = new Map<string, number>();
  for (const o of json.observations ?? []) {
    const v = toIndexValue(o.value);
    if (v !== null) map.set(o.date, v);
  }
  return map;
}

/** Redis 에 저장된 시계열 (날짜 오름차순). 없으면 빈 배열 */
export async function loadMarketIndex(): Promise<MarketIndexPoint[]> {
  // @upstash/redis 는 직렬화/역직렬화를 자동 처리한다 (JSON.parse 금지)
  const stored = await redis.get<MarketIndexPoint[]>(MARKET_INDEX_KEY);
  return Array.isArray(stored) ? stored : [];
}

export interface MarketIndexCollectResult {
  /** 이번 실행이 전체 백필이었는지 */
  backfill: boolean;
  /** FRED 조회 시작일 */
  observationStart: string;
  /** 이번 실행으로 새로 추가된 날짜 수 */
  added: number;
  /** 저장 후 전체 데이터 수 */
  total: number;
  latestDate: string | null;
  latestNasdaq: number | null;
  latestSp500: number | null;
}

/**
 * FRED 에서 나스닥·S&P 500 을 가져와 날짜로 병합해 Redis 에 저장한다.
 *
 * ⚠ SOFR−IORB 수집과 구조는 같지만 병합 조건이 다르다. 거기서는 두 시리즈에
 *   모두 값이 있는 날만 쓰지만(스프레드를 만들어야 하므로), 여기서는
 *   **한쪽만 있어도 저장한다**. 둘 다 있어야 한다고 만들면 S&P 가 없는
 *   2016년 이전 나스닥이 통째로 버려진다.
 *
 * Redis 가 비어 있으면 MARKET_INDEX_START 부터 전체 백필,
 * 있으면 마지막 저장일부터 증분 수집한다.
 */
export async function collectMarketIndex(): Promise<MarketIndexCollectResult> {
  const existing = await loadMarketIndex();
  const backfill = existing.length === 0;
  const observationStart = backfill
    ? MARKET_INDEX_START
    : existing[existing.length - 1].date;

  const [nasdaqMap, sp500Map] = await Promise.all([
    fetchFredSeries(NASDAQ_SERIES_ID, observationStart),
    fetchFredSeries(SP500_SERIES_ID, observationStart),
  ]);

  const merged = new Map<string, MarketIndexPoint>(existing.map((p) => [p.date, p]));
  const before = merged.size;

  // 두 시리즈에 등장한 모든 날짜의 합집합을 돈다 (한쪽만 있어도 저장)
  const allDates = new Set<string>([...nasdaqMap.keys(), ...sp500Map.keys()]);
  for (const date of allDates) {
    const prev = merged.get(date);
    const nasdaq = nasdaqMap.get(date) ?? prev?.nasdaq;
    const sp500 = sp500Map.get(date) ?? prev?.sp500;
    const point: MarketIndexPoint = { date };
    // undefined 키를 넣지 않는다 (Redis 에 null 로 저장되어 되읽을 때 지저분해진다)
    if (nasdaq !== undefined) point.nasdaq = nasdaq;
    if (sp500 !== undefined) point.sp500 = sp500;
    merged.set(date, point);
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
      latestNasdaq: null,
      latestSp500: null,
    };
  }

  await redis.set(MARKET_INDEX_KEY, series);

  const latest = series[series.length - 1];
  return {
    backfill,
    observationStart,
    added: series.length - before,
    total: series.length,
    latestDate: latest.date,
    latestNasdaq: latest.nasdaq ?? null,
    latestSp500: latest.sp500 ?? null,
  };
}
