import { NextResponse } from "next/server";
import {
  BASIS_TRADE_CONTRACTS,
  BASIS_TRADE_DATASET_ID,
  collectBasisTrade,
  loadBasisTrade,
} from "@/lib/observatory-basis-trade";
import {
  BT_CONC_CAUTION_PCTILE,
  BT_LIQ_ALERT_PCTILE,
  BT_LIQ_CAUTION_PCTILE,
  BT_LOOKBACK_WEEKS,
  evaluateBasisTrade,
  type BasisTradePoint,
  type ObservatoryStatus,
} from "@/lib/observatory-constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface BasisTradeResponse {
  series: BasisTradePoint[];
  latest: BasisTradePoint | null;
  /** 최종 판정. null = 판정 보류 (백분위를 구할 데이터 부족) */
  status: ObservatoryStatus | null;
  liquidationStatus: ObservatoryStatus | null;
  concentrationStatus: ObservatoryStatus | null;
  /** 최신 액면 명목의 최근 157주 백분위 순위 (0~100) */
  percentile3y: number | null;
  datasetId: string;
  contracts: { code: string; label: string; faceUsd: number }[];
  thresholds: {
    /** 4주 변화율이 전 기간 이 백분위 이하면 주의 */
    liquidationCautionPctile: number;
    /** 4주 변화율이 전 기간 이 백분위 이하면 경보 */
    liquidationAlertPctile: number;
    /** 위 백분위에 해당하는 실제 변화율 (%) — 저장된 데이터로 계산 */
    liquidationCautionCutoffPct: number | null;
    liquidationAlertCutoffPct: number | null;
    /** 분포에 쓴 4주 변화율 개수 */
    changeObs: number;
    /** 액면 명목이 최근 창에서 이 백분위 이상이면 주의 */
    concentrationCautionPctile: number;
    /** 위 백분위에 해당하는 액면 명목 (십억 달러) */
    concentrationCutoffBillions: number | null;
    lookbackWeeks: number;
  };
  lastUpdated: string;
}

export async function GET() {
  try {
    let series = await loadBasisTrade();

    // 아직 cron 이 한 번도 안 돈 상태면 이 요청에서 한 번 채운다.
    // (첫 배포 직후 페이지가 빈 화면으로 보이는 것을 막는다)
    if (series.length === 0) {
      try {
        await collectBasisTrade();
        series = await loadBasisTrade();
      } catch (e) {
        console.error("[observatory/basis-trade] 최초 수집 실패:", e);
      }
    }

    const v = evaluateBasisTrade(series);

    const body: BasisTradeResponse = {
      series,
      latest: v.latest,
      status: v.status,
      liquidationStatus: v.liquidationStatus,
      concentrationStatus: v.concentrationStatus,
      percentile3y: v.percentile3y,
      datasetId: BASIS_TRADE_DATASET_ID,
      contracts: Object.entries(BASIS_TRADE_CONTRACTS).map(([code, c]) => ({
        code,
        label: c.label,
        faceUsd: c.faceUsd,
      })),
      thresholds: {
        liquidationCautionPctile: BT_LIQ_CAUTION_PCTILE,
        liquidationAlertPctile: BT_LIQ_ALERT_PCTILE,
        liquidationCautionCutoffPct: v.liquidationCautionCutoffPct,
        liquidationAlertCutoffPct: v.liquidationAlertCutoffPct,
        changeObs: v.changeObs,
        concentrationCautionPctile: BT_CONC_CAUTION_PCTILE,
        concentrationCutoffBillions: v.concentrationCutoffBillions,
        lookbackWeeks: BT_LOOKBACK_WEEKS,
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
