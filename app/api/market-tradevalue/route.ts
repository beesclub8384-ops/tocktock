import { NextResponse } from "next/server";
import { loadTradeValueHistory } from "@/lib/market-tradevalue";

export const dynamic = "force-dynamic";

// 코스피/코스닥 일별 거래대금 시계열 (KRX 정규장 기준, 원 단위)
export async function GET() {
  const data = await loadTradeValueHistory(); // 없으면 [] 반환
  return NextResponse.json(data);
}
