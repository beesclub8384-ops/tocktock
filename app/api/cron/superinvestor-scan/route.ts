import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { collectAndScore, saveStocks } from "@/lib/superinvestor-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 슈퍼투자자 종목 스캔 Cron
 * 매주 월요일 UTC 01:00 (KST 10:00) 실행
 * Vercel Cron은 GET만 지원 — POST 사용 금지
 */
export async function GET(request: Request) {
  // CRON_SECRET 인증
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 동시 실행 방지 (Redis lock, 10분 만료)
  const LOCK_KEY = "lock:cron:superinvestor-scan";
  const locked = await redis.set(LOCK_KEY, "1", { ex: 600, nx: true });
  if (!locked) {
    return NextResponse.json({ message: "이미 실행 중 (lock)" });
  }

  try {
    const stocks = await collectAndScore();
    await saveStocks(stocks);

    return NextResponse.json({
      success: true,
      message: "슈퍼투자자 종목 스캔 완료",
      stockCount: stocks.length,
      topStocks: stocks.slice(0, 5).map((s) => ({
        ticker: s.ticker,
        score: s.score,
        grade: s.grade,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[superinvestor-scan] 에러:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  } finally {
    await redis.del(LOCK_KEY).catch(() => {});
  }
}
