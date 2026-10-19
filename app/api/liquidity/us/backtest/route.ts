import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { BACKTEST_STORE_KEY, type StoredBacktest } from "@/lib/liquidity-backtest";

/* 미션 12: 예전 캐시(liquidity:us:backtest:v7)로 대신 보여 주던 길을 없앴다 — 그 값에는 NFCI 가 들어 있다.
 * 새 저장값이 생기기 전(배포 직후 cron 전)에는 503 과 안내가 나간다. 배포 뒤 cron 을 수동 호출해 채운다. */

export const dynamic = "force-dynamic";

/**
 * 백테스트 결과 — 저장값만 읽는다 (미션 11). 계산은 매일 cron(app/api/cron/liquidity-backtest)이 한다.
 * 응답에 저장 시각(storedAt)을 싣는다. 저장값이 하나도 없으면(첫 배포 직후 cron 전) 503 과 안내를 돌려준다.
 */
export async function GET() {
  try {
    // @upstash/redis 는 직렬화/역직렬화를 자동 처리한다 (JSON.parse 금지)
    const stored = await redis.get<StoredBacktest>(BACKTEST_STORE_KEY);
    if (!stored?.data) {
      return NextResponse.json(
        { error: "백테스트 결과를 아직 준비하지 못했습니다. 잠시 뒤 다시 확인해 주세요." },
        { status: 503 }
      );
    }
    return NextResponse.json({ ...stored.data, storedAt: stored.savedAt });
  } catch (error) {
    console.error("liquidity/us/backtest error:", error);
    return NextResponse.json({ error: "Failed to read backtest" }, { status: 500 });
  }
}
