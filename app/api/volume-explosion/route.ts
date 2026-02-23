import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import {
  KOSPI_TOP20,
  KOSDAQ_TOP20,
  ALL_STOCKS,
  type StockInfo,
} from "@/lib/types/foreign-ownership";

export const dynamic = "force-dynamic";

interface VolumeEntry {
  date: string;
  close: number;
  volume: number;
  tradingValue: number; // close * volume
}

interface StockVolumeData {
  name: string;
  ticker: string;
  market: "kospi" | "kosdaq";
  latestDate: string;
  latestTradingValue: number;
  avgTradingValue20: number;
  explosionRatio: number;
  latestClose: number;
  latestChange: number;
  latestChangeRate: number;
  sparkline: number[]; // last 30 days trading values
  history: VolumeEntry[]; // full history for modal chart
}

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
): Promise<VolumeEntry[]> {
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

  const entries: VolumeEntry[] = [];
  for (let i = 1; i < parsed.length; i++) {
    const row = parsed[i];
    if (!Array.isArray(row) || row.length < 6) continue;
    const rawDate = String(row[0]).trim();
    const close = Number(row[4]);
    const volume = Number(row[5]);
    if (rawDate && !isNaN(close) && !isNaN(volume) && close > 0) {
      entries.push({
        date: `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`,
        close,
        volume,
        tradingValue: close * volume,
      });
    }
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));
  return entries;
}

function isMarket(ticker: string): "kospi" | "kosdaq" {
  return KOSPI_TOP20.some((s) => s.ticker === ticker) ? "kospi" : "kosdaq";
}

function isCacheFresh(data: VolumeEntry[]): boolean {
  if (data.length === 0) return false;
  const newest = data[data.length - 1].date;
  const now = new Date();
  const diff =
    (now.getTime() - new Date(newest).getTime()) / (1000 * 60 * 60 * 24);
  // Fresh if latest data is within 4 days (weekend + 1 buffer)
  return diff <= 4;
}

async function getStockVolumeData(
  stock: StockInfo,
  endYmd: string,
  startYmd: string
): Promise<StockVolumeData | null> {
  let entries: VolumeEntry[] = [];

  // Try Redis cache
  try {
    const cached = await redis.get<VolumeEntry[]>(
      `volume:${stock.ticker}`
    );
    if (cached && Array.isArray(cached) && isCacheFresh(cached)) {
      entries = cached;
    }
  } catch {
    // Redis failed
  }

  // Fetch from Naver if cache miss
  if (entries.length === 0) {
    try {
      entries = await fetchFromNaver(stock.ticker, startYmd, endYmd);
      if (entries.length > 0) {
        try {
          await redis.set(`volume:${stock.ticker}`, entries, { ex: 86400 });
        } catch {
          // Cache write failed
        }
      }
    } catch {
      // Naver failed
    }
  }

  // Need at least 21 entries for 20-day average + latest
  if (entries.length < 21) return null;

  const latest = entries[entries.length - 1];
  const prev = entries[entries.length - 2];

  // 20-day average (excluding latest)
  const last20 = entries.slice(-21, -1);
  const avgTv =
    last20.reduce((sum, e) => sum + e.tradingValue, 0) / last20.length;

  // Guard against near-zero average
  if (avgTv < 1_000_000) return null;

  const ratio = latest.tradingValue / avgTv;
  const change = latest.close - prev.close;
  const changeRate = (change / prev.close) * 100;

  // Sparkline: last 30 entries
  const sparkline = entries.slice(-30).map((e) => e.tradingValue);

  return {
    name: stock.name,
    ticker: stock.ticker,
    market: isMarket(stock.ticker),
    latestDate: latest.date,
    latestTradingValue: latest.tradingValue,
    avgTradingValue20: avgTv,
    explosionRatio: Math.round(ratio * 100) / 100,
    latestClose: latest.close,
    latestChange: change,
    latestChangeRate: Math.round(changeRate * 100) / 100,
    sparkline,
    history: entries,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get("market") || "all";
  const ticker = searchParams.get("ticker");

  const now = new Date();
  const endYmd = formatYmd(now);
  const fourMonthsAgo = new Date(now);
  fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);
  const startYmd = formatYmd(fourMonthsAgo);

  let stocks: StockInfo[] =
    market === "kospi"
      ? KOSPI_TOP20
      : market === "kosdaq"
        ? KOSDAQ_TOP20
        : ALL_STOCKS;

  if (ticker) {
    stocks = stocks.filter((s) => s.ticker === ticker);
    if (stocks.length === 0) {
      return NextResponse.json({ stocks: [] });
    }
  }

  const BATCH_SIZE = 5;
  const results: StockVolumeData[] = [];

  for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
    const batch = stocks.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((s) => getStockVolumeData(s, endYmd, startYmd))
    );
    for (const r of batchResults) {
      if (r) results.push(r);
    }
  }

  // Sort by explosion ratio descending
  results.sort((a, b) => b.explosionRatio - a.explosionRatio);

  return NextResponse.json({ stocks: results });
}
