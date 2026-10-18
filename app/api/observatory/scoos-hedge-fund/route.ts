import { NextResponse } from "next/server";
import { collectScoos, SCOOS_ZIP_URL, loadScoos } from "@/lib/observatory-scoos";
import {
  evaluateScoos,
  SCOOS_ALERT_PCTILE,
  SCOOS_CAUTION_PCTILE,
  SCOOS_MIN_OBS,
  scoosFiringStats,
  type FiringStats,
  type ScoosPoint,
  type ObservatoryStatus,
} from "@/lib/observatory-constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface ScoosResponse {
  series: ScoosPoint[];
  latest: ScoosPoint | null;
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
    let points = await loadScoos();
    // 아직 cron 이 한 번도 안 돈 상태면 이 요청에서 한 번 채운다
    if (points.length === 0) {
      try {
        await collectScoos();
        points = await loadScoos();
      } catch (e) {
        console.error("[observatory/scoos-hedge-fund] 최초 수집 실패:", e);
      }
    }
    const rows = points;
    const v = evaluateScoos(rows);
    const body: ScoosResponse = {
      series: rows,
      latest: rows.length ? rows[rows.length - 1] : null,
      status: v.status,
      percentile: v.percentile,
      firing: scoosFiringStats(rows),
      sourceUrl: SCOOS_ZIP_URL,
      thresholds: {
        cautionPctile: SCOOS_CAUTION_PCTILE,
        alertPctile: SCOOS_ALERT_PCTILE,
        cautionCut: v.cautionCut,
        alertCut: v.alertCut,
        obs: v.obs,
        minObs: SCOOS_MIN_OBS,
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
