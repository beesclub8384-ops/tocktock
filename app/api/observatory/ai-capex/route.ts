import { NextResponse } from "next/server";
import { CAPEX_COMPANIES, collectCapex, loadCapex } from "@/lib/observatory-capex";
import {
  CAPEX_ALERT_PCTILE,
  CAPEX_CAUTION_PCTILE,
  CAPEX_MIN_OBS,
  capexFiringStats,
  evaluateCapex,
  withCapexChanges,
  type CapexRow,
  type FiringStats,
  type ObservatoryStatus,
} from "@/lib/observatory-constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface CapexResponse {
  series: CapexRow[];
  latest: CapexRow | null;
  status: ObservatoryStatus | null;
  percentile: number | null;
  firing: FiringStats;
  companies: { ticker: string; name: string; tag: string }[];
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
    let points = await loadCapex();
    if (points.length === 0) {
      try {
        await collectCapex();
        points = await loadCapex();
      } catch (e) {
        console.error("[observatory/ai-capex] 최초 수집 실패:", e);
      }
    }
    const rows = withCapexChanges(points);
    const v = evaluateCapex(rows);
    const body: CapexResponse = {
      series: rows,
      latest: rows.length ? rows[rows.length - 1] : null,
      status: v.status,
      percentile: v.percentile,
      firing: capexFiringStats(rows),
      companies: Object.entries(CAPEX_COMPANIES).map(([ticker, c]) => ({ ticker, name: c.name, tag: c.tag })),
      thresholds: {
        cautionPctile: CAPEX_CAUTION_PCTILE,
        alertPctile: CAPEX_ALERT_PCTILE,
        cautionCut: v.cautionCut,
        alertCut: v.alertCut,
        obs: v.obs,
        minObs: CAPEX_MIN_OBS,
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
