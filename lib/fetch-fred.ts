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

/** YoY% from 13 monthly observations (latest vs 12 months ago) */
export function calcYoY(observations: FredObservation[]): number | null {
  // observations are desc-sorted; [0] = latest, [12] = 12 months ago
  if (observations.length < 13) return null;
  const latest = parseFloat(observations[0].value);
  const yearAgo = parseFloat(observations[12].value);
  if (isNaN(latest) || isNaN(yearAgo) || yearAgo === 0) return null;
  return ((latest - yearAgo) / yearAgo) * 100;
}

/** MoM change from 2 observations (latest - previous) */
export function calcMoM(observations: FredObservation[]): number | null {
  if (observations.length < 2) return null;
  const latest = parseFloat(observations[0].value);
  const prev = parseFloat(observations[1].value);
  if (isNaN(latest) || isNaN(prev)) return null;
  return latest - prev;
}
