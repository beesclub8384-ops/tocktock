import { NextResponse } from "next/server";
import { collectRrp, loadRrp, RRP_SERIES_ID } from "@/lib/observatory-rrp";
import {
  daysSinceObservation,
  evaluateRrp,
  RRP_ALERT_BILLIONS,
  RRP_NORMAL_BILLIONS,
  RRP_PEAK_2022_BILLIONS,
  RRP_PEAK_2022_DATE,
  RRP_STALE_DAYS,
  type ObservatoryStatus,
  type RrpPoint,
} from "@/lib/observatory-constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface RrpResponse {
  /** 십억 달러 단위 (FRED 원단위 그대로 — 변환 없음) */
  series: RrpPoint[];
  latest: RrpPoint | null;
  previous: RrpPoint | null;
  status: ObservatoryStatus;
  /** 최신값이 2022년 정점 대비 몇 % 인지 */
  pctOfPeak: number | null;
  /** 최신 기준일이 RRP_STALE_DAYS 보다 오래됐는지 (= FRED 갱신이 막힌 상태) */
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
    /** 2022년 말 정점, 십억 달러 */
    peakBillions: number;
    peakDate: string;
  };
  lastUpdated: string;
}

export async function GET() {
  try {
    let series = await loadRrp();

    // 아직 cron 이 한 번도 안 돈 상태면 이 요청에서 한 번 채운다.
    // (첫 배포 직후 페이지가 빈 화면으로 보이는 것을 막는다)
    if (series.length === 0) {
      try {
        await collectRrp();
        series = await loadRrp();
      } catch (e) {
        console.error("[observatory/rrp] 최초 수집 실패:", e);
      }
    }

    const verdict = evaluateRrp(series);

    // FRED 가 실패해도 여기서는 Redis 의 마지막 성공값을 그대로 쓴다.
    // 수집이 계속 막히면 기준일이 늙어 dataDelayed 가 켜지고,
    // 화면에 "데이터 지연" 과 마지막 성공 기준일이 함께 표시된다.
    const daysSinceLatest = verdict.latest
      ? daysSinceObservation(verdict.latest.date)
      : null;
    const dataDelayed = daysSinceLatest !== null && daysSinceLatest > RRP_STALE_DAYS;

    const body: RrpResponse = {
      series,
      latest: verdict.latest,
      previous: verdict.previous,
      status: verdict.status,
      pctOfPeak: verdict.pctOfPeak,
      dataDelayed,
      daysSinceLatest,
      seriesId: RRP_SERIES_ID,
      thresholds: {
        normalBillions: RRP_NORMAL_BILLIONS,
        alertBillions: RRP_ALERT_BILLIONS,
        staleDays: RRP_STALE_DAYS,
        peakBillions: RRP_PEAK_2022_BILLIONS,
        peakDate: RRP_PEAK_2022_DATE,
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
