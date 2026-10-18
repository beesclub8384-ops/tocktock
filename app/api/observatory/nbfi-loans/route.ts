import { NextResponse } from "next/server";
import {
  collectNbfiLoans,
  loadNbfiLoans,
  NBFI_SERIES_ID,
  TOTAL_LOANS_SERIES_ID,
} from "@/lib/observatory-nbfi-loans";
import {
  evaluateNbfiLoans,
  NBFI_ALERT_PCTILE,
  NBFI_CAUTION_PCTILE,
  NBFI_CHANGE_WEEKS,
  NBFI_MIN_YOY_OBS,
  NBFI_YOY_WEEKS,
  withNbfiChanges,
  type NbfiLoansRow,
  type ObservatoryStatus,
} from "@/lib/observatory-constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface NbfiLoansResponse {
  /** 저장된 점 + YoY·13주 변화·비중 */
  series: NbfiLoansRow[];
  latest: NbfiLoansRow | null;
  /** 최종 판정. null = 판정 보류 */
  status: ObservatoryStatus | null;
  /** 최신 YoY 의 전 기간 분포 내 순위 (0~100) */
  yoyPercentile: number | null;
  seriesId: string;
  totalLoansSeriesId: string;
  thresholds: {
    cautionPctile: number;
    alertPctile: number;
    /** 위 백분위에 해당하는 YoY (%) — 저장된 데이터로 계산 */
    cautionCutoffPct: number | null;
    alertCutoffPct: number | null;
    yoyObs: number;
    minYoyObs: number;
    yoyWeeks: number;
    changeWeeks: number;
  };
  lastUpdated: string;
}

export async function GET() {
  try {
    let points = await loadNbfiLoans();

    // 아직 cron 이 한 번도 안 돈 상태면 이 요청에서 한 번 채운다.
    // (첫 배포 직후 페이지가 빈 화면으로 보이는 것을 막는다)
    if (points.length === 0) {
      try {
        await collectNbfiLoans();
        points = await loadNbfiLoans();
      } catch (e) {
        console.error("[observatory/nbfi-loans] 최초 수집 실패:", e);
      }
    }

    const series = withNbfiChanges(points);
    const v = evaluateNbfiLoans(series);

    const body: NbfiLoansResponse = {
      series,
      latest: v.latest,
      status: v.status,
      yoyPercentile: v.yoyPercentile,
      seriesId: NBFI_SERIES_ID,
      totalLoansSeriesId: TOTAL_LOANS_SERIES_ID,
      thresholds: {
        cautionPctile: NBFI_CAUTION_PCTILE,
        alertPctile: NBFI_ALERT_PCTILE,
        cautionCutoffPct: v.cautionCutoffPct,
        alertCutoffPct: v.alertCutoffPct,
        yoyObs: v.yoyObs,
        minYoyObs: NBFI_MIN_YOY_OBS,
        yoyWeeks: NBFI_YOY_WEEKS,
        changeWeeks: NBFI_CHANGE_WEEKS,
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
