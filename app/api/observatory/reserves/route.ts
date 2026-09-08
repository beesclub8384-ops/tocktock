import { NextResponse } from "next/server";
import {
  collectReserves,
  loadReserves,
  RESERVES_SERIES_ID,
} from "@/lib/observatory-reserves";
import {
  daysSinceObservation,
  evaluateReserves,
  RESERVES_2019_CRISIS_BILLIONS,
  RESERVES_2019_CRISIS_DATE,
  RESERVES_ALERT_BILLIONS,
  RESERVES_NORMAL_BILLIONS,
  RESERVES_STALE_DAYS,
  type ObservatoryStatus,
  type ReservesPoint,
} from "@/lib/observatory-constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface ReservesResponse {
  /** 십억 달러 단위 (수집 단계에서 변환 완료 — 여기서 재변환하지 않는다) */
  series: ReservesPoint[];
  latest: ReservesPoint | null;
  previous: ReservesPoint | null;
  status: ObservatoryStatus;
  /** 전주 대비 증감, 십억 달러 */
  weekOverWeekChange: number | null;
  /** 2019년 발작 수준 대비 배수 */
  multipleOf2019: number | null;
  /** 최신 기준일이 RESERVES_STALE_DAYS 보다 오래됐는지 */
  dataDelayed: boolean;
  /** 최신 기준일이 며칠 전인지 */
  daysSinceLatest: number | null;
  seriesId: string;
  thresholds: {
    /** 이 값(십억 달러) 초과면 정상 */
    normalBillions: number;
    /** 이 값(십억 달러) 미만이면 경보 */
    alertBillions: number;
    staleDays: number;
    /** 2019년 레포 발작 당시 수준, 십억 달러 */
    crisis2019Billions: number;
    crisis2019Date: string;
  };
  lastUpdated: string;
}

export async function GET() {
  try {
    let series = await loadReserves();

    // 아직 cron 이 한 번도 안 돈 상태면 이 요청에서 한 번 채운다.
    // (첫 배포 직후 페이지가 빈 화면으로 보이는 것을 막는다)
    if (series.length === 0) {
      try {
        await collectReserves();
        series = await loadReserves();
      } catch (e) {
        console.error("[observatory/reserves] 최초 수집 실패:", e);
      }
    }

    const verdict = evaluateReserves(series);

    // FRED 가 실패해도 여기서는 Redis 의 마지막 성공값을 그대로 쓴다.
    // 수집이 계속 막히면 기준일이 늙어 dataDelayed 가 켜진다.
    const daysSinceLatest = verdict.latest
      ? daysSinceObservation(verdict.latest.date)
      : null;
    const dataDelayed =
      daysSinceLatest !== null && daysSinceLatest > RESERVES_STALE_DAYS;

    const body: ReservesResponse = {
      series,
      latest: verdict.latest,
      previous: verdict.previous,
      status: verdict.status,
      weekOverWeekChange: verdict.weekOverWeekChange,
      multipleOf2019: verdict.multipleOf2019,
      dataDelayed,
      daysSinceLatest,
      seriesId: RESERVES_SERIES_ID,
      thresholds: {
        normalBillions: RESERVES_NORMAL_BILLIONS,
        alertBillions: RESERVES_ALERT_BILLIONS,
        staleDays: RESERVES_STALE_DAYS,
        crisis2019Billions: RESERVES_2019_CRISIS_BILLIONS,
        crisis2019Date: RESERVES_2019_CRISIS_DATE,
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
