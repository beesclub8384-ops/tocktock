import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { redis } from "@/lib/redis";

const yahooFinance = new YahooFinance();

const CACHE_KEY = "usd-krw:v1";
const CACHE_TTL = 60; // 60초

interface CachedData {
  price: number;
  change: number;
  changePercent: number;
}

export async function GET() {
  try {
    const cached = await redis.get<CachedData>(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    const result = await yahooFinance.quote("USDKRW=X");
    const quote = result as unknown as {
      regularMarketPrice?: number;
      regularMarketChange?: number;
      regularMarketChangePercent?: number;
    };

    const data: CachedData = {
      price: quote.regularMarketPrice ?? 0,
      change: quote.regularMarketChange ?? 0,
      changePercent: quote.regularMarketChangePercent ?? 0,
    };

    try {
      await redis.set(CACHE_KEY, data, { ex: CACHE_TTL });
    } catch {
      /* cache write fail ok */
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("USD/KRW quote error:", error);
    return NextResponse.json(
      { error: "Failed to fetch USD/KRW" },
      { status: 500 },
    );
  }
}
