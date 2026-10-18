import { NextResponse } from "next/server";
import { nyFedAttribution, SOFR_NOTICE } from "@/app/observatory/source-notices";
import { collectSofrIorb, loadSofrIorb } from "@/lib/observatory-sofr-iorb";
import {
  evaluateSofrIorb,
  MONTH_END_EXCLUDE_DAYS,
  POSITIVE_DAYS_THRESHOLD,
  POSITIVE_DAYS_WINDOW,
  SPIKE_THRESHOLD_BP,
  type ObservatoryStatus,
  type SofrIorbPoint,
  tailFiringStats,
  type FiringStats,
} from "@/lib/observatory-constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface SofrIorbResponse {
  /** 뉴욕 연은 이용 약관이 요구하는 출처 표기 (app/observatory/source-notices.tsx) */
  attribution: string;
  /** 발동 비율 — 각 시점에 같은 판정 함수를 적용 (관측소 작업 규칙 4) */
  firing: FiringStats;
  series: SofrIorbPoint[];
  latest: SofrIorbPoint | null;
  status: ObservatoryStatus;
  positiveDays: number;
  spikeDates: string[];
  thresholds: {
    positiveDaysWindow: number;
    positiveDaysThreshold: number;
    spikeThresholdBp: number;
    monthEndExcludeDays: number;
  };
  lastUpdated: string;
}

export async function GET() {
  try {
    let series = await loadSofrIorb();

    // 아직 cron 이 한 번도 안 돈 상태면 이 요청에서 한 번 채운다.
    // (첫 배포 직후 페이지가 빈 화면으로 보이는 것을 막는다)
    if (series.length === 0) {
      try {
        await collectSofrIorb();
        series = await loadSofrIorb();
      } catch (e) {
        console.error("[observatory/sofr-iorb] 최초 수집 실패:", e);
      }
    }

    const verdict = evaluateSofrIorb(series);

    const body: SofrIorbResponse = {
      attribution: nyFedAttribution() + " " + SOFR_NOTICE,
      firing: tailFiringStats(series.map((p) => p.date), series, (t) => evaluateSofrIorb(t).status),
      series,
      latest: verdict.latest,
      status: verdict.status,
      positiveDays: verdict.positiveDays,
      spikeDates: verdict.spikeDates,
      thresholds: {
        positiveDaysWindow: POSITIVE_DAYS_WINDOW,
        positiveDaysThreshold: POSITIVE_DAYS_THRESHOLD,
        spikeThresholdBp: SPIKE_THRESHOLD_BP,
        monthEndExcludeDays: MONTH_END_EXCLUDE_DAYS,
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
