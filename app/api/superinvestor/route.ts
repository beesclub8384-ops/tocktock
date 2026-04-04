import { NextRequest, NextResponse } from "next/server";
import {
  loadData,
  collectAll,
  fetchHoldings,
} from "@/lib/superinvestor-store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const section = request.nextUrl.searchParams.get("section");
  const manager = request.nextUrl.searchParams.get("manager");

  try {
    // 섹션 4: 개별 투자자 holdings (실시간 fetch)
    if (section === "holdings" && manager) {
      const holdings = await fetchHoldings(manager);
      return NextResponse.json({ holdings });
    }

    // 캐시된 데이터 조회
    let data = await loadData();

    // 캐시 미스 → 실시간 수집
    if (!data || !data.consensus) {
      console.log("[superinvestor-api] 캐시 없음, 실시간 수집");
      data = await collectAll();
    }

    // 투자자 목록만 요청
    if (section === "managers") {
      return NextResponse.json({
        managers: data.managers,
        lastUpdated: data.lastUpdated,
      });
    }

    // 기본: 섹션 1,2,3 전체 반환
    return NextResponse.json({
      consensus: data.consensus,
      discount: data.discount,
      insider: data.insider,
      managers: data.managers,
      lastUpdated: data.lastUpdated,
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
