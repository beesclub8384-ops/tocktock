import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { BACKTEST_STORE_KEY, computeBacktest, type StoredBacktest } from "@/lib/liquidity-backtest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 미국 유동성 백테스트 계산 cron (미션 11) — 하루 한 번 계산해 저장한다. 실패하면 이전 저장값을 그대로 두고
 * 응답에 errors 를 남긴다(화면은 마지막 성공값과 그 계산 시각을 보여 준다).
 */
export async function GET(request: Request) {
  // 비밀값이 없으면 "Bearer undefined" 로 통과되지 않게 먼저 막는다 (미션 11 독립 검증 지적 11)
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const t0 = Date.now();
  try {
    const data = await computeBacktest();
    if (!data.points?.length) throw new Error("백테스트 포인트 0개 — 저장하지 않음");
    const save: StoredBacktest = { data, savedAt: new Date().toISOString() };
    await redis.set(BACKTEST_STORE_KEY, save);
    return NextResponse.json({ success: true, points: data.points.length, savedAt: save.savedAt, elapsedMs: Date.now() - t0 });
  } catch (error) {
    const prev = await redis.get<StoredBacktest>(BACKTEST_STORE_KEY).catch(() => null);
    // 실패는 500 으로 — Vercel cron 기록에 실패로 남게 (독립 검증 지적 6). 이전 저장값은 그대로 둔다
    return NextResponse.json(
      {
        success: false,
        errors: { backtest: error instanceof Error ? error.message : String(error) },
        keptPrevious: prev?.savedAt ?? null,
        elapsedMs: Date.now() - t0,
      },
      { status: 500 }
    );
  }
}
