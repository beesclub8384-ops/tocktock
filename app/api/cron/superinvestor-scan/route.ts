import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { collectAll } from "@/lib/superinvestor-store";
import { REDIS_KEYS } from "@/lib/types/superinvestor";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * 슈퍼투자자 종목 스캔 Cron
 * 매주 월요일 UTC 01:00 (KST 10:00) 실행
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 동시 실행 방지 (10분 만료)
  const locked = await redis.set(REDIS_KEYS.LOCK, "1", { ex: 600, nx: true });
  if (!locked) {
    return NextResponse.json({ message: "이미 실행 중 (lock)" });
  }

  try {
    const data = await collectAll();

    return NextResponse.json({
      success: true,
      consensus: data.consensus.length,
      discount: data.discount.length,
      insider: data.insider.length,
      managers: data.managers.length,
      timestamp: data.lastUpdated,
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
    await redis.del(REDIS_KEYS.LOCK).catch(() => {});
  }
}
