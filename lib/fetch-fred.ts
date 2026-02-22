const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

interface FredObservation {
  date: string;
  value: string;
}

interface FredResponse {
  observations: FredObservation[];
}

export async function fetchFredLatest(
  seriesId: string,
  count: number = 1
): Promise<FredObservation[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error("FRED_API_KEY not set");

  const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=${count}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
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
