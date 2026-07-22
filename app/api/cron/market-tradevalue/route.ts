import { NextResponse } from "next/server";
import {
  fetchIndexToday,
  saveTradeValueHistory,
  KOSPI,
  KOSDAQ,
} from "@/lib/market-tradevalue";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Vercel Cron은 GET으로 호출 — 반드시 GET (POST면 405 무음 실패)
// 매 영업일 KST 08시 실행: 전일(직전 영업일) 확정 거래대금 1건을 히스토리에 병합 저장
export async function GET(request: Request) {
  // 기존 cron 인증 방식과 동일: CRON_SECRET 설정 시 Bearer 검증
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 전일 확정 거래대금 (prdy_tr_pbmn, 원 단위) + 기준일(직전 영업일)
    const kospi = await fetchIndexToday(KOSPI);
    const kosdaq = await fetchIndexToday(KOSDAQ);

    // 두 시장 기준일은 동일한 직전 영업일이어야 함
    const date = kospi.date;

    // 조용히 실패 금지: 값이 비정상(0/음수)이면 저장하지 않고 500
    if (kospi.tradeValue <= 0 || kosdaq.tradeValue <= 0) {
      return NextResponse.json(
        {
          error: "거래대금 비정상 (0 또는 음수)",
          date,
          kospi: kospi.tradeValue,
          kosdaq: kosdaq.tradeValue,
        },
        { status: 500 }
      );
    }

    const record = {
      date,
      kospi: kospi.tradeValue,
      kosdaq: kosdaq.tradeValue,
      total: kospi.tradeValue + kosdaq.tradeValue,
    };
    await saveTradeValueHistory([record]); // 같은 날짜면 덮어쓰기 병합

    return NextResponse.json({ ok: true, saved: record });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "market-tradevalue cron 실패" },
      { status: 500 }
    );
  }
}
