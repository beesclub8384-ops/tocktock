import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";
const CACHE_KEY = "oil-prices:v5";
const CACHE_TTL = 21600; // 6시간

interface FredObservation {
  date: string;
  value: string;
}

interface OilSeries {
  current: number;
  change: number;
  changePct: number;
  history: { date: string; value: number }[];
}

interface OilPricesData {
  brent: OilSeries;
  wti: OilSeries;
  updatedAt: string;
}

async function fetchFredSeries(seriesId: string): Promise<{ date: string; value: number }[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error("FRED_API_KEY not set");

  const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=1500`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`FRED ${seriesId}: ${res.status}`);

  const json = await res.json();
  const observations: FredObservation[] = json.observations;

  return observations
    .filter((o) => o.value !== ".")
    .map((o) => ({ date: o.date, value: parseFloat(o.value) }))
    .filter((o) => !isNaN(o.value));
}

function buildSeries(data: { date: string; value: number }[]): OilSeries {
  // data는 desc 정렬 → 차트용으로 asc 변환
  const history = [...data].reverse();
  const current = data[0]?.value ?? 0;
  const prev = data[1]?.value ?? current;
  const change = current - prev;
  const changePct = prev !== 0 ? (change / prev) * 100 : 0;

  return { current, change, changePct, history };
}

export async function GET() {
  try {
    // 캐시 확인
    const cached = await redis.get<OilPricesData>(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    // FRED API에서 두 시리즈 동시 fetch
    const [brentData, wtiData] = await Promise.all([
      fetchFredSeries("DCOILBRENTEU"),
      fetchFredSeries("DCOILWTICO"),
    ]);

    const result: OilPricesData = {
      brent: buildSeries(brentData),
      wti: buildSeries(wtiData),
      updatedAt: new Date().toISOString(),
    };

    // Redis 캐시 저장 (JSON.stringify 금지 — @upstash/redis 자동 직렬화)
    await redis.set(CACHE_KEY, result, { ex: CACHE_TTL });

    return NextResponse.json(result);
  } catch (err) {
    console.error("Oil prices API error:", err);
    return NextResponse.json(
      { error: "Failed to fetch oil prices" },
      { status: 500 }
    );
  }
}
