import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import * as fs from "fs";
import * as path from "path";

const yahooFinance = new YahooFinance();

interface StockEntry {
  symbol: string;
  code: string;
  name: string;
  nameEn?: string;
  market: string;
}

// 로컬 종목 데이터 로드 (한 번만 읽어 메모리에 캐싱)
let localStocks: StockEntry[] | null = null;

function getLocalStocks(): StockEntry[] {
  if (localStocks) return localStocks;
  try {
    const filePath = path.join(process.cwd(), "data", "stock-names.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    localStocks = JSON.parse(raw) as StockEntry[];
  } catch {
    console.warn("stock-names.json not found, local search disabled");
    localStocks = [];
  }
  return localStocks;
}

// 한글 포함 여부
function hasKorean(s: string): boolean {
  return /[가-힣]/.test(s);
}

// 숫자만인지
function isNumericOnly(s: string): boolean {
  return /^\d+$/.test(s);
}

// 로컬 JSON 검색
function searchLocal(query: string): StockEntry[] {
  const stocks = getLocalStocks();
  if (stocks.length === 0) return [];

  const q = query.trim();
  const qLower = q.toLowerCase();

  if (hasKorean(q)) {
    // 한글 검색: name 필드에서 포함 매칭
    return stocks
      .filter((s) => s.name && s.name.includes(q))
      .slice(0, 10);
  }

  if (isNumericOnly(q)) {
    // 숫자 검색: code 필드 prefix 매칭
    return stocks
      .filter((s) => s.code && s.code.startsWith(q))
      .slice(0, 10);
  }

  // 영문 검색: symbol 정확 매칭 우선, 그 다음 prefix, nameEn 포함
  const exact: StockEntry[] = [];
  const prefix: StockEntry[] = [];
  const nameMatch: StockEntry[] = [];

  for (const s of stocks) {
    const sym = s.symbol.toLowerCase();
    if (sym === qLower || sym.split(".")[0] === qLower) {
      exact.push(s);
    } else if (sym.startsWith(qLower)) {
      prefix.push(s);
    } else if (s.nameEn && s.nameEn.toLowerCase().includes(qLower)) {
      nameMatch.push(s);
    }
  }

  return [...exact, ...prefix, ...nameMatch].slice(0, 10);
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");
  if (!query || query.length < 1) {
    return NextResponse.json({ results: [] });
  }

  const q = query.trim();

  // 1) 로컬 검색
  const localResults = searchLocal(q);
  const localMapped = localResults.map((s) => ({
    symbol: s.symbol,
    name: s.name || s.nameEn || s.symbol,
    exchange: s.market,
    type: "EQUITY",
  }));

  // 한글이나 숫자만 검색인 경우 Yahoo Finance 호출 불필요
  if (hasKorean(q) || isNumericOnly(q)) {
    return NextResponse.json({ results: localMapped.slice(0, 10) });
  }

  // 2) 영문 검색: Yahoo Finance도 병합
  let yahooMapped: { symbol: string; name: string; exchange: string; type: string }[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yahooFinance.search(q, {
      quotesCount: 8,
      newsCount: 0,
    });

    yahooMapped = (result.quotes || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((r: any) =>
        r.symbol &&
        (r.quoteType === "EQUITY" || r.quoteType === "INDEX" || r.quoteType === "ETF")
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => ({
        symbol: r.symbol as string,
        name: (r.shortname || r.longname || r.symbol) as string,
        exchange: (r.exchDisp || r.exchange || "") as string,
        type: (r.quoteType || "EQUITY") as string,
      }));
  } catch (error) {
    console.error("Yahoo search error:", error);
  }

  // 3) 중복 제거 (symbol 기준, 로컬 우선)
  const seen = new Set(localMapped.map((r) => r.symbol));
  const merged = [...localMapped];

  for (const yr of yahooMapped) {
    if (!seen.has(yr.symbol)) {
      seen.add(yr.symbol);
      merged.push(yr);
    }
  }

  return NextResponse.json({ results: merged.slice(0, 10) });
}
