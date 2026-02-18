import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { findChannels, type ChannelResult } from "@/lib/trendline";
import type { OHLCData, ChannelData, TrendlineResponse } from "@/lib/types/stock";

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
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const { searchParams } = request.nextUrl;

  const pivotN = Number(searchParams.get("pivotN")) || 10;
  const dropThreshold = (Number(searchParams.get("dropThreshold")) || -30) / 100;
  const tunnelTolerance = (Number(searchParams.get("tunnelTolerance")) || 2) / 100;

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

    const { uptrend, downtrend } = findChannels(analysisData, {
      pivotN,
      dropThreshold,
      tunnelTolerance,
    });

    const futureWeeks = 26;
    const lastDate = new Date(analysisData[analysisData.length - 1].time);
    const futureDate = new Date(lastDate);
    futureDate.setDate(futureDate.getDate() + futureWeeks * 7);
    const futureTime = futureDate.toISOString().split("T")[0];

    const toChannelData = (ch: ChannelResult, dir: "uptrend" | "downtrend"): ChannelData => {
      const futureIdx = analysisData.length - 1 + futureWeeks;
      const mainFutureValue = ch.price1 + ch.slope * (futureIdx - ch.anchor1);
      const tunnelStartValue = ch.price1 + ch.tunnelOffset;
      const tunnelFutureValue = mainFutureValue + ch.tunnelOffset;

      return {
        direction: dir,
        mainLine: [
          { time: analysisData[ch.anchor1].time, value: Math.round(ch.price1 * 100) / 100 },
          { time: futureTime, value: Math.round(mainFutureValue * 100) / 100 },
        ],
        mainTouchCount: ch.touchCount,
        tunnelLine: [
          { time: analysisData[ch.anchor1].time, value: Math.round(tunnelStartValue * 100) / 100 },
          { time: futureTime, value: Math.round(tunnelFutureValue * 100) / 100 },
        ],
        tunnelTouchCount: ch.tunnelTouchCount,
      };
    };

    const channels: ChannelData[] = [];
    if (uptrend) channels.push(toChannelData(uptrend, "uptrend"));
    if (downtrend) channels.push(toChannelData(downtrend, "downtrend"));

    const response: TrendlineResponse = {
      symbol: symbol.toUpperCase(),
      channels,
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
