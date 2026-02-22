import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YahooFinance from "yahoo-finance2";
import { fetchCreditBalanceData } from "@/lib/fetch-credit-balance";
import { fetchMarketCap } from "@/lib/fetch-market-index";
import type {
  CreditBalanceItem,
  OverheatIndexItem,
  OverheatIndexResponse,
} from "@/lib/types/credit-balance";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export const revalidate = 3600;

const DATA_START = "2001-01-02";

interface ChartQuote {
  date: Date;
  close: number | null;
}

// ── FreeSIS CSV 로더 ──

/**
 * FreeSIS 시가총액 CSV (2001-01-02 ~ 2021-11-08, 억원 단위) 로드
 * → Map<date, { kospi: 억원, kosdaq: 억원 }>
 */
function loadFreesisMarketCapCSV(): Map<string, { kospi: number; kosdaq: number }> {
  const csvPath = join(process.cwd(), "data", "freesis-market-cap.csv");
  const raw = readFileSync(csvPath, "utf-8");
  const lines = raw.trim().split("\n");

  const map = new Map<string, { kospi: number; kosdaq: number }>();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 3) continue;
    const [date, kospiRaw, kosdaqRaw] = cols;
    map.set(date, { kospi: Number(kospiRaw), kosdaq: Number(kosdaqRaw) });
  }

  return map;
}

/**
 * FreeSIS 신용잔고 CSV (1998-07-01 ~ 2021-11-08, 백만원 단위) → 억원 변환
 */
function loadFreesisCreditCSV(): CreditBalanceItem[] {
  const csvPath = join(process.cwd(), "data", "freesis-credit-balance.csv");
  const raw = readFileSync(csvPath, "utf-8");
  const lines = raw.trim().split("\n");

  const items: CreditBalanceItem[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 4) continue;
    const [date, totalRaw, kospiRaw, kosdaqRaw] = cols;
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

// ── 데이터 병합 ──

/**
 * 시가총액 데이터 병합: FreeSIS CSV(2001~2021) + 공공데이터포털 API(2020~현재)
 * API 데이터가 우선
 */
async function getMergedMarketCapMap(): Promise<Map<string, number>> {
  // 1) FreeSIS CSV 로드
  const csvMap = loadFreesisMarketCapCSV();

  // 2) 공공데이터포털 API (최근 ~5년, CSV와 겹치는 구간 포함)
  const mcOptions = { beginBasDt: "20200101", numOfRows: 2000 };
  const [kospiCaps, kosdaqCaps] = await Promise.all([
    fetchMarketCap("코스피", mcOptions),
    fetchMarketCap("코스닥", mcOptions),
  ]);

  // API 데이터를 Map으로 변환 (조원 → 억원)
  const apiKospiMap = new Map(kospiCaps.map((d) => [d.date, d.marketCap * 10000]));
  const apiKosdaqMap = new Map(kosdaqCaps.map((d) => [d.date, d.marketCap * 10000]));

  // 3) 병합: CSV를 기반으로, API 데이터로 덮어씀
  const totalMap = new Map<string, number>();

  // CSV 데이터 추가
  for (const [date, caps] of csvMap) {
    totalMap.set(date, caps.kospi + caps.kosdaq);
  }

  // API 데이터로 덮어쓰기 (두 시장 모두 있는 날만)
  for (const [date, kospiEok] of apiKospiMap) {
    if (apiKosdaqMap.has(date)) {
      totalMap.set(date, kospiEok + apiKosdaqMap.get(date)!);
    }
  }

  return totalMap;
}

/**
 * 신용잔고 데이터 병합: FreeSIS CSV(1998~2021) + 공공데이터포털 API(2021~현재)
 * API 데이터가 우선
 */
async function getMergedCreditMap(): Promise<Map<string, number>> {
  // 1) FreeSIS CSV
  const csvData = loadFreesisCreditCSV();

  // 2) 공공데이터포털 API
  const apiData = await fetchCreditBalanceData({
    beginBasDt: "20211101",
    numOfRows: 1200,
  });

  // 3) 병합: CSV 기반, API 덮어씀
  const map = new Map<string, number>();
  for (const item of csvData) {
    map.set(item.date, item.totalLoan);
  }
  for (const item of apiData) {
    map.set(item.date, item.totalLoan);
  }

  return map;
}

// ── 과열지수 계산 ──

/** 시가총액 기반 (primary) — 단위: % (융자잔고(억) / 시가총액(억) × 100) */
async function buildFromMarketCap(): Promise<{
  joined: OverheatIndexItem[];
  source: "marketCap";
}> {
  const [marketCapMap, creditMap] = await Promise.all([
    getMergedMarketCapMap(),
    getMergedCreditMap(),
  ]);

  // 두 Map의 날짜 교집합으로 과열지수 계산
  const joined: OverheatIndexItem[] = [];
  const dates = [...marketCapMap.keys()]
    .filter((d) => creditMap.has(d) && d >= DATA_START)
    .sort();

  for (const date of dates) {
    const totalMarketCapEok = marketCapMap.get(date)!;
    const totalLoan = creditMap.get(date)!;
    if (totalMarketCapEok === 0) continue;

    joined.push({
      date,
      index: Math.round((totalLoan / totalMarketCapEok) * 100 * 1000) / 1000,
    });
  }

  return { joined, source: "marketCap" };
}

/** 지수 종가 기반 (fallback) — 근사치 % */
async function buildFromIndexClose(): Promise<{
  joined: OverheatIndexItem[];
  source: "indexClose";
}> {
  const creditMap = await getMergedCreditMap();

  const [kospiMap, kosdaqMap] = await Promise.all([
    fetchIndexClose("^KS11"),
    fetchIndexClose("^KQ11"),
  ]);

  const APPROX_MULTIPLIER = 15_390_000;

  const joined: OverheatIndexItem[] = [];
  for (const [date, totalLoan] of creditMap) {
    if (date < DATA_START) continue;
    if (!kospiMap.has(date) || !kosdaqMap.has(date)) continue;

    const indexSum = kospiMap.get(date)! + kosdaqMap.get(date)!;
    joined.push({
      date,
      index:
        Math.round((totalLoan / (indexSum * APPROX_MULTIPLIER)) * 100 * 1000) /
        1000,
    });
  }

  joined.sort((a, b) => a.date.localeCompare(b.date));
  return { joined, source: "indexClose" };
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

export async function GET() {
  try {
    // 1차: 시가총액 기반, 실패 시 2차: 지수 종가 fallback
    let joined: OverheatIndexItem[];
    let source: "marketCap" | "indexClose";

    try {
      const result = await buildFromMarketCap();
      if (result.joined.length === 0) throw new Error("No market cap data");
      joined = result.joined;
      source = result.source;
    } catch (e) {
      console.warn("Market cap fetch failed, falling back to index close:", e);
      const result = await buildFromIndexClose();
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
