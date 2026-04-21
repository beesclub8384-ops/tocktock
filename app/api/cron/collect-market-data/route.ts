import { NextResponse } from "next/server";
import {
  fetchMarketDataForDate,
  hasAnyData,
  type MarketDataForDay,
} from "@/lib/futures-market-data";
import { loadMarketData, saveMarketData } from "@/lib/futures-trading-store";

// Yahoo 5개 심볼 수집 + 저장에 넉넉히
export const maxDuration = 120;

/** KST 기준 오늘 날짜 YYYY-MM-DD 반환 */
function todayKstDate(): string {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}

/** KST 기준 요일 (0=일, 6=토) */
function kstDayOfWeek(): number {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return kst.getUTCDay();
}

/**
 * 수집된 데이터 검증:
 * - 005930.KS 1분봉 ≥ 100
 * - 전체 null/0 가격 캔들 비율 < 10%
 */
function validateMarketData(data: MarketDataForDay): { ok: boolean; reason?: string } {
  const samsung = data.symbols["005930.KS"]?.candles1m ?? [];
  if (samsung.length < 100) {
    return { ok: false, reason: `005930.KS 1m count ${samsung.length} < 100` };
  }

  let total = 0;
  let bad = 0;
  for (const bars of Object.values(data.symbols)) {
    for (const c of bars.candles1m) {
      total++;
      if (c.open == null || c.high == null || c.low == null || c.close == null) bad++;
      else if (c.open === 0 || c.high === 0 || c.low === 0 || c.close === 0) bad++;
    }
  }
  const ratio = total === 0 ? 1 : bad / total;
  if (ratio >= 0.1) {
    return { ok: false, reason: `bad-candle ratio ${(ratio * 100).toFixed(1)}% >= 10%` };
  }
  return { ok: true };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date = todayKstDate();
  const dow = kstDayOfWeek();

  // 토/일 스킵
  if (dow === 0 || dow === 6) {
    return NextResponse.json({
      success: true,
      skipped: "weekend",
      date,
      dow,
    });
  }

  try {
    // 이미 유효한 데이터가 있으면 스킵
    const existing = await loadMarketData(date);
    if (existing && hasAnyData(existing)) {
      const check = validateMarketData(existing);
      if (check.ok) {
        return NextResponse.json({
          success: true,
          skipped: "already-collected",
          date,
        });
      }
      // 기존 데이터 있으나 검증 실패 → 재수집 진행
      console.log(`[cron/collect-market-data] existing data invalid: ${check.reason}, refetching`);
    }

    const data = await fetchMarketDataForDate(date);
    const counts = Object.fromEntries(
      Object.entries(data.symbols).map(([s, b]) => [s, b.candles1m.length])
    );

    const check = validateMarketData(data);
    if (!check.ok) {
      console.warn(`[cron/collect-market-data] ${date} validation failed: ${check.reason}`, counts);
      return NextResponse.json({
        success: false,
        date,
        validationFailed: check.reason,
        counts,
        saved: false,
      });
    }

    await saveMarketData(date, data);
    console.log(`[cron/collect-market-data] ${date} saved`, counts);

    return NextResponse.json({
      success: true,
      date,
      saved: true,
      counts,
    });
  } catch (err) {
    console.error(`[cron/collect-market-data] ${date} error:`, err);
    return NextResponse.json(
      {
        success: false,
        date,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
