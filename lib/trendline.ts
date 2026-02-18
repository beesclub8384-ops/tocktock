import type { OHLCData } from "@/lib/types/stock";

export interface ChannelResult {
  anchor1: number;
  anchor2: number;
  price1: number;
  price2: number;
  slope: number;
  touchCount: number;
  tunnelOffset: number;
  tunnelTouchCount: number;
}

export interface FindChannelsConfig {
  pivotN?: number;
  dropThreshold?: number;
  tolerance?: number;
  tunnelTolerance?: number;
  minSpan?: number;
}

function findPeaks(data: OHLCData[], n: number): number[] {
  const peaks: number[] = [];
  for (let i = n; i < data.length - n; i++) {
    let isPeak = true;
    for (let j = 1; j <= n; j++) {
      if (data[i - j].high >= data[i].high || data[i + j].high >= data[i].high) {
        isPeak = false;
        break;
      }
    }
    if (isPeak) peaks.push(i);
  }
  return peaks;
}

function findValleys(data: OHLCData[], n: number): number[] {
  const valleys: number[] = [];
  for (let i = n; i < data.length - n; i++) {
    let isValley = true;
    for (let j = 1; j <= n; j++) {
      if (data[i - j].low <= data[i].low || data[i + j].low <= data[i].low) {
        isValley = false;
        break;
      }
    }
    if (isValley) valleys.push(i);
  }
  return valleys;
}

function filterHistoricalPeaks(
  data: OHLCData[],
  peaks: number[],
  dropThreshold: number
): number[] {
  return peaks.filter((peakIdx, i) => {
    const peakHigh = data[peakIdx].high;
    const end = i < peaks.length - 1 ? peaks[i + 1] : data.length - 1;
    let minLow = Infinity;
    for (let j = peakIdx + 1; j <= end; j++) {
      if (data[j].low < minLow) minLow = data[j].low;
    }
    return (minLow / peakHigh - 1) <= dropThreshold;
  });
}

function findBestLine(
  data: OHLCData[],
  pivots: number[],
  priceKey: "high" | "low",
  tolerance: number,
  minSpan: number
): ChannelResult | null {
  let best: ChannelResult | null = null;

  for (let i = 0; i < pivots.length; i++) {
    for (let j = i + 1; j < pivots.length; j++) {
      const idx1 = pivots[i], idx2 = pivots[j];
      if (idx2 - idx1 < minSpan) continue;

      const p1 = data[idx1][priceKey], p2 = data[idx2][priceKey];
      const slope = (p2 - p1) / (idx2 - idx1);

      let count = 0;
      for (let k = 0; k < pivots.length; k++) {
        if (k === i || k === j) continue;
        const idx = pivots[k];
        const lv = p1 + slope * (idx - idx1);
        if (lv > 0 && Math.abs(data[idx][priceKey] - lv) / lv <= tolerance) count++;
      }

      if (!best || count > best.touchCount ||
          (count === best.touchCount && (idx2 - idx1) > (best.anchor2 - best.anchor1))) {
        best = {
          anchor1: idx1, anchor2: idx2,
          price1: p1, price2: p2,
          slope, touchCount: count,
          tunnelOffset: 0, tunnelTouchCount: 0,
        };
      }
    }
  }

  return best;
}

function findBestTunnelOffset(
  data: OHLCData[],
  anchor1: number,
  price1: number,
  slope: number,
  priceKey: "high" | "low",
  tunnelTolerance: number
): { offset: number; touchCount: number } {
  const n = data.length;
  let bestOffset = 0;
  let bestCount = 0;

  for (let i = 0; i < n; i++) {
    const mainValue = price1 + slope * (i - anchor1);
    const offset = data[i][priceKey] - mainValue;

    // 하향 터널: offset < 0 (메인 아래), 상승 터널: offset > 0 (메인 위)
    if (priceKey === "low" && offset >= 0) continue;
    if (priceKey === "high" && offset <= 0) continue;

    let count = 0;
    for (let k = 0; k < n; k++) {
      const tlv = price1 + slope * (k - anchor1) + offset;
      if (tlv <= 0) continue;
      if (Math.abs(data[k][priceKey] - tlv) / tlv <= tunnelTolerance) count++;
    }

    if (count > bestCount) {
      bestCount = count;
      bestOffset = offset;
    }
  }

  return { offset: bestOffset, touchCount: bestCount };
}

export function findChannels(
  data: OHLCData[],
  config: FindChannelsConfig = {}
): { uptrend: ChannelResult | null; downtrend: ChannelResult | null } {
  const {
    pivotN = 10,
    dropThreshold = -0.30,
    tolerance = 0.005,
    tunnelTolerance = 0.02,
    minSpan = 10,
  } = config;

  const peaks = findPeaks(data, pivotN);
  const historicalPeaks = filterHistoricalPeaks(data, peaks, dropThreshold);
  const valleys = findValleys(data, pivotN);

  const downtrend = findBestLine(data, historicalPeaks, "high", tolerance, minSpan);
  const uptrend = findBestLine(data, valleys, "low", tolerance, minSpan);

  if (downtrend) {
    const tunnel = findBestTunnelOffset(
      data, downtrend.anchor1, downtrend.price1, downtrend.slope,
      "low", tunnelTolerance
    );
    downtrend.tunnelOffset = tunnel.offset;
    downtrend.tunnelTouchCount = tunnel.touchCount;
  }

  if (uptrend) {
    const tunnel = findBestTunnelOffset(
      data, uptrend.anchor1, uptrend.price1, uptrend.slope,
      "high", tunnelTolerance
    );
    uptrend.tunnelOffset = tunnel.offset;
    uptrend.tunnelTouchCount = tunnel.touchCount;
  }

  return { uptrend, downtrend };
}
