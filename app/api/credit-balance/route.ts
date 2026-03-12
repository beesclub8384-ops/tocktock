import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import YahooFinance from "yahoo-finance2";
import { fetchCreditBalanceData, fetchFreeSISRecentData } from "@/lib/fetch-credit-balance";
import type { CreditBalanceItem } from "@/lib/types/credit-balance";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export const revalidate = 3600;

interface ChartQuote {
  date: Date;
  close: number | null;
}

async function fetchKospiIndex(): Promise<{ date: string; close: number }[]> {
  const result = await yahooFinance.chart("^KS11", {
    period1: "1998-07-01",
    interval: "1d",
    return: "array",
  } as Parameters<typeof yahooFinance.chart>[1]);

  const quotes = (result as unknown as { quotes: ChartQuote[] }).quotes;
  const arr: { date: string; close: number }[] = [];

  for (const q of quotes) {
    if (q.close != null) {
      const dateStr = new Date(q.date).toISOString().split("T")[0];
      arr.push({ date: dateStr, close: Math.round(q.close * 100) / 100 });
    }
  }

  return arr;
}

/**
 * FreeSIS CSV (1998-07-01 ~ 2021-11-08, 백만원 단위)를 읽어서 억원 단위로 변환
 */
async function loadFreesisCSV(): Promise<CreditBalanceItem[]> {
  const csvPath = join(process.cwd(), "data", "freesis-credit-balance.csv");
  const raw = await readFile(csvPath, "utf-8");
  const lines = raw.trim().split("\n");

  // 첫 줄은 헤더: date,totalLoan,kospiLoan,kosdaqLoan
  const items: CreditBalanceItem[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 4) continue;

    const [date, totalRaw, kospiRaw, kosdaqRaw] = cols;
    // 백만원 → 억원: ÷100
    items.push({
      date,
      totalLoan: Math.round(Number(totalRaw) / 100),
      kospiLoan: Math.round(Number(kospiRaw) / 100),
      kosdaqLoan: Math.round(Number(kosdaqRaw) / 100),
      totalShortSell: 0,
      depositLoan: 0,
    });
  }

  return items;
}

export async function GET() {
  try {
    // 1) FreeSIS 히스토리컬 데이터 (1998-07 ~ 2021-11-08)
    const freesisData = await loadFreesisCSV();

    // 2) 공공데이터포털 API (2021-11-09~) + FreeSIS 최신 + KOSPI 지수
    const [apiData, freesisRecent, kospiIndex] = await Promise.all([
      fetchCreditBalanceData({
        beginBasDt: "20211101",
        numOfRows: 1200,
      }),
      fetchFreeSISRecentData(14).catch((err) => {
        console.warn("FreeSIS recent fetch failed:", err);
        return [] as CreditBalanceItem[];
      }),
      fetchKospiIndex(),
    ]);

    // 3) 병합: FreeSIS CSV → 공공데이터포털 → FreeSIS 최신 (후순위가 우선)
    const merged = new Map<string, CreditBalanceItem>();
    for (const item of freesisData) {
      merged.set(item.date, item);
    }
    for (const item of apiData) {
      merged.set(item.date, item);
    }
    // FreeSIS 최신 데이터: 공공데이터포털에 없는 날짜만 보완
    for (const item of freesisRecent) {
      if (!merged.has(item.date)) {
        merged.set(item.date, item);
      }
    }

    // 4) 날짜 오름차순 정렬
    const data = [...merged.values()].sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    return NextResponse.json({ data, kospiIndex });
  } catch (error) {
    console.error("Credit balance API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch credit balance data" },
      { status: 500 }
    );
  }
}
