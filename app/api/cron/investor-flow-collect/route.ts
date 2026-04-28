/**
 * 투자자 동향 자동 수집 cron — 매일 새벽 KST 06:30 (UTC 21:30 전날).
 *
 * 동작:
 *  1) loadStockUniverse(): Redis에서 추적 종목 약 500개 로드 (없으면 자동 계산)
 *  2) 각 종목에 대해 fetchKisInvestorTrend() 호출 → archive에 누적 저장
 *  3) KIS rate limit 준수 (호출 간 60ms ≈ 16/sec)
 *  4) 일부 실패해도 다음 종목으로 계속
 *
 * 누적 결과: 시간이 지나면 archive가 1년치, 3년치 쌓이고
 *   HybridProvider가 30일+ 과거에서도 외국인·기관·개인·거래대금을 제공한다.
 */

import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { fetchKisInvestorTrend } from "@/lib/kis-client";
import { appendArchive } from "@/lib/investor-flow-archive";
import { loadStockUniverse } from "@/lib/stock-universe";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const LOCK_KEY = "lock:cron:investor-flow-collect";
const LOCK_TTL_SEC = 600;
const STATUS_KEY = "investor-flow:collect-status";
const SLEEP_MS = 60; // ≈16 calls/sec — KIS 한도(20/sec) 안쪽 안전 마진
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface CronStatus {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  symbolsTotal: number;
  successCount: number;
  failureCount: number;
  newRowsTotal: number;
  updatedRowsTotal: number;
  failures: { symbol: string; error: string }[];
  universeRecomputed: boolean;
}

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
  const failures: { symbol: string; error: string }[] = [];
  let successCount = 0;
  let newRowsTotal = 0;
  let updatedRowsTotal = 0;

  try {
    const universe = await loadStockUniverse();
    const symbols = universe.symbols;

    if (symbols.length === 0) {
      throw new Error("universe is empty");
    }

    for (let i = 0; i < symbols.length; i++) {
      const code = symbols[i];
      try {
        const rows = await fetchKisInvestorTrend(code);
        const r = await appendArchive(code, rows);
        successCount++;
        newRowsTotal += r.added;
        updatedRowsTotal += r.updated;
      } catch (e) {
        failures.push({
          symbol: code,
          error: e instanceof Error ? e.message : String(e),
        });
      }
      // KIS rate limit 완충
      if (i < symbols.length - 1) await sleep(SLEEP_MS);
    }

    const finishedAt = new Date();
    const status: CronStatus = {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      symbolsTotal: symbols.length,
      successCount,
      failureCount: failures.length,
      newRowsTotal,
      updatedRowsTotal,
      // 보고용으로 처음 20개만 유지 (Redis 비대화 방지)
      failures: failures.slice(0, 20),
      universeRecomputed: universe.recomputed,
    };
    await redis.set(STATUS_KEY, status, { ex: 7 * 24 * 3600 });

    console.log(
      `[investor-flow-collect] ${successCount}/${symbols.length} 성공, +${newRowsTotal}행 신규, ${updatedRowsTotal}행 갱신, ${(status.durationMs / 1000).toFixed(1)}s`
    );

    return NextResponse.json({ success: true, status });
  } catch (error) {
    console.error("[investor-flow-collect] 치명적 에러:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        partial: { successCount, failureCount: failures.length, newRowsTotal },
      },
      { status: 500 }
    );
  } finally {
    await redis.del(LOCK_KEY).catch(() => {});
  }
}
