import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { BACKTEST_STORE_KEY, type BacktestResponse, type StoredBacktest } from "@/lib/liquidity-backtest";

/** 미션 11 전 방식의 24시간 캐시 — 새 저장값이 생기기 전(배포 직후)에만 대신 쓴다 (독립 검증 지적 5) */
const LEGACY_CACHE_KEY = "liquidity:us:backtest:v7";

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
      const legacy = await redis.get<BacktestResponse>(LEGACY_CACHE_KEY);
      if (legacy?.points?.length) return NextResponse.json({ ...legacy, storedAt: legacy.fetchedAt });
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
