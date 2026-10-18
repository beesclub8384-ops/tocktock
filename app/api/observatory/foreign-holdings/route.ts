import { NextResponse } from "next/server";
import { collectTic, loadTic } from "@/lib/observatory-tic";
import {
  evaluateTic,
  TIC_ALERT_PCTILE,
  TIC_CAUTION_PCTILE,
  TIC_MIN_OBS,
  TIC_START_MONTH,
  withTicChanges,
  type ObservatoryStatus,
  type TicRow,
} from "@/lib/observatory-constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface TicResponse {
  series: TicRow[];
  latest: TicRow | null;
  status: ObservatoryStatus | null;
  percentile: number | null;
  thresholds: {
    cautionPctile: number;
    alertPctile: number;
    cautionCutPct: number | null;
    alertCutPct: number | null;
    obs: number;
    minObs: number;
    startMonth: string;
  };
  lastUpdated: string;
}

export async function GET() {
  try {
    let points = await loadTic();
    if (points.length === 0) {
      try {
        await collectTic();
        points = await loadTic();
      } catch (e) {
        console.error("[observatory/foreign-holdings] 최초 수집 실패:", e);
      }
    }
    const rows = withTicChanges(points);
    const v = evaluateTic(rows);
    const body: TicResponse = {
      series: rows,
      latest: v.latest,
      status: v.status,
      percentile: v.percentile,
      thresholds: {
        cautionPctile: TIC_CAUTION_PCTILE,
        alertPctile: TIC_ALERT_PCTILE,
        cautionCutPct: v.cautionCutPct,
        alertCutPct: v.alertCutPct,
        obs: v.obs,
        minObs: TIC_MIN_OBS,
        startMonth: TIC_START_MONTH,
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
