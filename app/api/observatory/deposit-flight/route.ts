import { NextResponse } from "next/server";
import {
  collectDepositFlightQuarterly,
  collectDepositFlightWeekly,
  loadDepositFlightQuarterly,
  loadDepositFlightWeekly,
  DF_LARGE_SERIES_ID,
  DF_QUARTERLY_COMPARABLE_FROM,
  DF_SMALL_SERIES_ID,
} from "@/lib/observatory-deposit-flight";
import {
  evaluateDepositFlight,
  DF_ALERT_UNINSURED_PCT,
  DF_ALERT_WEEKLY_PP,
  DF_WARN_UNINSURED_PCT,
  DF_WARN_WEEKLY_PP,
  type DepositFlightQuarterlyPoint,
  type DepositFlightWeeklyPoint,
  type ObservatoryStatus,
} from "@/lib/observatory-constants";

export const dynamic = "force-dynamic";
// 분기 파트가 2.6MB 워크북을 받으므로 최초 수집이 붙는 요청은 길다
export const maxDuration = 120;

export interface DepositFlightResponse {
  weekly: DepositFlightWeeklyPoint[];
  quarterly: DepositFlightQuarterlyPoint[];
  latestWeekly: DepositFlightWeeklyPoint | null;
  latestQuarterly: DepositFlightQuarterlyPoint | null;
  /** 둘 중 더 나쁜 쪽 */
  status: ObservatoryStatus;
  weeklyStatus: ObservatoryStatus;
  quarterlyStatus: ObservatoryStatus;
  seriesIds: { small: string; large: string };
  /** 정의 변경 단절 이후 구간 (차트 기본 시작점) */
  quarterlyComparableFrom: string;
  thresholds: {
    /** 주간 — 1주 비중 변화(%p)가 이 값 이하면 주의 (음수) */
    warnWeeklyPp: number;
    /** 주간 — 1주 비중 변화(%p)가 이 값 이하면 경보 (음수) */
    alertWeeklyPp: number;
    /** 분기 — 무보험 비중(%)이 이 값 이상이면 주의 */
    warnUninsuredPct: number;
    /** 분기 — 무보험 비중(%)이 이 값 이상이면 경보 */
    alertUninsuredPct: number;
  };
  lastUpdated: string;
}

export async function GET() {
  try {
    let [weekly, quarterly] = await Promise.all([
      loadDepositFlightWeekly(),
      loadDepositFlightQuarterly(),
    ]);

    // 아직 cron 이 한 번도 안 돈 상태면 이 요청에서 한 번 채운다.
    // 두 파트는 서로 독립이라 한쪽이 실패해도 다른 쪽은 살린다.
    if (weekly.length === 0) {
      try {
        await collectDepositFlightWeekly();
        weekly = await loadDepositFlightWeekly();
      } catch (e) {
        console.error("[observatory/deposit-flight] 주간 최초 수집 실패:", e);
      }
    }
    if (quarterly.length === 0) {
      try {
        await collectDepositFlightQuarterly();
        quarterly = await loadDepositFlightQuarterly();
      } catch (e) {
        console.error("[observatory/deposit-flight] 분기 최초 수집 실패:", e);
      }
    }

    const verdict = evaluateDepositFlight(weekly, quarterly);

    const body: DepositFlightResponse = {
      weekly,
      quarterly,
      latestWeekly: verdict.latestWeekly,
      latestQuarterly: verdict.latestQuarterly,
      status: verdict.status,
      weeklyStatus: verdict.weeklyStatus,
      quarterlyStatus: verdict.quarterlyStatus,
      seriesIds: { small: DF_SMALL_SERIES_ID, large: DF_LARGE_SERIES_ID },
      quarterlyComparableFrom: DF_QUARTERLY_COMPARABLE_FROM,
      thresholds: {
        warnWeeklyPp: DF_WARN_WEEKLY_PP,
        alertWeeklyPp: DF_ALERT_WEEKLY_PP,
        warnUninsuredPct: DF_WARN_UNINSURED_PCT,
        alertUninsuredPct: DF_ALERT_UNINSURED_PCT,
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
