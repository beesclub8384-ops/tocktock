import { NextRequest, NextResponse } from "next/server";
import { loadDynamicSymbols } from "@/lib/futures-trading-store";
import { MARKET_SYMBOLS } from "@/lib/futures-market-data";

const PASSWORD = "8384";

function checkAuth(request: NextRequest): boolean {
  return request.headers.get("x-password") === PASSWORD;
}

const STATIC_SYMBOL_NAMES: Record<string, string> = {
  "005930.KS": "삼성전자",
  "000660.KS": "SK하이닉스",
  KOSP200F: "코스피200 선물 근월물 (KIS)",
  "ES=F": "S&P500 선물",
  "DX-Y.NYB": "ICE 달러 인덱스",
};

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const dynamic = await loadDynamicSymbols();
    const staticList = MARKET_SYMBOLS.map((s) => ({
      symbol: s,
      name: STATIC_SYMBOL_NAMES[s] ?? s,
      source: s === "KOSP200F" ? "kis" : "yahoo",
    }));
    return NextResponse.json({ static: staticList, dynamic });
  } catch (error) {
    console.error("[futures-trading/dynamic-symbols] GET error:", error);
    return NextResponse.json({ error: "불러오기 실패" }, { status: 500 });
  }
}
