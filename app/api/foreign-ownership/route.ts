import { NextRequest, NextResponse } from "next/server";
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

async function getRedis() {
  try {
    const { redis } = await import("@/lib/redis");
    return redis;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") || "1m";
  const market = searchParams.get("market") || "all";
  const ticker = searchParams.get("ticker");

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

  const redis = await getRedis();
  const results: StockForeignData[] = [];

  for (const stock of stocks) {
    let data: ForeignOwnershipEntry[] = [];

    if (redis) {
      try {
        const cached = await redis.get<ForeignOwnershipEntry[]>(
          `foreign:${stock.ticker}`
        );
        if (cached && Array.isArray(cached)) {
          data = cached.filter((e) => e.date >= startDate);
        }
      } catch {
        // Redis read failed for this stock, continue with empty data
      }
    }

    results.push({
      name: stock.name,
      ticker: stock.ticker,
      data,
    });
  }

  return NextResponse.json({ stocks: results });
}
