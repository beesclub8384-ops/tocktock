import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YahooFinance from "yahoo-finance2";
import { fetchCreditBalanceData } from "@/lib/fetch-credit-balance";
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
function loadFreesisCSV(): CreditBalanceItem[] {
  const csvPath = join(process.cwd(), "data", "freesis-credit-balance.csv");
  const raw = readFileSync(csvPath, "utf-8");
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
    const freesisData = loadFreesisCSV();

    // 2) 공공데이터포털 API 데이터 (2021-11-09 ~ 현재) + KOSPI 지수
    const [apiData, kospiIndex] = await Promise.all([
      fetchCreditBalanceData({
        beginBasDt: "20211101",
        numOfRows: 1200,
      }),
      fetchKospiIndex(),
    ]);

    // 3) 병합: Map으로 날짜 중복 시 API 데이터 우선
    const merged = new Map<string, CreditBalanceItem>();
    for (const item of freesisData) {
      merged.set(item.date, item);
    }
    for (const item of apiData) {
      merged.set(item.date, item); // API 데이터가 덮어씀
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
