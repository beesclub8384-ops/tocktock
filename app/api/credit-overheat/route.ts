import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { fetchCreditBalanceData } from "@/lib/fetch-credit-balance";
import type { OverheatIndexResponse } from "@/lib/types/credit-balance";

const yahooFinance = new YahooFinance();

export const revalidate = 3600;

interface ChartQuote {
  date: Date;
  close: number | null;
}

async function fetchIndexClose(symbol: string): Promise<Map<string, number>> {
  const period1 = new Date();
  period1.setMonth(period1.getMonth() - 6);

  const result = await yahooFinance.chart(symbol, {
    period1,
    interval: "1d",
    return: "array",
  } as Parameters<typeof yahooFinance.chart>[1]);

  const quotes = (result as unknown as { quotes: ChartQuote[] }).quotes;
  const map = new Map<string, number>();

  for (const q of quotes) {
    if (q.close != null) {
      const dateStr = new Date(q.date).toISOString().split("T")[0];
      map.set(dateStr, q.close);
    }
  }

  return map;
}

export async function GET() {
  try {
    const [creditData, kospiMap, kosdaqMap] = await Promise.all([
      fetchCreditBalanceData(),
      fetchIndexClose("^KS11"),
      fetchIndexClose("^KQ11"),
    ]);

    // inner join by date
    const joined = creditData
      .filter((c) => kospiMap.has(c.date) && kosdaqMap.has(c.date))
      .map((c) => ({
        date: c.date,
        index:
          Math.round(
            (c.totalLoan / (kospiMap.get(c.date)! + kosdaqMap.get(c.date)!)) *
              10
          ) / 10,
      }));

    if (joined.length === 0) {
      return NextResponse.json(
        { error: "No overlapping data between credit and index" },
        { status: 500 }
      );
    }

    // statistics
    const values = joined.map((d) => d.index);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    const std = Math.sqrt(variance);
    const cautionLine = Math.round(mean * 10) / 10;
    const dangerLine = Math.round((mean + std) * 10) / 10;

    const current = values[values.length - 1];
    let status: "safe" | "caution" | "danger";
    if (current >= mean + std) {
      status = "danger";
    } else if (current >= mean) {
      status = "caution";
    } else {
      status = "safe";
    }

    const response: OverheatIndexResponse = {
      data: joined,
      stats: {
        mean: Math.round(mean * 10) / 10,
        std: Math.round(std * 10) / 10,
        cautionLine,
        dangerLine,
        current: Math.round(current * 10) / 10,
        status,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Credit overheat API error:", error);
    return NextResponse.json(
      { error: "Failed to calculate overheat index" },
      { status: 500 }
    );
  }
}
