import { isSiteOriginSeries } from "@/lib/site-source-config";
import { siteObservations } from "@/lib/site-origin";

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

interface FredObservation {
  date: string;
  value: string;
}

interface FredResponse {
  observations: FredObservation[];
}

/**
 * 최신 관측치 count 행 (내림차순, "." 제외). 이름은 예전 그대로지만 원출처로 전환한 시리즈는 원출처에서 받는다
 * (미션 8, lib/site-source-config.ts — SITE_DATA_SOURCE=fred 면 FRED). FRED 와 같은 모양의 행을 만들어 돌려준다.
 * 이 파일을 쓰는 시리즈(전역 지표 7개)는 값이 같고, 장단기 금리차(T10Y2Y)만 최신일이 FRED 보다 하루 늦을 수 있다(결정 로그 20-3).
 */
export async function fetchFredLatest(
  seriesId: string,
  count: number = 1
): Promise<FredObservation[]> {
  if (isSiteOriginSeries(seriesId)) {
    const rows = await siteObservations(seriesId, { sortOrder: "desc", limit: count });
    return rows.filter((o) => o.value !== ".");
  }
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error("FRED_API_KEY not set");

  const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=${count}`;
  const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`FRED ${seriesId}: ${res.status}`);

  const json: FredResponse = await res.json();
  // FRED returns "." for missing values — filter them out
  return json.observations.filter((o) => o.value !== ".");
}

/** "2026-09-01" 에서 n 달 이동 */
function shiftMonth(ymd: string, n: number): string {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, "0")}-01`;
}

/**
 * 전년 동월 대비 % — 최신 관측월과 **정확히 12개월 전 같은 달**을 날짜로 찾아 비교한다.
 * (미션 9 정정: 예전에는 "." 행을 걸러낸 목록의 13번째 값을 12개월 전으로 써서, 2025-10 CPI 처럼 빠진 달이 있으면
 *  13개월 전과 비교했다 — 결정 로그 21-3.) 12개월 전 달 값이 없으면 null.
 */
export function calcYoY(observations: FredObservation[]): number | null {
  if (observations.length === 0) return null;
  const latestObs = observations[0];
  const ago = observations.find((o) => o.date === shiftMonth(latestObs.date, -12));
  if (!ago) return null;
  const latest = parseFloat(latestObs.value);
  const yearAgo = parseFloat(ago.value);
  if (isNaN(latest) || isNaN(yearAgo) || yearAgo === 0) return null;
  return ((latest - yearAgo) / yearAgo) * 100;
}

/** 전월 대비 차이 — 최신 관측월과 바로 앞 달을 날짜로 찾아 비교한다(앞 달 값이 없으면 null, 미션 9) */
export function calcMoM(observations: FredObservation[]): number | null {
  if (observations.length === 0) return null;
  const latestObs = observations[0];
  const prevObs = observations.find((o) => o.date === shiftMonth(latestObs.date, -1));
  if (!prevObs) return null;
  const latest = parseFloat(latestObs.value);
  const prev = parseFloat(prevObs.value);
  if (isNaN(latest) || isNaN(prev)) return null;
  return latest - prev;
}
