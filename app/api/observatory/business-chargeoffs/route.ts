import { NextResponse } from "next/server";
import { CHARGEOFF_SERIES_ID, collectChargeOffs, loadChargeOffs } from "@/lib/observatory-credit";
import {
  CHARGEOFF_ALERT_PCTILE,
  CHARGEOFF_CAUTION_PCTILE,
  CHARGEOFF_MIN_OBS,
  chargeOffFiringStats,
  evaluateChargeOff,
  type FiringStats,
  type ObservatoryStatus,
  type QuarterRatePoint,
} from "@/lib/observatory-constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface ChargeOffResponse {
  series: QuarterRatePoint[];
  latest: QuarterRatePoint | null;
  status: ObservatoryStatus | null;
  percentile: number | null;
  firing: FiringStats;
  seriesId: string;
  thresholds: {
    cautionPctile: number;
    alertPctile: number;
    cautionCut: number | null;
    alertCut: number | null;
    obs: number;
    minObs: number;
  };
  lastUpdated: string;
}

export async function GET() {
  try {
    let points = await loadChargeOffs();
    if (points.length === 0) {
      try {
        await collectChargeOffs();
        points = await loadChargeOffs();
      } catch (e) {
        console.error("[observatory/business-chargeoffs] 최초 수집 실패:", e);
      }
    }
    const v = evaluateChargeOff(points);
    const body: ChargeOffResponse = {
      series: points,
      latest: points.length ? points[points.length - 1] : null,
      status: v.status,
      percentile: v.percentile,
      firing: chargeOffFiringStats(points),
      seriesId: CHARGEOFF_SERIES_ID,
      thresholds: {
        cautionPctile: CHARGEOFF_CAUTION_PCTILE,
        alertPctile: CHARGEOFF_ALERT_PCTILE,
        cautionCut: v.cautionCut,
        alertCut: v.alertCut,
        obs: v.obs,
        minObs: CHARGEOFF_MIN_OBS,
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
