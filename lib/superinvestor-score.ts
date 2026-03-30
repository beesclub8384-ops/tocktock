import {
  type ActivityRecord,
  type InsiderData,
  type SuperinvestorStock,
  GRADE_THRESHOLDS,
} from "@/lib/types/superinvestor";

interface AggregatedStock {
  ticker: string;
  companyName: string;
  buyers: string[];
  maxWeight: number; // 가장 높은 포트폴리오 비중 변동(%)
  reportedPrice: number;
  currentPrice: number;
  priceChangePercent: number;
}

/**
 * 시그널 ① 슈퍼투자자 합의 매수 (40점)
 * Buy 또는 Add한 슈퍼투자자 수 기반
 */
function calcSignal1(buyerCount: number): number {
  if (buyerCount >= 4) return 40;
  if (buyerCount === 3) return 30;
  if (buyerCount === 2) return 20;
  if (buyerCount === 1) return 10;
  return 0;
}

/**
 * 시그널 ② 고확신 + 할인 (35점)
 * - 비중 1%↑: +10점 / 비중 3%↑: +15점 (누적 최대 25점)
 * - 보고가 대비 -5%↑: +5점 / -10%↑: +5점 추가 (누적 최대 10점)
 */
function calcSignal2(maxWeight: number, priceChangePercent: number): number {
  let points = 0;

  // 포트폴리오 비중 점수
  if (maxWeight >= 3) points += 25;
  else if (maxWeight >= 1) points += 10;

  // 할인 점수 (priceChangePercent가 음수일수록 할인)
  const drop = -priceChangePercent;
  if (drop >= 10) points += 10;
  else if (drop >= 5) points += 5;

  return points;
}

/**
 * 시그널 ③ 인사이더 동반 매수 (25점)
 * 인사이더 매수 1건↑: +15점, 3건↑: +25점
 */
function calcSignal3(insiderBuys: number): number {
  if (insiderBuys >= 3) return 25;
  if (insiderBuys >= 1) return 15;
  return 0;
}

function getGrade(score: number): string {
  if (score >= GRADE_THRESHOLDS.STRONG.min) return GRADE_THRESHOLDS.STRONG.label;
  if (score >= GRADE_THRESHOLDS.WATCH.min) return GRADE_THRESHOLDS.WATCH.label;
  return GRADE_THRESHOLDS.INTEREST.label;
}

/**
 * 매매 활동 데이터를 종목 기준으로 집계
 */
export function aggregateActivities(
  activities: ActivityRecord[],
  priceData: Map<string, { reportedPrice: number; currentPrice: number; priceChangePercent: number }>
): AggregatedStock[] {
  const map = new Map<string, AggregatedStock>();

  for (const act of activities) {
    if (act.activityType !== "Buy" && act.activityType !== "Add") continue;

    const existing = map.get(act.ticker);
    if (existing) {
      if (!existing.buyers.includes(act.investor)) {
        existing.buyers.push(act.investor);
      }
      if (act.portfolioWeight > existing.maxWeight) {
        existing.maxWeight = act.portfolioWeight;
      }
    } else {
      const price = priceData.get(act.ticker);
      map.set(act.ticker, {
        ticker: act.ticker,
        companyName: act.companyName,
        buyers: [act.investor],
        maxWeight: act.portfolioWeight,
        reportedPrice: price?.reportedPrice ?? 0,
        currentPrice: price?.currentPrice ?? 0,
        priceChangePercent: price?.priceChangePercent ?? 0,
      });
    }
  }

  return Array.from(map.values());
}

/**
 * 종합 점수 계산
 */
export function calculateScores(
  aggregated: AggregatedStock[],
  insiderMap: Map<string, InsiderData>
): SuperinvestorStock[] {
  const now = new Date().toISOString();

  return aggregated.map((stock) => {
    const insider = insiderMap.get(stock.ticker);
    const insiderBuys = insider?.buyCount ?? 0;

    const s1Points = calcSignal1(stock.buyers.length);
    const s2Points = calcSignal2(stock.maxWeight, stock.priceChangePercent);
    const s3Points = calcSignal3(insiderBuys);
    const score = s1Points + s2Points + s3Points;

    return {
      ticker: stock.ticker,
      companyName: stock.companyName,
      score,
      grade: getGrade(score),
      signal1: {
        buyerCount: stock.buyers.length,
        buyers: stock.buyers,
        points: s1Points,
      },
      signal2: {
        maxWeight: stock.maxWeight,
        priceChange: stock.priceChangePercent,
        points: s2Points,
      },
      signal3: {
        insiderBuys,
        points: s3Points,
      },
      currentPrice: stock.currentPrice,
      reportedPrice: stock.reportedPrice,
      priceChangePercent: stock.priceChangePercent,
      lastUpdated: now,
    };
  });
}
