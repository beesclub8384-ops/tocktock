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

// Check if cached data has enough history (at least 1 year span)
function hasEnoughHistory(data: ForeignOwnershipEntry[]): boolean {
  if (data.length < 200) return false;
  const oldest = data[0].date;
  const newest = data[data.length - 1].date;
  const oldestYear = Number(oldest.slice(0, 4));
  const newestYear = Number(newest.slice(0, 4));
  const oldestMonth = Number(oldest.slice(5, 7));
  const newestMonth = Number(newest.slice(5, 7));
  const spanMonths = (newestYear - oldestYear) * 12 + (newestMonth - oldestMonth);
  return spanMonths >= 12;
}

async function getStockData(
  stock: StockInfo,
  endYmd: string,
  fetchStartYmd: string
): Promise<StockForeignData> {
  // 1) Try Redis cache — only use if it has enough history (≥1 year)
  try {
    const cached = await redis.get<ForeignOwnershipEntry[]>(
      `foreign:${stock.ticker}`
    );
    if (cached && Array.isArray(cached) && hasEnoughHistory(cached)) {
      return { name: stock.name, ticker: stock.ticker, data: cached };
    }
  } catch {
    // Redis failed, fall through to NAVER
  }

  // 2) Fetch from NAVER and update Redis
  try {
    const entries = await fetchFromNaver(stock.ticker, fetchStartYmd, endYmd);
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

  // 3) If NAVER failed, still return whatever Redis had
  try {
    const cached = await redis.get<ForeignOwnershipEntry[]>(
      `foreign:${stock.ticker}`
    );
    if (cached && Array.isArray(cached) && cached.length > 0) {
      return { name: stock.name, ticker: stock.ticker, data: cached };
    }
  } catch {
    // Nothing available
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

  // Single ticker (modal) → fetch full history from 2015 for all period buttons
  // Bulk (card grid) → fetch 2 years for 1-year sparklines (lighter & faster)
  const now = new Date();
  const twoYearsAgo = new Date(now);
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const fetchStartYmd = ticker ? "20150101" : formatYmd(twoYearsAgo);

  const BATCH_SIZE = 5;
  const results: StockForeignData[] = [];

  for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
    const batch = stocks.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((s) => getStockData(s, endYmd, fetchStartYmd))
    );
    results.push(...batchResults);
  }

  return NextResponse.json({ stocks: results });
}
