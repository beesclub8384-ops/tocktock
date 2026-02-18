import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import type { ChartInterval, OHLCData, StockChartResponse } from "@/lib/types/stock";

const yahooFinance = new YahooFinance();

interface ChartQuote {
  date: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

const INTERVAL_CONFIG: Record<ChartInterval, { months: number }> = {
  "1d": { months: 6 },
  "1wk": { months: 24 },
  "1mo": { months: 60 },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const { searchParams } = request.nextUrl;
  const interval = (searchParams.get("interval") || "1d") as ChartInterval;

  if (!INTERVAL_CONFIG[interval]) {
    return NextResponse.json(
      { error: "Invalid interval. Use 1d, 1wk, or 1mo" },
      { status: 400 }
    );
  }

  const { months } = INTERVAL_CONFIG[interval];
  const period1 = new Date();
  period1.setMonth(period1.getMonth() - months);

  try {
    const result = await yahooFinance.chart(symbol.toUpperCase(), {
      period1,
      interval,
      return: "array",
    } as Parameters<typeof yahooFinance.chart>[1]);

    const quotes = (result as unknown as { quotes: ChartQuote[] }).quotes;

    const data: OHLCData[] = quotes
      .filter((q) => q.open != null && q.high != null && q.low != null && q.close != null)
      .map((q) => ({
        time: new Date(q.date).toISOString().split("T")[0],
        open: Math.round(q.open! * 100) / 100,
        high: Math.round(q.high! * 100) / 100,
        low: Math.round(q.low! * 100) / 100,
        close: Math.round(q.close! * 100) / 100,
        volume: q.volume ?? 0,
      }));

    const response: StockChartResponse = {
      symbol: symbol.toUpperCase(),
      interval,
      data,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Yahoo Finance error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stock data" },
      { status: 500 }
    );
  }
}
