import { NextResponse } from "next/server";
import { nyFedAttribution } from "@/app/observatory/source-notices";
import { collectDealers, DEALER_API_URL, loadDealers } from "@/lib/observatory-dealers";
import {
  evaluateDealer,
  DEALER_ALERT_PCTILE,
  DEALER_CAUTION_PCTILE,
  DEALER_MIN_OBS,
  dealerFiringStats,
  withDealerChanges,
  type FiringStats,
  type DealerRow,
  type ObservatoryStatus,
} from "@/lib/observatory-constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface DealerResponse {
  /** 뉴욕 연은 이용 약관이 요구하는 출처 표기 (app/observatory/source-notices.tsx) */
  attribution: string;
  series: DealerRow[];
  latest: DealerRow | null;
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
    let points = await loadDealers();
    // 아직 cron 이 한 번도 안 돈 상태면 이 요청에서 한 번 채운다
    if (points.length === 0) {
      try {
        await collectDealers();
        points = await loadDealers();
      } catch (e) {
        console.error("[observatory/dealer-treasury-positions] 최초 수집 실패:", e);
      }
    }
    const rows = withDealerChanges(points);
    const v = evaluateDealer(rows);
    const body: DealerResponse = {
      attribution: nyFedAttribution(),
      series: rows,
      latest: rows.length ? rows[rows.length - 1] : null,
      status: v.status,
      percentile: v.percentile,
      firing: dealerFiringStats(rows),
      sourceUrl: DEALER_API_URL,
      thresholds: {
        cautionPctile: DEALER_CAUTION_PCTILE,
        alertPctile: DEALER_ALERT_PCTILE,
        cautionCut: v.cautionCut,
        alertCut: v.alertCut,
        obs: v.obs,
        minObs: DEALER_MIN_OBS,
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
