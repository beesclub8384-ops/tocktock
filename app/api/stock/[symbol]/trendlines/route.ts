import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { findBestTrendlines } from "@/lib/trendline";
import type { OHLCData, TrendlineData, TrendlineResponse } from "@/lib/types/stock";

const yahooFinance = new YahooFinance();

interface ChartQuote {
  date: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;

  try {
    const result = await yahooFinance.chart(symbol.toUpperCase(), {
      period1: new Date("1970-01-01"),
      interval: "1wk",
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

    const startIdx = data.findIndex((d) => d.time >= "2020-01-27");
    const analysisData = startIdx >= 0 ? data.slice(startIdx) : data;

    const best = findBestTrendlines(analysisData, { topN: 5 });

    const trendlines: TrendlineData[] = best.map((t) => {
      const price1 = analysisData[t.anchor1][t.direction === "support" ? "low" : "high"];
      const lastIdx = analysisData.length - 1;
      const lastValue = price1 + t.slope * (lastIdx - t.anchor1);

      return {
        direction: t.direction,
        touchCount: t.touchCount,
        points: [
          { time: analysisData[t.anchor1].time, value: Math.round(price1 * 100) / 100 },
          { time: analysisData[lastIdx].time, value: Math.round(lastValue * 100) / 100 },
        ],
      };
    });

    const response: TrendlineResponse = {
      symbol: symbol.toUpperCase(),
      trendlines,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Trendline error:", error);
    return NextResponse.json(
      { error: "Failed to compute trendlines" },
      { status: 500 }
    );
  }
}
