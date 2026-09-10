import { NextResponse } from "next/server";
import {
  collectUnrealizedLosses,
  loadUnrealizedLosses,
  UL_FIRST_QUARTER,
  type UnrealizedLossMeta,
} from "@/lib/observatory-banks";
import {
  evaluateUnrealizedLosses,
  UL_ALERT_PCT,
  UL_CAUTION_PCT,
  UL_PEAK_PCT,
  UL_PEAK_QUARTER,
  UL_SVB_QUARTER,
  type ObservatoryStatus,
  type UnrealizedLossPoint,
} from "@/lib/observatory-constants";

export const dynamic = "force-dynamic";
// FDIC 워크북이 2.6MB 라 최초 수집이 붙는 요청은 조금 길다
export const maxDuration = 120;

export interface UnrealizedLossesResponse {
  series: UnrealizedLossPoint[];
  latest: UnrealizedLossPoint | null;
  previous: UnrealizedLossPoint | null;
  status: ObservatoryStatus;
  /** 최신값이 2022Q3 정점 대비 몇 % 인지 */
  pctOfPeak: number | null;
  meta: UnrealizedLossMeta | null;
  firstQuarter: string;
  thresholds: {
    /** 이 비율(%) 이상이면 주의 */
    cautionPct: number;
    /** 이 비율(%) 초과면 경보 */
    alertPct: number;
    /** 실측 정점 (%) */
    peakPct: number;
    /** 정점 분기 */
    peakQuarter: string;
    /** SVB 파산 분기 (사건 마커) */
    svbQuarter: string;
  };
  lastUpdated: string;
}

export async function GET() {
  try {
    let store = await loadUnrealizedLosses();

    // 아직 cron 이 한 번도 안 돈 상태면 이 요청에서 한 번 채운다.
    // (첫 배포 직후 페이지가 빈 화면으로 보이는 것을 막는다)
    if (store.series.length === 0) {
      try {
        await collectUnrealizedLosses();
        store = await loadUnrealizedLosses();
      } catch (e) {
        console.error("[observatory/unrealized-losses] 최초 수집 실패:", e);
      }
    }

    const verdict = evaluateUnrealizedLosses(store.series);

    const body: UnrealizedLossesResponse = {
      series: store.series,
      latest: verdict.latest,
      previous: verdict.previous,
      status: verdict.status,
      pctOfPeak: verdict.pctOfPeak,
      meta: store.meta,
      firstQuarter: UL_FIRST_QUARTER,
      thresholds: {
        cautionPct: UL_CAUTION_PCT,
        alertPct: UL_ALERT_PCT,
        peakPct: UL_PEAK_PCT,
        peakQuarter: UL_PEAK_QUARTER,
        svbQuarter: UL_SVB_QUARTER,
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
