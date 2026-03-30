import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { redis } from "@/lib/redis";
import type { MarketEventsStore } from "@/lib/types/market-events";
import { WATCHED_SYMBOLS } from "@/lib/types/market-events";

const yahooFinance = new YahooFinance();
const REDIS_KEY = "market-events:v1";

interface OHLCPoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function GET() {
  try {
    // 1. Redis에서 이벤트 데이터 조회
    const data = await redis.get<MarketEventsStore>(REDIS_KEY);
    const events = data?.events
      ? [...data.events].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        )
      : [];

    // 2. 4개 지수의 최근 1년치 OHLC 데이터 조회
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const ohlcResults = await Promise.allSettled(
      WATCHED_SYMBOLS.map(async (idx) => {
        const result = await yahooFinance.chart(idx.symbol, {
          period1: oneYearAgo.toISOString().slice(0, 10),
          interval: "1d",
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const quotes: OHLCPoint[] = (result.quotes as any[])
          .filter(
            (q) =>
              q.date && q.open != null && q.high != null && q.low != null && q.close != null
          )
          .map((q) => ({
            time: new Date(q.date).toISOString().slice(0, 10),
            open: Number(q.open.toFixed(2)),
            high: Number(q.high.toFixed(2)),
            low: Number(q.low.toFixed(2)),
            close: Number(q.close.toFixed(2)),
            volume: Number(q.volume ?? 0),
          }));

        return { symbol: idx.symbol, quotes };
      })
    );

    const ohlc: Record<string, OHLCPoint[]> = {};
    for (const r of ohlcResults) {
      if (r.status === "fulfilled") {
        ohlc[r.value.symbol] = r.value.quotes;
      }
    }

    return NextResponse.json(
      { events, ohlc, lastUpdated: data?.lastUpdated ?? null },
      {
        headers: { "Cache-Control": "max-age=0, no-cache" },
      }
    );
  } catch (error) {
    console.error("[market-events] API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch market events" },
      { status: 500 }
    );
  }
}
