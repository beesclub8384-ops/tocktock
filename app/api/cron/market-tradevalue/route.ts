import { NextResponse } from "next/server";
import {
  fetchLatestConfirmed,
  saveTradeValueHistory,
  KOSPI,
  KOSDAQ,
  type TradeValuePoint,
} from "@/lib/market-tradevalue";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Vercel Cron은 GET으로 호출 — 반드시 GET (POST면 405 무음 실패)
// 매 영업일 KST 08시 실행: 최근 확정 거래일(KIS stck_bsop_date 기준) 거래대금 1건을 병합 저장
export async function GET(request: Request) {
  // 기존 cron 인증 방식과 동일: CRON_SECRET 설정 시 Bearer 검증
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 최근 확정 거래일의 거래대금 (원). date는 KIS 실제 거래일(stck_bsop_date) → 공휴일 스큐 없음
    const kospi = await fetchLatestConfirmed(KOSPI);
    const kosdaq = await fetchLatestConfirmed(KOSDAQ);

    // 두 시장 기준일은 보통 동일. 드물게 다르면 더 과거 날짜로 맞추고 경고 로그.
    if (kospi.date !== kosdaq.date) {
      console.warn(
        `[market-tradevalue] 시장별 최근 확정일 불일치: kospi=${kospi.date}, kosdaq=${kosdaq.date}`
      );
    }
    // 저장 date는 코스피 기준 (지시)
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

    // 지수 종가(bstp_nmix_prpr)는 거래대금과 같은 KIS 응답에 들어 있다.
    // 이 필드를 빠뜨리면 거래대금만 최신이고 지수만 옛날에 멈추는 무음 실패가 된다.
    if (!Number.isFinite(kospi.indexValue)) {
      console.warn(
        `[market-tradevalue] ${date} 코스피 지수 종가 없음 — 거래대금만 저장됨`
      );
    }

    const record: TradeValuePoint = {
      date,
      kospi: kospi.tradeValue,
      kosdaq: kosdaq.tradeValue,
      total: kospi.tradeValue + kosdaq.tradeValue,
      ...(Number.isFinite(kospi.indexValue) ? { kospiIndex: kospi.indexValue } : {}),
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
