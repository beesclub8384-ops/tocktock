import { NextResponse } from "next/server";
import { collectFhlb, loadFhlb, FHLB_SERIES_ID } from "@/lib/observatory-fhlb";
import {
  evaluateFhlb,
  FHLB_ALERT_QOQ_PCT,
  FHLB_WARN_QOQ_PCT,
  type FhlbPoint,
  type ObservatoryStatus,
} from "@/lib/observatory-constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface FhlbResponse {
  series: FhlbPoint[];
  latest: FhlbPoint | null;
  previous: FhlbPoint | null;
  status: ObservatoryStatus;
  seriesId: string;
  thresholds: {
    /** 전분기 대비 이 증가율(%) 이상이면 주의 */
    warnQoqPct: number;
    /** 전분기 대비 이 증가율(%) 이상이면 경보 */
    alertQoqPct: number;
  };
  lastUpdated: string;
}

export async function GET() {
  try {
    let series = await loadFhlb();

    // 아직 cron 이 한 번도 안 돈 상태면 이 요청에서 한 번 채운다.
    // (첫 배포 직후 페이지가 빈 화면으로 보이는 것을 막는다)
    if (series.length === 0) {
      try {
        await collectFhlb();
        series = await loadFhlb();
      } catch (e) {
        console.error("[observatory/fhlb] 최초 수집 실패:", e);
      }
    }

    const verdict = evaluateFhlb(series);

    const body: FhlbResponse = {
      series,
      latest: verdict.latest,
      previous: verdict.previous,
      status: verdict.status,
      seriesId: FHLB_SERIES_ID,
      thresholds: {
        warnQoqPct: FHLB_WARN_QOQ_PCT,
        alertQoqPct: FHLB_ALERT_QOQ_PCT,
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
