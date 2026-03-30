import { NextResponse } from "next/server";
import {
  loadStocks,
  saveStocks,
  collectAndScore,
} from "@/lib/superinvestor-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    // Redis에서 캐시된 데이터 조회
    const cached = await loadStocks();
    if (cached && cached.stocks.length > 0) {
      return NextResponse.json(cached);
    }

    // 캐시 미스 — 실시간 수집 (최초 1회)
    console.log("[superinvestor-api] 캐시 없음, 실시간 수집 시작");
    const stocks = await collectAndScore();
    await saveStocks(stocks);

    return NextResponse.json({
      stocks,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[superinvestor-api] 에러:", error);
    return NextResponse.json(
      {
        error: "데이터를 불러올 수 없습니다.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
