import { NextResponse } from "next/server";
import {
  BASIS_TRADE_CONTRACTS,
  BASIS_TRADE_DATASET_ID,
  collectBasisTrade,
  compositionAt,
  loadBasisTrade,
  type BasisTradeComposition,
} from "@/lib/observatory-basis-trade";
import {
  BT_CONC_PCTILE,
  BT_LIQ_ALERT_PCTILE,
  BT_LIQ_CAUTION_PCTILE,
  BT_LONG_WEEKS,
  BT_LOOKBACK_WEEKS,
  BT_SHORT_WEEKS,
  basisTradeFiringStats,
  evaluateBasisTrade,
  withChanges,
  type FiringStats,
  type BasisTradeRow,
  type BasisTradeVerdict,
  type ObservatoryStatus,
} from "@/lib/observatory-constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface BasisTradeResponse {
  /** 저장된 점 + 4주·8주 금액 변화 (십억 달러) */
  series: BasisTradeRow[];
  latest: BasisTradeRow | null;
  /** 최종 판정. null = 판정 보류 */
  status: ObservatoryStatus | null;
  /** 청산 신호 (쏠림 격상 전) */
  liquidationStatus: ObservatoryStatus | null;
  /** 쏠림 구간 여부. null = 계산 불가 */
  concentrated: boolean | null;
  /** 최신 액면 명목의 최근 157주 백분위 순위 (0~100) */
  percentile3y: number | null;
  /** 순숏 변화의 구성 (숏·롱·미결제약정) — 판정과 무관한 참고 정보. 못 구하면 null */
  composition4w: BasisTradeComposition | null;
  composition8w: BasisTradeComposition | null;
  /** 판정할 수 있었던 주 중 주의 이상 비율 — 저장된 데이터로 매 요청 계산 */
  firing: FiringStats;
  datasetId: string;
  contracts: { code: string; label: string; faceUsd: number }[];
  thresholds: {
    /** 변화(감소)가 그 시점까지 분포의 이 백분위 이하면 주의 */
    liquidationCautionPctile: number;
    /** 변화(감소)가 그 시점까지 분포의 이 백분위 이하면 경보 */
    liquidationAlertPctile: number;
    /** 위 백분위에 해당하는 실제 변화 (십억 달러) — 저장된 데이터로 계산 */
    cutoffs: BasisTradeVerdict["cutoffs"];
    obs4w: number;
    obs8w: number;
    shortWeeks: number;
    longWeeks: number;
    /** 액면 명목이 최근 창에서 이 백분위 이상이면 쏠림 구간 */
    concentrationPctile: number;
    /** 위 백분위에 해당하는 액면 명목 (십억 달러) */
    concentrationCutoffBillions: number | null;
    lookbackWeeks: number;
  };
  lastUpdated: string;
}

export async function GET() {
  try {
    let points = await loadBasisTrade();

    // 아직 cron 이 한 번도 안 돈 상태면 이 요청에서 한 번 채운다.
    // (첫 배포 직후 페이지가 빈 화면으로 보이는 것을 막는다)
    if (points.length === 0) {
      try {
        await collectBasisTrade();
        points = await loadBasisTrade();
      } catch (e) {
        console.error("[observatory/basis-trade] 최초 수집 실패:", e);
      }
    }

    const series = withChanges(points);
    const v = evaluateBasisTrade(series);

    const body: BasisTradeResponse = {
      series,
      latest: v.latest,
      status: v.status,
      liquidationStatus: v.liquidationStatus,
      concentrated: v.concentrated,
      percentile3y: v.percentile3y,
      composition4w: compositionAt(series, 4),
      composition8w: compositionAt(series, 8),
      firing: basisTradeFiringStats(series),
      datasetId: BASIS_TRADE_DATASET_ID,
      contracts: Object.entries(BASIS_TRADE_CONTRACTS).map(([code, c]) => ({
        code,
        label: c.label,
        faceUsd: c.faceUsd,
      })),
      thresholds: {
        liquidationCautionPctile: BT_LIQ_CAUTION_PCTILE,
        liquidationAlertPctile: BT_LIQ_ALERT_PCTILE,
        cutoffs: v.cutoffs,
        obs4w: v.obs4w,
        obs8w: v.obs8w,
        shortWeeks: BT_SHORT_WEEKS,
        longWeeks: BT_LONG_WEEKS,
        concentrationPctile: BT_CONC_PCTILE,
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
