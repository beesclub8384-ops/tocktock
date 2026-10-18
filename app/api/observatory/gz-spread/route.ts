import { NextResponse } from "next/server";
import { collectGz, GZ_CSV_URL, loadGz } from "@/lib/observatory-credit";
import {
  evaluateGz,
  GZ_ALERT_PCTILE,
  GZ_CAUTION_PCTILE,
  GZ_MIN_OBS,
  gzFiringStats,
  type FiringStats,
  type MonthSpreadPoint,
  type ObservatoryStatus,
} from "@/lib/observatory-constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface GzResponse {
  series: MonthSpreadPoint[];
  latest: MonthSpreadPoint | null;
  status: ObservatoryStatus | null;
  percentile: number | null;
  firing: FiringStats;
  sourceUrl: string;
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
    let points = await loadGz();
    // 아직 cron 이 한 번도 안 돈 상태면 이 요청에서 한 번 채운다
    if (points.length === 0) {
      try {
        await collectGz();
        points = await loadGz();
      } catch (e) {
        console.error("[observatory/gz-spread] 최초 수집 실패:", e);
      }
    }
    const v = evaluateGz(points);
    const body: GzResponse = {
      series: points,
      latest: points.length ? points[points.length - 1] : null,
      status: v.status,
      percentile: v.percentile,
      firing: gzFiringStats(points),
      sourceUrl: GZ_CSV_URL,
      thresholds: {
        cautionPctile: GZ_CAUTION_PCTILE,
        alertPctile: GZ_ALERT_PCTILE,
        cautionCut: v.cautionCut,
        alertCut: v.alertCut,
        obs: v.obs,
        minObs: GZ_MIN_OBS,
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
