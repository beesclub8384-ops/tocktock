import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import {
  KOSPI_TOP20,
  KOSDAQ_TOP20,
  ALL_STOCKS,
  type ForeignOwnershipEntry,
  type StockForeignData,
} from "@/lib/types/foreign-ownership";

export const revalidate = 3600;

function getDateRange(period: string): string {
  const now = new Date();
  const start = new Date(now);
  if (period === "1m") start.setMonth(start.getMonth() - 1);
  else if (period === "3m") start.setMonth(start.getMonth() - 3);
  else start.setMonth(start.getMonth() - 6);
  return start.toISOString().split("T")[0];
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") || "1m";
  const market = searchParams.get("market") || "all";
  const ticker = searchParams.get("ticker");
  const debug = searchParams.get("debug") === "1";

  const startDate = getDateRange(period);

  let stocks =
    market === "kospi"
      ? KOSPI_TOP20
      : market === "kosdaq"
        ? KOSDAQ_TOP20
        : ALL_STOCKS;

  if (ticker) {
    stocks = stocks.filter((s) => s.ticker === ticker);
    if (stocks.length === 0) {
      return NextResponse.json({ stocks: [], message: "종목을 찾을 수 없습니다." });
    }
  }

  const results: StockForeignData[] = [];
  const debugInfo: Record<string, unknown>[] = [];

  for (const stock of stocks) {
    let data: ForeignOwnershipEntry[] = [];

    try {
      const key = `foreign:${stock.ticker}`;
      const raw = await redis.get(key);

      if (debug) {
        debugInfo.push({
          ticker: stock.ticker,
          key,
          rawType: typeof raw,
          isArray: Array.isArray(raw),
          rawLength: Array.isArray(raw) ? raw.length : null,
          rawSample: raw ? JSON.stringify(raw).slice(0, 200) : null,
        });
      }

      if (raw && Array.isArray(raw)) {
        data = (raw as ForeignOwnershipEntry[]).filter(
          (e) => e.date >= startDate
        );
      }
    } catch (err) {
      if (debug) {
        debugInfo.push({
          ticker: stock.ticker,
          error: String(err),
        });
      }
    }

    results.push({
      name: stock.name,
      ticker: stock.ticker,
      data,
    });
  }

  const response: Record<string, unknown> = { stocks: results };
  if (debug) {
    response.debug = debugInfo;
    response.startDate = startDate;
    response.redisUrl = process.env.UPSTASH_REDIS_REST_URL
      ? "set (" + process.env.UPSTASH_REDIS_REST_URL.slice(0, 20) + "...)"
      : "NOT SET";
  }

  return NextResponse.json(response);
}
