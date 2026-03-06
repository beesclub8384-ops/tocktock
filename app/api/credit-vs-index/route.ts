import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { fetchCreditBalanceData, fetchFreeSISRecentData } from "@/lib/fetch-credit-balance";
import type { CreditBalanceItem } from "@/lib/types/credit-balance";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export const revalidate = 3600;

// 신용융자잔고 API 최초 데이터: 2021-11-09
const DATA_START = "2021-11-01";

interface ChartQuote {
  date: Date;
  close: number | null;
}

async function fetchIndexClose(symbol: string): Promise<Map<string, number>> {
  const result = await yahooFinance.chart(symbol, {
    period1: DATA_START,
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
    const [apiData, freesisRecent, kospiMap, kosdaqMap] = await Promise.all([
      fetchCreditBalanceData({
        beginBasDt: DATA_START.replace(/-/g, ""),
        numOfRows: 1200,
      }),
      fetchFreeSISRecentData(14).catch(() => [] as CreditBalanceItem[]),
      fetchIndexClose("^KS11"),
      fetchIndexClose("^KQ11"),
    ]);

    // 병합: 공공데이터포털 + FreeSIS 최신 (미반영분만 보완)
    const creditMap = new Map<string, CreditBalanceItem>();
    for (const item of apiData) {
      creditMap.set(item.date, item);
    }
    for (const item of freesisRecent) {
      if (!creditMap.has(item.date)) {
        creditMap.set(item.date, item);
      }
    }
    const creditData = [...creditMap.values()].sort((a, b) =>
      a.date.localeCompare(b.date)
    );

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
