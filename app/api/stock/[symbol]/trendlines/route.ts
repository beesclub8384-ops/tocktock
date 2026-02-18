import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { findBestTrendlines, type TrendlineResult } from "@/lib/trendline";
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

    const { support, resistance, cross } = findBestTrendlines(analysisData);

    // 마지막 데이터로부터 26주 미래까지 연장
    const futureWeeks = 26;
    const lastDate = new Date(analysisData[analysisData.length - 1].time);
    const futureDate = new Date(lastDate);
    futureDate.setDate(futureDate.getDate() + futureWeeks * 7);
    const futureTime = futureDate.toISOString().split("T")[0];

    const toLineData = (t: TrendlineResult): TrendlineData => {
      const futureIdx = analysisData.length - 1 + futureWeeks;
      const futureValue = t.price1 + t.slope * (futureIdx - t.anchor1);
      return {
        direction: t.direction,
        touchCount: t.touchCount,
        points: [
          { time: analysisData[t.anchor1].time, value: t.price1 },
          { time: futureTime, value: Math.round(futureValue * 100) / 100 },
        ],
      };
    };

    const trendlines: TrendlineData[] = [];
    if (support) trendlines.push(toLineData(support));
    if (resistance) trendlines.push(toLineData(resistance));
    if (cross) trendlines.push(toLineData(cross));

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
