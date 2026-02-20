import { NextResponse } from "next/server";
import { fetchCreditBalanceData } from "@/lib/fetch-credit-balance";
import { fetchMarketCap } from "@/lib/fetch-market-index";
import type { OverheatIndexResponse } from "@/lib/types/credit-balance";

export const revalidate = 3600;

export async function GET() {
  try {
    const [creditData, kospiCaps, kosdaqCaps] = await Promise.all([
      fetchCreditBalanceData(),
      fetchMarketCap("코스피"),
      fetchMarketCap("코스닥"),
    ]);

    // Map date → marketCap (조원)
    const kospiMap = new Map(kospiCaps.map((d) => [d.date, d.marketCap]));
    const kosdaqMap = new Map(kosdaqCaps.map((d) => [d.date, d.marketCap]));

    // inner join by date
    // 과열지수 = totalLoan(억원) / (KOSPI시총 + KOSDAQ시총)(조원)
    const joined = creditData
      .filter((c) => kospiMap.has(c.date) && kosdaqMap.has(c.date))
      .map((c) => {
        const totalMarketCap = kospiMap.get(c.date)! + kosdaqMap.get(c.date)!;
        return {
          date: c.date,
          index: Math.round((c.totalLoan / totalMarketCap) * 100) / 100,
        };
      });

    if (joined.length === 0) {
      return NextResponse.json(
        { error: "No overlapping data between credit and market cap" },
        { status: 500 }
      );
    }

    // statistics
    const values = joined.map((d) => d.index);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    const std = Math.sqrt(variance);
    const cautionLine = Math.round(mean * 100) / 100;
    const dangerLine = Math.round((mean + std) * 100) / 100;

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
        mean: Math.round(mean * 100) / 100,
        std: Math.round(std * 100) / 100,
        cautionLine,
        dangerLine,
        current: Math.round(current * 100) / 100,
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
