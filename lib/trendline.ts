import type { OHLCData } from "@/lib/types/stock";

export interface TrendlineResult {
  anchor1: number;
  anchor2: number;
  price1: number;
  price2: number;
  slope: number;
  touchCount: number;
  direction: "support" | "resistance" | "cross";
}

interface Best {
  idx1: number;
  idx2: number;
  p1: number;
  p2: number;
  slope: number;
  count: number;
}

const EMPTY: Best = { idx1: 0, idx2: 0, p1: 0, p2: 0, slope: 0, count: -1 };

/**
 * 모든 캔들의 고점/저점을 직접 사용하여 최적 추세선 3개를 찾는다.
 *
 * 1. 저항선: 고점 2개를 연결, 다른 고점 터치 최다
 * 2. 지지선: 저점 2개를 연결, 다른 저점 터치 최다
 * 3. 크로스: 고점/저점 어느 2개든 연결, 고점+저점 전체 터치 최다
 *
 * @param tolerance 터치 판정 오차 (기본 0.005 = ±0.5%)
 * @param minSpan 두 기준점 사이 최소 캔들 간격 (기본 10)
 */
export function findBestTrendlines(
  data: OHLCData[],
  options: { tolerance?: number; minSpan?: number } = {}
): { support: TrendlineResult | null; resistance: TrendlineResult | null; cross: TrendlineResult | null } {
  const { tolerance = 0.005, minSpan = 10 } = options;
  const n = data.length;

  let bestResistance: Best = { ...EMPTY };
  let bestSupport: Best = { ...EMPTY };
  let bestCross: Best = { ...EMPTY };

  for (let i = 0; i < n; i++) {
    for (let j = i + minSpan; j < n; j++) {
      // --- 고점-고점 직선 ---
      const hP1 = data[i].high, hP2 = data[j].high;
      const hSlope = (hP2 - hP1) / (j - i);
      let highCount = 0;
      let crossCountHH = 0;

      for (let k = 0; k < n; k++) {
        if (k === i || k === j) continue;
        const lv = hP1 + hSlope * (k - i);
        if (lv <= 0) continue;
        const hDist = Math.abs(data[k].high - lv) / lv;
        const lDist = Math.abs(data[k].low - lv) / lv;
        if (hDist <= tolerance) { highCount++; crossCountHH++; }
        else if (lDist <= tolerance) { crossCountHH++; }
      }

      if (highCount > bestResistance.count) {
        bestResistance = { idx1: i, idx2: j, p1: hP1, p2: hP2, slope: hSlope, count: highCount };
      }
      if (crossCountHH > bestCross.count) {
        bestCross = { idx1: i, idx2: j, p1: hP1, p2: hP2, slope: hSlope, count: crossCountHH };
      }

      // --- 저점-저점 직선 ---
      const lP1 = data[i].low, lP2 = data[j].low;
      const lSlope = (lP2 - lP1) / (j - i);
      let lowCount = 0;
      let crossCountLL = 0;

      for (let k = 0; k < n; k++) {
        if (k === i || k === j) continue;
        const lv = lP1 + lSlope * (k - i);
        if (lv <= 0) continue;
        const hDist = Math.abs(data[k].high - lv) / lv;
        const lDist = Math.abs(data[k].low - lv) / lv;
        if (lDist <= tolerance) { lowCount++; crossCountLL++; }
        else if (hDist <= tolerance) { crossCountLL++; }
      }

      if (lowCount > bestSupport.count) {
        bestSupport = { idx1: i, idx2: j, p1: lP1, p2: lP2, slope: lSlope, count: lowCount };
      }
      if (crossCountLL > bestCross.count) {
        bestCross = { idx1: i, idx2: j, p1: lP1, p2: lP2, slope: lSlope, count: crossCountLL };
      }

      // --- 고점-저점 직선 (크로스 전용) ---
      const hlP1 = data[i].high, hlP2 = data[j].low;
      const hlSlope = (hlP2 - hlP1) / (j - i);
      let crossCountHL = 0;

      for (let k = 0; k < n; k++) {
        if (k === i || k === j) continue;
        const lv = hlP1 + hlSlope * (k - i);
        if (lv <= 0) continue;
        if (Math.abs(data[k].high - lv) / lv <= tolerance || Math.abs(data[k].low - lv) / lv <= tolerance) {
          crossCountHL++;
        }
      }

      if (crossCountHL > bestCross.count) {
        bestCross = { idx1: i, idx2: j, p1: hlP1, p2: hlP2, slope: hlSlope, count: crossCountHL };
      }

      // --- 저점-고점 직선 (크로스 전용) ---
      const lhP1 = data[i].low, lhP2 = data[j].high;
      const lhSlope = (lhP2 - lhP1) / (j - i);
      let crossCountLH = 0;

      for (let k = 0; k < n; k++) {
        if (k === i || k === j) continue;
        const lv = lhP1 + lhSlope * (k - i);
        if (lv <= 0) continue;
        if (Math.abs(data[k].high - lv) / lv <= tolerance || Math.abs(data[k].low - lv) / lv <= tolerance) {
          crossCountLH++;
        }
      }

      if (crossCountLH > bestCross.count) {
        bestCross = { idx1: i, idx2: j, p1: lhP1, p2: lhP2, slope: lhSlope, count: crossCountLH };
      }
    }
  }

  const toResult = (b: Best, dir: "support" | "resistance" | "cross"): TrendlineResult | null => {
    if (b.count <= 0) return null;
    return {
      anchor1: b.idx1,
      anchor2: b.idx2,
      price1: Math.round(b.p1 * 100) / 100,
      price2: Math.round(b.p2 * 100) / 100,
      slope: b.slope,
      touchCount: b.count,
      direction: dir,
    };
  };

  return {
    support: toResult(bestSupport, "support"),
    resistance: toResult(bestResistance, "resistance"),
    cross: toResult(bestCross, "cross"),
  };
}
