import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import {
  KOSPI_TOP20,
  KOSDAQ_TOP20,
  ALL_STOCKS,
  type ForeignOwnershipEntry,
  type StockForeignData,
  type StockInfo,
} from "@/lib/types/foreign-ownership";

export const dynamic = "force-dynamic";

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

async function fetchFromNaver(
  ticker: string,
  startYmd: string,
  endYmd: string
): Promise<ForeignOwnershipEntry[]> {
  const url = `https://api.finance.naver.com/siseJson.naver?symbol=${ticker}&requestType=1&startTime=${startYmd}&endTime=${endYmd}&timeframe=day`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  if (!res.ok) return [];

  const text = await res.text();
  let parsed: unknown[][];
  try {
    parsed = JSON.parse(text.trim().replace(/'/g, '"'));
  } catch {
    return [];
  }

  if (!Array.isArray(parsed) || parsed.length < 2) return [];

  const entries: ForeignOwnershipEntry[] = [];
  for (let i = 1; i < parsed.length; i++) {
    const row = parsed[i];
    if (!Array.isArray(row) || row.length < 7) continue;
    const rawDate = String(row[0]).trim();
    const ratio = Number(row[6]);
    if (rawDate && !isNaN(ratio)) {
      entries.push({
        date: `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`,
        quantity: 0,
        ratio,
      });
    }
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));
  return entries;
}

async function getStockData(
  stock: StockInfo,
  endYmd: string
): Promise<StockForeignData> {
  // 1) Try Redis cache first — stores ALL historical data
  try {
    const cached = await redis.get<ForeignOwnershipEntry[]>(
      `foreign:${stock.ticker}`
    );
    if (cached && Array.isArray(cached) && cached.length > 0) {
      return { name: stock.name, ticker: stock.ticker, data: cached };
    }
  } catch {
    // Redis failed, fall through to NAVER
  }

  // 2) Fallback: fetch max history from NAVER (from 2015)
  try {
    const entries = await fetchFromNaver(stock.ticker, "20150101", endYmd);
    if (entries.length > 0) {
      try {
        await redis.set(`foreign:${stock.ticker}`, entries, { ex: 86400 });
      } catch {
        // Cache write failed
      }
      return { name: stock.name, ticker: stock.ticker, data: entries };
    }
  } catch {
    // NAVER also failed
  }

  return { name: stock.name, ticker: stock.ticker, data: [] };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get("market") || "all";
  const ticker = searchParams.get("ticker");

  const endYmd = formatYmd(new Date());

  let stocks =
    market === "kospi"
      ? KOSPI_TOP20
      : market === "kosdaq"
        ? KOSDAQ_TOP20
        : ALL_STOCKS;

  if (ticker) {
    stocks = stocks.filter((s) => s.ticker === ticker);
    if (stocks.length === 0) {
      return NextResponse.json({
        stocks: [],
        message: "종목을 찾을 수 없습니다.",
      });
    }
  }

  // Fetch all stocks in parallel (batched)
  const BATCH_SIZE = 5;
  const results: StockForeignData[] = [];

  for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
    const batch = stocks.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((s) => getStockData(s, endYmd))
    );
    results.push(...batchResults);
  }

  return NextResponse.json({ stocks: results });
}
