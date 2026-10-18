import { NextResponse } from "next/server";
import { collectYields, loadYields, RATE_VOL_SERIES_ID } from "@/lib/observatory-rate-vol";
import {
  evaluateRateVol,
  rateVolFiringStats,
  RV_ALERT_PCTILE,
  RV_CAUTION_PCTILE,
  RV_MIN_OBS,
  RV_RANK_WINDOW,
  RV_WINDOW_DAYS,
  withRateVol,
  type FiringStats,
  type ObservatoryStatus,
  type RateVolRow,
} from "@/lib/observatory-constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface RateVolResponse {
  /** 차트용 — 최근 10년치만 보낸다 (전체 6,700일을 다 보내면 응답이 커진다) */
  series: RateVolRow[];
  latest: RateVolRow | null;
  status: ObservatoryStatus | null;
  percentile: number | null;
  /** 판정할 수 있었던 영업일 중 주의 이상 비율 — 전 기간(2000년~) 저장 데이터로 매 요청 계산 */
  firing: FiringStats;
  seriesId: string;
  thresholds: {
    cautionPctile: number;
    alertPctile: number;
    cautionCutBp: number | null;
    alertCutBp: number | null;
    obs: number;
    minObs: number;
    rankWindow: number;
    rvWindow: number;
  };
  lastUpdated: string;
}

export async function GET() {
  try {
    let points = await loadYields();
    if (points.length === 0) {
      try {
        await collectYields();
        points = await loadYields();
      } catch (e) {
        console.error("[observatory/rate-volatility] 최초 수집 실패:", e);
      }
    }
    const rows = withRateVol(points);
    const v = evaluateRateVol(rows);
    const body: RateVolResponse = {
      series: rows.slice(-RV_RANK_WINDOW),
      latest: v.latest,
      status: v.status,
      percentile: v.percentile,
      firing: rateVolFiringStats(rows),
      seriesId: RATE_VOL_SERIES_ID,
      thresholds: {
        cautionPctile: RV_CAUTION_PCTILE,
        alertPctile: RV_ALERT_PCTILE,
        cautionCutBp: v.cautionCutBp,
        alertCutBp: v.alertCutBp,
        obs: v.obs,
        minObs: RV_MIN_OBS,
        rankWindow: RV_RANK_WINDOW,
        rvWindow: RV_WINDOW_DAYS,
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
