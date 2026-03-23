import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import yahooFinance from "yahoo-finance2";

const CACHE_KEY = "oil-prices:v5";
const CACHE_TTL = 21600; // 6시간

interface ChartQuote {
  date: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
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

async function fetchYahooSeries(symbol: string): Promise<OilSeries> {
  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

  const result = await yahooFinance.chart(symbol, {
    period1: fiveYearsAgo,
    period2: new Date(),
    interval: "1d",
    return: "array",
  } as Parameters<typeof yahooFinance.chart>[1]);

  const quotes = (result as unknown as { quotes: ChartQuote[] }).quotes;

  // close가 null인 항목 필터링 (주말/공휴일)
  const history = quotes
    .filter((q) => q.close != null)
    .map((q) => ({
      date: new Date(q.date).toISOString().split("T")[0],
      value: Math.round(q.close! * 100) / 100,
    }));

  const current = history[history.length - 1]?.value ?? 0;
  const prev = history[history.length - 2]?.value ?? current;
  const change = Math.round((current - prev) * 100) / 100;
  const changePct = prev !== 0 ? Math.round(((current - prev) / prev) * 10000) / 100 : 0;

  return { current, change, changePct, history };
}

export async function GET() {
  try {
    // 캐시 확인
    const cached = await redis.get<OilPricesData>(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Yahoo Finance에서 두 시리즈 동시 fetch
    // BZ=F = 브렌트, CL=F = WTI
    const [brent, wti] = await Promise.all([
      fetchYahooSeries("BZ=F"),
      fetchYahooSeries("CL=F"),
    ]);

    const result: OilPricesData = {
      brent,
      wti,
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
