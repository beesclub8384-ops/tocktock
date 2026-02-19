import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

/** 각 지표별 가중치 (합계 1.0) */
const WEIGHTS = {
  revenueGrowth: 0.3, // 매출 성장률
  operatingMarginChange: 0.25, // 영업이익률 변화
  rndIntensityChange: 0.2, // R&D 집중도 변화
  revenuePerEmployeeChange: 0.15, // 인당 매출액 변화
  capexGrowth: 0.1, // Capex 증가율
} as const;

/** 각 지표의 선형 매핑 범위 [min, max] → 0~100점 */
const SCORE_RANGES: Record<keyof typeof WEIGHTS, [number, number]> = {
  revenueGrowth: [-0.2, 0.4],
  operatingMarginChange: [-0.1, 0.1],
  rndIntensityChange: [-0.05, 0.05],
  revenuePerEmployeeChange: [-0.2, 0.4],
  capexGrowth: [-0.3, 0.6],
};

export interface MetricDetail {
  name: string;
  value: number | null;
  score: number | null;
  weight: number;
  weightedScore: number | null;
  description: string;
}

export interface GrowthScoreResult {
  symbol: string;
  totalScore: number | null;
  metrics: MetricDetail[];
  error?: string;
  dataYears: { latest: string; previous: string } | null;
}

/** 원시 값을 [min, max] 범위에서 0~100점으로 선형 변환 */
function linearScore(value: number, min: number, max: number): number {
  const clamped = Math.max(min, Math.min(max, value));
  return ((clamped - min) / (max - min)) * 100;
}

/**
 * Yahoo Finance 재무 데이터를 기반으로 기업 성장성 종합 점수(100점 만점)를 산출합니다.
 *
 * 5가지 지표를 전년 대비 변화 기준으로 평가합니다:
 * - 매출 성장률 (30%)
 * - 영업이익률 변화 (25%)
 * - R&D 집중도 변화 (20%)
 * - 인당 매출액 변화 (15%)
 * - Capex 증가율 (10%)
 */
