/**
 * 추적 종목 universe 주간 갱신 cron — 일요일 KST 03:00 (UTC 토 18:00).
 *
 * 시총·거래대금·변동성 기준이 변하는 종목을 매주 새로 선정한다.
 * 결과는 investor-flow:universe 키에 저장 (TTL 8일).
 *
 * 시간: 약 60-90초 (Naver 1500종목 OHLCV 조회 병렬 5개 배치)
 */

import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { selectTrackedStocks, saveStockUniverse } from "@/lib/stock-universe";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const LOCK_KEY = "lock:cron:investor-flow-universe";
const LOCK_TTL_SEC = 600;
const STATUS_KEY = "investor-flow:universe-status";

export async function GET(request: Request) {
  if (
    process.env.CRON_SECRET &&
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const locked = await redis.set(LOCK_KEY, "1", { ex: LOCK_TTL_SEC, nx: true });
  if (!locked) {
    return NextResponse.json({ message: "이미 실행 중 (lock)" });
  }

  const startedAt = new Date();
  try {
    const result = await selectTrackedStocks();
    await saveStockUniverse(result);

    const finishedAt = new Date();
    const status = {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      selected: result.symbols.length,
      stages: result.stages,
      sample: result.sample,
    };
    await redis.set(STATUS_KEY, status, { ex: 14 * 24 * 3600 });

    console.log(
      `[investor-flow-universe] ${result.symbols.length}개 선정 (전체 ${result.stages.totalListed} → 시총 ${result.stages.afterMarketCap} → 사전컷 ${result.stages.afterTodayValueCut} → 최종 ${result.stages.afterHistStats}), ${(status.durationMs / 1000).toFixed(1)}s`
    );

    return NextResponse.json({ success: true, status });
  } catch (error) {
    console.error("[investor-flow-universe] 에러:", error);
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
