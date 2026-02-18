import type { OHLCData } from "@/lib/types/stock";

export type TrendlineDirection = "support" | "resistance";

export interface TrendlineTouch {
  index: number;
  time: string;
  lineValue: number;
  touchPrice: number; // high 또는 low 중 더 가까운 값
  type: "high" | "low";
}

export interface TrendlineResult {
  /** 두 기준점의 인덱스 */
  anchor1: number;
  anchor2: number;
  /** 기울기 (1캔들당 가격 변화) */
  slope: number;
  /** 터치한 캔들 수 (기준점 2개 제외) */
  touchCount: number;
  /** 터치 상세 정보 */
  touches: TrendlineTouch[];
  /** 지지선 / 저항선 */
  direction: TrendlineDirection;
}

export interface FindTrendlineOptions {
  /** 피봇 판정 윈도우 크기 (기본값 5: 좌우 5개 캔들 비교) */
  pivotWindow?: number;
  /** 터치 판정 허용 비율 (기본값 0.02 = ±2%) */
  tolerance?: number;
  /** 두 기준점 사이 최소 간격 (기본값 10캔들) */
  minSpan?: number;
  /** 반환할 추세선 수 (기본값 5) */
  topN?: number;
}

/**
 * 주어진 인덱스에서의 추세선 가격을 계산한다.
 */
function getLineValue(
  anchorIdx1: number,
  price1: number,
  slope: number,
  targetIdx: number
): number {
  return price1 + slope * (targetIdx - anchorIdx1);
}

/**
 * 가격이 추세선 값의 ±tolerance(비율) 이내인지 판정한다.
 */
function isWithinTolerance(
  price: number,
  lineValue: number,
  tolerance: number
): boolean {
  return Math.abs(price - lineValue) / lineValue <= tolerance;
}

/**
 * 두 캔들을 연결하는 직선을 긋고, 나머지 캔들 중 몇 개가
 * 해당 직선을 터치하는지 카운트한다.
 *
 * @param data - OHLC 주봉 데이터 배열
 * @param idx1 - 첫 번째 기준점 인덱스
 * @param idx2 - 두 번째 기준점 인덱스
 * @param priceKey - 기준점의 가격 기준 ("high" | "low")
 * @param tolerance - 터치 판정 허용 비율 (기본값 0.02 = ±2%)
 */
export function countTrendlineTouches(
  data: OHLCData[],
  idx1: number,
  idx2: number,
  priceKey: "high" | "low",
  tolerance: number = 0.02
): TrendlineResult {
  const price1 = data[idx1][priceKey];
  const price2 = data[idx2][priceKey];
  const slope = (price2 - price1) / (idx2 - idx1);

  const touches: TrendlineTouch[] = [];

  for (let i = 0; i < data.length; i++) {
    // 기준점 자체는 제외
    if (i === idx1 || i === idx2) continue;

    const lineValue = getLineValue(idx1, price1, slope, i);
    if (lineValue <= 0) continue;

    const candle = data[i];
    const highDist = Math.abs(candle.high - lineValue) / lineValue;
    const lowDist = Math.abs(candle.low - lineValue) / lineValue;

    const highTouch = highDist <= tolerance;
    const lowTouch = lowDist <= tolerance;

    if (highTouch || lowTouch) {
      const type = !highTouch ? "low" : !lowTouch ? "high" : highDist <= lowDist ? "high" : "low";
      touches.push({
        index: i,
        time: candle.time,
        lineValue: Math.round(lineValue * 100) / 100,
        touchPrice: type === "high" ? candle.high : candle.low,
        type,
      });
    }
  }

  return {
    anchor1: idx1,
    anchor2: idx2,
    slope: Math.round(slope * 10000) / 10000,
    touchCount: touches.length,
    touches,
    direction: priceKey === "low" ? "support" : "resistance",
  };
}

/**
 * 로컬 피봇 포인트(극값)를 찾는다.
 * window 크기만큼 좌우를 비교하여 가장 높거나 낮은 캔들을 선별.
 */
function findPivots(
  data: OHLCData[],
  priceKey: "high" | "low",
  window: number
): number[] {
  const pivots: number[] = [];
  const isHigh = priceKey === "high";

  for (let i = window; i < data.length - window; i++) {
    let isPivot = true;
    const val = data[i][priceKey];

    for (let j = 1; j <= window; j++) {
      const left = data[i - j][priceKey];
      const right = data[i + j][priceKey];
      if (isHigh ? (left > val || right > val) : (left < val || right < val)) {
        isPivot = false;
        break;
      }
    }

    if (isPivot) pivots.push(i);
  }

  return pivots;
}

/**
 * 주봉 데이터에서 최적의 추세선을 자동으로 찾는다.
 *
 * 알고리즘:
 * 1. 피봇 고점/저점을 찾는다
 * 2. 피봇 쌍마다 추세선을 긋고 터치 수를 센다
 * 3. 터치 수 기준 상위 N개를 반환한다
 */
export function findBestTrendlines(
  data: OHLCData[],
  options: FindTrendlineOptions = {}
): TrendlineResult[] {
  const {
    pivotWindow = 5,
    tolerance = 0.02,
    minSpan = 10,
    topN = 5,
  } = options;

  const pivotHighs = findPivots(data, "high", pivotWindow);
  const pivotLows = findPivots(data, "low", pivotWindow);

  const candidates: TrendlineResult[] = [];

  // 저항선: 피봇 고점 쌍
  for (let i = 0; i < pivotHighs.length; i++) {
    for (let j = i + 1; j < pivotHighs.length; j++) {
      if (pivotHighs[j] - pivotHighs[i] < minSpan) continue;
      const result = countTrendlineTouches(
        data, pivotHighs[i], pivotHighs[j], "high", tolerance
      );
      if (result.touchCount >= 1) candidates.push(result);
    }
  }

  // 지지선: 피봇 저점 쌍
  for (let i = 0; i < pivotLows.length; i++) {
    for (let j = i + 1; j < pivotLows.length; j++) {
      if (pivotLows[j] - pivotLows[i] < minSpan) continue;
      const result = countTrendlineTouches(
        data, pivotLows[i], pivotLows[j], "low", tolerance
      );
      if (result.touchCount >= 1) candidates.push(result);
    }
  }

  // 터치 수 내림차순 정렬, 동일하면 span이 긴 것 우선
  candidates.sort((a, b) => {
    if (b.touchCount !== a.touchCount) return b.touchCount - a.touchCount;
    return (b.anchor2 - b.anchor1) - (a.anchor2 - a.anchor1);
  });

  return candidates.slice(0, topN);
}
