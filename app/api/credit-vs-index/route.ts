import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { fetchCreditBalanceData } from "@/lib/fetch-credit-balance";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

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
      map.set(dateStr, Math.round(q.close * 100) / 100);
    }
  }

  return map;
}

export interface CreditVsIndexItem {
  date: string;
  kospiClose: number;
  kosdaqClose: number;
  kospiLoan: number;
  kosdaqLoan: number;
  totalLoan: number;
}

export async function GET() {
  try {
    const [creditData, kospiMap, kosdaqMap] = await Promise.all([
      fetchCreditBalanceData(),
      fetchIndexClose("^KS11"),
      fetchIndexClose("^KQ11"),
    ]);

    const data: CreditVsIndexItem[] = creditData
      .filter((c) => kospiMap.has(c.date) && kosdaqMap.has(c.date))
      .map((c) => ({
        date: c.date,
        kospiClose: kospiMap.get(c.date)!,
        kosdaqClose: kosdaqMap.get(c.date)!,
        kospiLoan: c.kospiLoan,
        kosdaqLoan: c.kosdaqLoan,
        totalLoan: c.totalLoan,
      }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Credit vs Index API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch credit vs index data" },
      { status: 500 }
    );
  }
}
