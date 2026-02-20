import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { fetchCreditBalanceData } from "@/lib/fetch-credit-balance";
import { fetchMarketCap } from "@/lib/fetch-market-index";
import type {
  OverheatIndexItem,
  OverheatIndexResponse,
} from "@/lib/types/credit-balance";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export const revalidate = 3600;

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
      map.set(dateStr, q.close);
    }
  }

  return map;
}

/** 시가총액 기반 (primary) — 단위: % (융자잔고(억) / 시가총액(억) × 100) */
async function buildFromMarketCap(
  creditData: Awaited<ReturnType<typeof fetchCreditBalanceData>>
): Promise<{ joined: OverheatIndexItem[]; source: "marketCap" }> {
  const mcOptions = { beginBasDt: DATA_START.replace(/-/g, ""), numOfRows: 1200 };
  const [kospiCaps, kosdaqCaps] = await Promise.all([
    fetchMarketCap("코스피", mcOptions),
    fetchMarketCap("코스닥", mcOptions),
  ]);

  // marketCap은 조원 단위 → ×10000으로 억원 환산
  const kospiMap = new Map(kospiCaps.map((d) => [d.date, d.marketCap * 10000]));
  const kosdaqMap = new Map(kosdaqCaps.map((d) => [d.date, d.marketCap * 10000]));

  const joined = creditData
    .filter((c) => kospiMap.has(c.date) && kosdaqMap.has(c.date))
    .map((c) => {
      const totalMarketCapEok = kospiMap.get(c.date)! + kosdaqMap.get(c.date)!;
      // 과열지수(%) = 융자잔고(억원) / 시가총액(억원) × 100
      return {
        date: c.date,
        index: Math.round((c.totalLoan / totalMarketCapEok) * 100 * 1000) / 1000,
      };
    });

  return { joined, source: "marketCap" };
}

/** 지수 종가 기반 (fallback) — 근사치 % */
async function buildFromIndexClose(
  creditData: Awaited<ReturnType<typeof fetchCreditBalanceData>>
): Promise<{ joined: OverheatIndexItem[]; source: "indexClose" }> {
  const [kospiMap, kosdaqMap] = await Promise.all([
    fetchIndexClose("^KS11"),
    fetchIndexClose("^KQ11"),
  ]);

  // 지수종가 기반 근사 스케일: 지수합계 × ~9.5 ≈ 시총(조)로 환산 후 % 계산
  // 실측: KOSPI 2,607 → 시총 ~4,697조, KOSDAQ 858 → 시총 ~636조
  // 합계 지수 ~3,465 → 시총 ~5,333조 → 배수 약 1,539
  // 근사: totalLoan(억) / (지수합계 × 1539 × 10000) × 100
  const APPROX_MULTIPLIER = 15_390_000; // 지수 1pt ≈ 억원 환산 배수

  const joined = creditData
    .filter((c) => kospiMap.has(c.date) && kosdaqMap.has(c.date))
    .map((c) => {
      const indexSum = kospiMap.get(c.date)! + kosdaqMap.get(c.date)!;
      return {
        date: c.date,
        index:
          Math.round((c.totalLoan / (indexSum * APPROX_MULTIPLIER)) * 100 * 1000) / 1000,
      };
    });

  return { joined, source: "indexClose" };
}

export async function GET() {
  try {
    const creditData = await fetchCreditBalanceData({
      beginBasDt: DATA_START.replace(/-/g, ""),
      numOfRows: 1200,
    });

    // 1차: 시가총액 기반, 실패 시 2차: 지수 종가 fallback
    let joined: OverheatIndexItem[];
    let source: "marketCap" | "indexClose";

    try {
      const result = await buildFromMarketCap(creditData);
      if (result.joined.length === 0) throw new Error("No market cap data");
      joined = result.joined;
      source = result.source;
    } catch (e) {
      console.warn("Market cap fetch failed, falling back to index close:", e);
      const result = await buildFromIndexClose(creditData);
      joined = result.joined;
      source = result.source;
    }

    if (joined.length === 0) {
      return NextResponse.json(
        { error: "No overlapping data" },
        { status: 500 }
      );
    }

    // statistics
    const values = joined.map((d) => d.index);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    const std = Math.sqrt(variance);

    const round = (v: number) => Math.round(v * 1000) / 1000;

    const cautionLine = round(mean);
    const dangerLine = round(mean + std);
    const current = round(values[values.length - 1]);

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
        mean: round(mean),
        std: round(std),
        cautionLine,
        dangerLine,
        current,
        status,
      },
      source,
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
