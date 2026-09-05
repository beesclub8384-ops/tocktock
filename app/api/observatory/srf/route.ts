import { NextResponse } from "next/server";
import { collectSrf, loadSrf, SRF_SERIES_ID } from "@/lib/observatory-srf";
import {
  evaluateSrf,
  SRF_ALERT_DAYS,
  SRF_LOOKBACK_DAYS,
  SRF_WARN_DAYS,
  type ObservatoryStatus,
  type SrfPoint,
} from "@/lib/observatory-constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface SrfResponse {
  series: SrfPoint[];
  latest: SrfPoint | null;
  status: ObservatoryStatus;
  usedDays: number;
  maxUsage: number;
  seriesId: string;
  thresholds: {
    lookbackDays: number;
    warnDays: number;
    alertDays: number;
  };
  lastUpdated: string;
}

export async function GET() {
  try {
    let series = await loadSrf();

    // 아직 cron 이 한 번도 안 돈 상태면 이 요청에서 한 번 채운다.
    // (첫 배포 직후 페이지가 빈 화면으로 보이는 것을 막는다)
    if (series.length === 0) {
      try {
        await collectSrf();
        series = await loadSrf();
      } catch (e) {
        console.error("[observatory/srf] 최초 수집 실패:", e);
      }
    }

    const verdict = evaluateSrf(series);

    const body: SrfResponse = {
      series,
      latest: verdict.latest,
      status: verdict.status,
      usedDays: verdict.usedDays,
      maxUsage: verdict.maxUsage,
      seriesId: SRF_SERIES_ID,
      thresholds: {
        lookbackDays: SRF_LOOKBACK_DAYS,
        warnDays: SRF_WARN_DAYS,
        alertDays: SRF_ALERT_DAYS,
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
