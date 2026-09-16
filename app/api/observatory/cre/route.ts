import { NextResponse } from "next/server";
import {
  collectCreConcentration,
  collectCreSizeSplit,
  loadCreConcentration,
  loadCreSizeSplit,
  CRE_SERIES_ALL,
  CRE_SERIES_OTHER,
  CRE_SERIES_TOP100,
} from "@/lib/observatory-cre";
import {
  evaluateCre,
  CRE_ALERT_CONCENTRATION_PCT,
  CRE_ALERT_DELINQ_PCT,
  CRE_ALERT_DELINQ_YOY_PP,
  CRE_REGIONAL_BUCKET,
  CRE_WARN_CONCENTRATION_PCT,
  CRE_WARN_DELINQ_PCT,
  CRE_WARN_DELINQ_YOY_PP,
  type CreConcentrationPoint,
  type CreDelinquencyPoint,
  type CreSizeSplitPoint,
  type ObservatoryStatus,
} from "@/lib/observatory-constants";

export const dynamic = "force-dynamic";
// 워크북이 2.6MB 라 최초 수집이 붙는 요청은 길다
export const maxDuration = 120;

export interface CreResponse {
  /** 임대용/자가사용 비주거 CRE 연체율 (워크북) */
  delinquency: CreDelinquencyPoint[];
  /** 규모별 CRE 연체율 (FRED) */
  sizeSplit: CreSizeSplitPoint[];
  /** 자산 규모별 CRE 집중도 (워크북) */
  concentration: CreConcentrationPoint[];
  /** 규모 구간 라벨 (그리는 순서) */
  buckets: string[];
  latestDelinquency: CreDelinquencyPoint | null;
  latestSizeSplit: CreSizeSplitPoint | null;
  latestConcentration: CreConcentrationPoint | null;
  regionalConcentrationPct: number | null;
  /** 셋 중 가장 나쁜 것 */
  status: ObservatoryStatus;
  delinquencyStatus: ObservatoryStatus;
  momentumStatus: ObservatoryStatus;
  concentrationStatus: ObservatoryStatus;
  seriesIds: { top100: string; other: string; all: string };
  regionalBucket: string;
  thresholds: {
    warnDelinqPct: number;
    alertDelinqPct: number;
    warnDelinqYoyPp: number;
    alertDelinqYoyPp: number;
    warnConcentrationPct: number;
    alertConcentrationPct: number;
  };
  lastUpdated: string;
}

export async function GET() {
  try {
    let [sizeSplit, store] = await Promise.all([
      loadCreSizeSplit(),
      loadCreConcentration(),
    ]);

    // 아직 cron 이 한 번도 안 돈 상태면 이 요청에서 한 번 채운다.
    // 두 출처는 독립이라 한쪽이 실패해도 다른 쪽은 살린다.
    if (sizeSplit.length === 0) {
      try {
        await collectCreSizeSplit();
        sizeSplit = await loadCreSizeSplit();
      } catch (e) {
        console.error("[observatory/cre] FRED 최초 수집 실패:", e);
      }
    }
    if (store.concentration.length === 0) {
      try {
        await collectCreConcentration();
        store = await loadCreConcentration();
      } catch (e) {
        console.error("[observatory/cre] 워크북 최초 수집 실패:", e);
      }
    }

    const verdict = evaluateCre(store.delinquency, sizeSplit, store.concentration);

    const body: CreResponse = {
      delinquency: store.delinquency,
      sizeSplit,
      concentration: store.concentration,
      buckets: store.buckets,
      latestDelinquency: verdict.latestDelinquency,
      latestSizeSplit: verdict.latestSizeSplit,
      latestConcentration: verdict.latestConcentration,
      regionalConcentrationPct: verdict.regionalConcentrationPct,
      status: verdict.status,
      delinquencyStatus: verdict.delinquencyStatus,
      momentumStatus: verdict.momentumStatus,
      concentrationStatus: verdict.concentrationStatus,
      seriesIds: {
        top100: CRE_SERIES_TOP100,
        other: CRE_SERIES_OTHER,
        all: CRE_SERIES_ALL,
      },
      regionalBucket: CRE_REGIONAL_BUCKET,
      thresholds: {
        warnDelinqPct: CRE_WARN_DELINQ_PCT,
        alertDelinqPct: CRE_ALERT_DELINQ_PCT,
        warnDelinqYoyPp: CRE_WARN_DELINQ_YOY_PP,
        alertDelinqYoyPp: CRE_ALERT_DELINQ_YOY_PP,
        warnConcentrationPct: CRE_WARN_CONCENTRATION_PCT,
        alertConcentrationPct: CRE_ALERT_CONCENTRATION_PCT,
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
