/**
 * 관측소 4 — 국채시장: 10년물 금리 실현변동성(MOVE 대리) 원자료 수집
 *
 * 출처: FRED DGS10 (Market Yield on U.S. Treasury Securities at 10-Year Constant Maturity,
 *       %, 일간, 1962-01-02 시작). 원자료는 연준 H.15.
 * 2000-01-01 이후만 저장한다. 판정은 최근 10년 창만 쓰므로 그 앞은 필요 없다.
 *
 * 결측(".", 휴장일)은 건너뛴다. 0 으로 채우면 하루 변화가 수백 bp 로 튀어 변동성이 망가진다.
 * 과거 값 정정에 대비해 매번 전체(약 6,700건)를 받아 덮어쓴다.
 */
import { redis } from "@/lib/redis";
import { isOriginSource } from "@/lib/observatory-source-config";
import { fetchOriginObservations } from "@/lib/observatory-origin";
import { assertNotShrunk } from "@/lib/observatory-series-guard";
import type { YieldPoint } from "@/lib/observatory-constants";

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

export const RATE_VOL_KEY = "observatory:rate-vol-dgs10";
export const RATE_VOL_SERIES_ID = "DGS10";
export const RATE_VOL_START = "2000-01-01";

export async function loadYields(): Promise<YieldPoint[]> {
  // @upstash/redis 는 직렬화/역직렬화를 자동 처리한다 (JSON.parse 금지)
  const stored = await redis.get<YieldPoint[]>(RATE_VOL_KEY);
  return Array.isArray(stored) ? stored : [];
}

export interface RateVolCollectResult {
  total: number;
  added: number;
  latestDate: string | null;
}

export async function collectYields(): Promise<RateVolCollectResult> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey && !isOriginSource(RATE_VOL_SERIES_ID)) throw new Error("FRED_API_KEY not set");
  const existing = await loadYields();
  const url = `${FRED_BASE}?series_id=${RATE_VOL_SERIES_ID}&api_key=${apiKey}&file_type=json&observation_start=${RATE_VOL_START}`;
  // 원출처 전환 (lib/observatory-source-config.ts) — FRED 경로는 되돌릴 수 있게 그대로 둔다
  let json: { observations?: { date: string; value: string }[] };
  if (isOriginSource(RATE_VOL_SERIES_ID)) {
    json = { observations: await fetchOriginObservations(RATE_VOL_SERIES_ID, RATE_VOL_START) };
  } else {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`FRED ${RATE_VOL_SERIES_ID}: ${res.status}`);
    json = (await res.json()) as { observations?: { date: string; value: string }[] };
  }
  const points: YieldPoint[] = [];
  for (const o of json.observations ?? []) {
    if (!o.date || o.value === "." || o.value === "") continue;
    const v = parseFloat(o.value);
    if (Number.isFinite(v)) points.push({ date: o.date, yieldPct: v });
  }
  if (points.length === 0) throw new Error(`FRED ${RATE_VOL_SERIES_ID}: 관측치 0건`);
  // 잘린 응답으로 저장분을 덮어쓰지 않는다
  assertNotShrunk(`FRED ${RATE_VOL_SERIES_ID}`, points.map((p) => p.date), existing.map((p) => p.date));
  await redis.set(RATE_VOL_KEY, points);
  return { total: points.length, added: points.length - existing.length, latestDate: points[points.length - 1].date };
}
