import { NextResponse } from "next/server";
import {
  collectDiscountWindow,
  loadDiscountWindow,
  DISCOUNT_WINDOW_SERIES_ID,
} from "@/lib/observatory-discount-window";
import {
  daysSinceObservation,
  evaluateDiscountWindow,
  DW_ALERT_BILLIONS,
  DW_CAUTION_BILLIONS,
  DW_PEAK_2023_BILLIONS,
  DW_PEAK_2023_DATE,
  DW_STALE_DAYS,
  DW_SURGE_MIN_BILLIONS,
  DW_SURGE_MULTIPLE,
  type DiscountWindowPoint,
  type ObservatoryStatus,
} from "@/lib/observatory-constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface DiscountWindowResponse {
  /** 십억 달러 단위 (수집 단계에서 변환 완료 — 여기서 재변환하지 않는다) */
  series: DiscountWindowPoint[];
  latest: DiscountWindowPoint | null;
  previous: DiscountWindowPoint | null;
  status: ObservatoryStatus;
  weekOverWeekMultiple: number | null;
  surged: boolean;
  /** 최신 기준일이 DW_STALE_DAYS 보다 오래됐는지 (= FRED 갱신이 막힌 상태) */
  dataDelayed: boolean;
  /** 최신 기준일이 며칠 전인지 */
  daysSinceLatest: number | null;
  seriesId: string;
  thresholds: {
    /** 십억 달러 */
    cautionBillions: number;
    /** 십억 달러 */
    alertBillions: number;
    surgeMultiple: number;
    /** 급증 룰을 적용할 최소 전주 잔액, 십억 달러 */
    surgeMinBillions: number;
    staleDays: number;
    /** 2023년 3월 피크, 십억 달러 */
    peakBillions: number;
    peakDate: string;
  };
  lastUpdated: string;
}

export async function GET() {
  try {
    let series = await loadDiscountWindow();

    // 아직 cron 이 한 번도 안 돈 상태면 이 요청에서 한 번 채운다.
    // (첫 배포 직후 페이지가 빈 화면으로 보이는 것을 막는다)
    if (series.length === 0) {
      try {
        await collectDiscountWindow();
        series = await loadDiscountWindow();
      } catch (e) {
        console.error("[observatory/discount-window] 최초 수집 실패:", e);
      }
    }

    const verdict = evaluateDiscountWindow(series);

    // FRED 가 실패해도 여기서는 Redis 의 마지막 성공값을 그대로 쓴다.
    // 수집이 계속 막히면 기준일이 늙어 dataDelayed 가 켜지고,
    // 화면에 "데이터 지연" 과 마지막 성공 기준일이 함께 표시된다.
    const daysSinceLatest = verdict.latest
      ? daysSinceObservation(verdict.latest.date)
      : null;
    const dataDelayed = daysSinceLatest !== null && daysSinceLatest > DW_STALE_DAYS;

    const body: DiscountWindowResponse = {
      series,
      latest: verdict.latest,
      previous: verdict.previous,
      status: verdict.status,
      weekOverWeekMultiple: verdict.weekOverWeekMultiple,
      surged: verdict.surged,
      dataDelayed,
      daysSinceLatest,
      seriesId: DISCOUNT_WINDOW_SERIES_ID,
      thresholds: {
        cautionBillions: DW_CAUTION_BILLIONS,
        alertBillions: DW_ALERT_BILLIONS,
        surgeMultiple: DW_SURGE_MULTIPLE,
        surgeMinBillions: DW_SURGE_MIN_BILLIONS,
        staleDays: DW_STALE_DAYS,
        peakBillions: DW_PEAK_2023_BILLIONS,
        peakDate: DW_PEAK_2023_DATE,
      },
      lastUpdated: new Date().toISOString(),
    };

    return NextResponse.json(body);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