export async function calculateGrowthScore(
  symbol: string
): Promise<GrowthScoreResult> {
  try {
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

    const [fundamentals, summary] = await Promise.all([
      yahooFinance.fundamentalsTimeSeries(symbol, {
        period1: threeYearsAgo,
        type: "annual",
        module: "all",
      }),
      yahooFinance.quoteSummary(symbol, {
        modules: ["assetProfile"],
      }),
    ]);

    const annualData = (fundamentals as unknown as Array<Record<string, unknown>>)
      .filter((d) => d.periodType === "12M")
      .sort(
        (a, b) =>
          new Date(a.date as string).getTime() -
          new Date(b.date as string).getTime()
      );

    if (annualData.length < 2) {
      return {
        symbol,
        totalScore: null,
        metrics: [],
        error: "데이터 부족으로 점수 산출 불가",
        dataYears: null,
      };
    }

    const latest = annualData[annualData.length - 1];
    const previous = annualData[annualData.length - 2];
    const employees = (
      summary as unknown as {
        assetProfile?: { fullTimeEmployees?: number };
      }
    ).assetProfile?.fullTimeEmployees ?? null;

    const latestYear = new Date(latest.date as string)
      .getFullYear()
      .toString();
    const previousYear = new Date(previous.date as string)
      .getFullYear()
      .toString();

    const metrics: MetricDetail[] = [];
    let availableWeightSum = 0;
    let weightedScoreSum = 0;

    // ── 1. 매출 성장률 (30%) ──
    const revLatest = latest.totalRevenue as number | undefined;
    const revPrevious = previous.totalRevenue as number | undefined;
    if (revLatest != null && revPrevious != null && revPrevious !== 0) {
      const value = (revLatest - revPrevious) / Math.abs(revPrevious);
      const score = linearScore(value, ...SCORE_RANGES.revenueGrowth);
      const weighted = score * WEIGHTS.revenueGrowth;
      availableWeightSum += WEIGHTS.revenueGrowth;
      weightedScoreSum += weighted;
      metrics.push({
        name: "매출 성장률",
        value,
        score,
        weight: WEIGHTS.revenueGrowth,
        weightedScore: weighted,
        description: `${(value * 100).toFixed(1)}% (${previousYear} → ${latestYear})`,
      });
    } else {
      metrics.push({
        name: "매출 성장률",
        value: null,
        score: null,
        weight: WEIGHTS.revenueGrowth,
        weightedScore: null,
        description: "데이터 부족",
      });
    }

    // ── 2. 영업이익률 변화 (25%) ──
    const opIncLatest = latest.operatingIncome as number | undefined;
    const opIncPrevious = previous.operatingIncome as number | undefined;
    if (
      revLatest != null &&
      revPrevious != null &&
      opIncLatest != null &&
      opIncPrevious != null &&
      revLatest !== 0 &&
      revPrevious !== 0
    ) {
      const marginLatest = opIncLatest / revLatest;
      const marginPrevious = opIncPrevious / revPrevious;
      const value = marginLatest - marginPrevious;
      const score = linearScore(value, ...SCORE_RANGES.operatingMarginChange);
      const weighted = score * WEIGHTS.operatingMarginChange;
      availableWeightSum += WEIGHTS.operatingMarginChange;
      weightedScoreSum += weighted;
      metrics.push({
        name: "영업이익률 변화",
        value,
        score,
        weight: WEIGHTS.operatingMarginChange,
        weightedScore: weighted,
        description: `${(value * 100).toFixed(1)}%p (${(marginPrevious * 100).toFixed(1)}% → ${(marginLatest * 100).toFixed(1)}%)`,
      });
    } else {
      metrics.push({
        name: "영업이익률 변화",
        value: null,
        score: null,
        weight: WEIGHTS.operatingMarginChange,
        weightedScore: null,
        description: "데이터 부족",
      });
    }

    // ── 3. R&D 집중도 변화 (20%) ──
    const rndLatest = latest.researchAndDevelopment as number | undefined;
    const rndPrevious = previous.researchAndDevelopment as number | undefined;
    if (
      revLatest != null &&
      revPrevious != null &&
      rndLatest != null &&
      rndPrevious != null &&
      revLatest !== 0 &&
      revPrevious !== 0
    ) {
      const rndRatioLatest = rndLatest / revLatest;
      const rndRatioPrevious = rndPrevious / revPrevious;
      const value = rndRatioLatest - rndRatioPrevious;
      const score = linearScore(value, ...SCORE_RANGES.rndIntensityChange);
      const weighted = score * WEIGHTS.rndIntensityChange;
      availableWeightSum += WEIGHTS.rndIntensityChange;
      weightedScoreSum += weighted;
      metrics.push({
        name: "R&D 집중도 변화",
        value,
        score,
        weight: WEIGHTS.rndIntensityChange,
        weightedScore: weighted,
        description: `${(value * 100).toFixed(1)}%p (${(rndRatioPrevious * 100).toFixed(1)}% → ${(rndRatioLatest * 100).toFixed(1)}%)`,
      });
    } else {
      metrics.push({
        name: "R&D 집중도 변화",
        value: null,
        score: null,
        weight: WEIGHTS.rndIntensityChange,
        weightedScore: null,
        description: "데이터 부족",
      });
    }

    // ── 4. 인당 매출액 변화 (15%) ──
    if (
      revLatest != null &&
      revPrevious != null &&
      employees != null &&
      employees > 0 &&
      revPrevious !== 0
    ) {
      const rpeLatest = revLatest / employees;
      const rpePrevious = revPrevious / employees;
      const value = (rpeLatest - rpePrevious) / Math.abs(rpePrevious);
      const score = linearScore(
        value,
        ...SCORE_RANGES.revenuePerEmployeeChange
      );
      const weighted = score * WEIGHTS.revenuePerEmployeeChange;
      availableWeightSum += WEIGHTS.revenuePerEmployeeChange;
      weightedScoreSum += weighted;
      metrics.push({
        name: "인당 매출액 변화",
        value,
        score,
        weight: WEIGHTS.revenuePerEmployeeChange,
        weightedScore: weighted,
        description: `${(value * 100).toFixed(1)}% (현재 직원 수 ${employees.toLocaleString()}명 기준)`,
      });
    } else {
      metrics.push({
        name: "인당 매출액 변화",
        value: null,
        score: null,
        weight: WEIGHTS.revenuePerEmployeeChange,
        weightedScore: null,
        description: "직원 수 데이터 부족",
      });
    }

    // ── 5. Capex 증가율 (10%) ──
    const capexLatest = latest.capitalExpenditure as number | undefined;
    const capexPrevious = previous.capitalExpenditure as number | undefined;
    if (capexLatest != null && capexPrevious != null && capexPrevious !== 0) {
      const absLatest = Math.abs(capexLatest);
      const absPrevious = Math.abs(capexPrevious);
      const value = (absLatest - absPrevious) / absPrevious;
      const score = linearScore(value, ...SCORE_RANGES.capexGrowth);
      const weighted = score * WEIGHTS.capexGrowth;
      availableWeightSum += WEIGHTS.capexGrowth;
      weightedScoreSum += weighted;
      metrics.push({
        name: "Capex 증가율",
        value,
        score,
        weight: WEIGHTS.capexGrowth,
        weightedScore: weighted,
        description: `${(value * 100).toFixed(1)}% (${previousYear} → ${latestYear})`,
      });
    } else {
      metrics.push({
        name: "Capex 증가율",
        value: null,
        score: null,
        weight: WEIGHTS.capexGrowth,
        weightedScore: null,
        description: "데이터 부족",
      });
    }

    // ── 종합 점수 산출 (유효 가중치로 정규화) ──
    const totalScore =
      availableWeightSum > 0
        ? Math.round((weightedScoreSum / availableWeightSum) * 10) / 10
        : null;

    if (totalScore === null) {
      return {
        symbol,
        totalScore: null,
        metrics,
        error: "데이터 부족으로 점수 산출 불가",
        dataYears: null,
      };
    }

    return {
      symbol,
      totalScore,
      metrics,
      dataYears: { latest: latestYear, previous: previousYear },
    };
  } catch {
    return {
      symbol,
      totalScore: null,
      metrics: [],
      error: "데이터 부족으로 점수 산출 불가",
      dataYears: null,
    };
  }
}
