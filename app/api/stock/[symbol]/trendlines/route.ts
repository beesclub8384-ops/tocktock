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

    const all = findBestTrendlines(analysisData, { topN: 50, tolerance: 0.01 });

    // 마지막 데이터로부터 26주(약 6개월) 미래까지 연장
    const futureWeeks = 26;
    const lastDate = new Date(analysisData[analysisData.length - 1].time);
    const futureDate = new Date(lastDate);
    futureDate.setDate(futureDate.getDate() + futureWeeks * 7);
    const futureTime = futureDate.toISOString().split("T")[0];

    const toLineData = (t: typeof all[number], dir: "support" | "resistance" | "cross"): TrendlineData => {
      const priceKey = t.direction === "support" ? "low" : "high";
      const price1 = analysisData[t.anchor1][priceKey];
      const futureIdx = analysisData.length - 1 + futureWeeks;
      const futureValue = price1 + t.slope * (futureIdx - t.anchor1);
      return {
        direction: dir,
        touchCount: t.touchCount,
        points: [
          { time: analysisData[t.anchor1].time, value: Math.round(price1 * 100) / 100 },
          { time: futureTime, value: Math.round(futureValue * 100) / 100 },
        ],
      };
    };

    const trendlines: TrendlineData[] = [];

    // 상승 추세선: 지지선(low) 중 slope > 0, 터치 최다
    const uptrend = all.find((t) => t.direction === "support" && t.slope > 0);
    if (uptrend) trendlines.push(toLineData(uptrend, "support"));

    // 하락 추세선: 저항선(high) 중 slope < 0, 터치 최다
    const downtrend = all.find((t) => t.direction === "resistance" && t.slope < 0);
    if (downtrend) trendlines.push(toLineData(downtrend, "resistance"));

    // 크로스 선: 전체(지지+저항) 중 터치 최다 (위 2개와 중복 제외)
    const cross = all.find((t) => t !== uptrend && t !== downtrend);
    if (cross) trendlines.push(toLineData(cross, "cross"));

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
