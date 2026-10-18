/**
 * 국채 입찰 두 지표(응찰 배율 · 딜러 비중)의 API 응답 조립 — 두 라우트가 같이 쓴다.
 *
 * ⚠ route.ts 에 두지 않는다. Next.js 라우트 파일은 GET 같은 정해진 이름만 export 할 수 있어서
 *   공용 함수를 export 하면 빌드가 깨진다.
 */
import { collectAuctions, loadAuctions } from "@/lib/observatory-treasury-auctions";
import {
  AUCTION_LOOKBACK,
  AUCTION_MIN_OBS,
  AUCTION_WINDOW_DAYS,
  evaluateAuction,
  withAuctionSurprises,
  type AuctionRow,
  type AuctionVerdict,
  type ObservatoryStatus,
} from "@/lib/observatory-constants";

export interface AuctionMetricResponse {
  /** 차트용 — 입찰마다 날짜·만기·값·놀람 */
  series: AuctionRow[];
  latest: AuctionRow | null;
  status: ObservatoryStatus | null;
  /** 최근 28일 창의 입찰과 등급 (최근 → 과거) */
  window: AuctionVerdict["window"];
  thresholds: {
    cautionPctile: number;
    alertPctile: number;
    /** 가장 최근 입찰 기준 분포의 기준값 (놀람 단위) */
    cautionCut: number | null;
    alertCut: number | null;
    obs: number;
    minObs: number;
    lookback: number;
    windowDays: number;
  };
  lastUpdated: string;
}

/** 응찰 배율 · 딜러 비중 두 라우트가 같이 쓰는 응답 조립 */
export async function buildAuctionResponse(
  metric: "btc" | "pd",
  cautionPctile: number,
  alertPctile: number
): Promise<AuctionMetricResponse> {
  let records = await loadAuctions();
  // 아직 cron 이 한 번도 안 돈 상태면 이 요청에서 한 번 채운다
  if (records.length === 0) {
    try {
      await collectAuctions();
      records = await loadAuctions();
    } catch (e) {
      console.error("[observatory/auctions] 최초 수집 실패:", e);
    }
  }
  const series = withAuctionSurprises(records);
  const v = evaluateAuction(series, metric);
  return {
    series,
    latest: v.latest,
    status: v.status,
    window: v.window,
    thresholds: {
      cautionPctile,
      alertPctile,
      cautionCut: v.cautionCut,
      alertCut: v.alertCut,
      obs: v.obs,
      minObs: AUCTION_MIN_OBS,
      lookback: AUCTION_LOOKBACK,
      windowDays: AUCTION_WINDOW_DAYS,
    },
    lastUpdated: new Date().toISOString(),
  };
}
