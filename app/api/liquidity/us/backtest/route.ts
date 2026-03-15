import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import YahooFinance from "yahoo-finance2";

export const maxDuration = 300;

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";
const CACHE_KEY = "liquidity:us:backtest:v3";
const CACHE_TTL = 86400;

/* ── Types ── */

type RegimeType = "RECOVERY" | "EXPANSION" | "SLOWDOWN" | "CONTRACTION";

export interface BacktestPoint {
  date: string;
  score: number;
  regime: RegimeType;
  qqq1m: number | null;
  qqq2m: number | null;
  qqq3m: number | null;
}

export interface RegimeStat {
  count: number;
  avg1m: number;
  avg2m: number;
  avg3m: number;
  winRate3m: number;
}

export interface BucketStats {
  label: string;
  color: string;
  count: number;
  avg1m: number;
  avg2m: number;
  avg3m: number;
}

export interface BacktestResponse {
  points: BacktestPoint[];
  buckets: BucketStats[];
  accuracy: { overall: number; month1: number; month2: number; month3: number };
  regimeStats: Record<RegimeType, RegimeStat>;
  regimeAccuracy: { overall: number; month1: number; month2: number; month3: number };
  periodStart: string;
  periodEnd: string;
  totalMonths: number;
  fetchedAt: string;
}

/* ── Helpers ── */

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

function r1(v: number): number {
  return Math.round(v * 10) / 10;
}

async function fetchFredMonthly(
  seriesId: string,
  startDate: string
): Promise<{ date: string; value: number }[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error("FRED_API_KEY not set");
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: "json",
    observation_start: startDate,
    frequency: "m",
    aggregation_method: "eop",
    sort_order: "asc",
  });
  const res = await fetch(`${FRED_BASE}?${params}`, {
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`FRED ${seriesId}: ${res.status}`);
  const json = await res.json();
  return (json.observations as { date: string; value: string }[])
    .filter((o) => o.value !== ".")
    .map((o) => ({ date: o.date.slice(0, 7), value: parseFloat(o.value) }));
}

function percentileRank(values: number[], current: number): number {
  if (values.length === 0) return 50;
  const below = values.filter((v) => v < current).length;
  return (below / values.length) * 100;
}

function windowValues(
  map: Map<string, number>,
  endMonth: string,
  lookbackMonths: number
): number[] {
  const startYM = addMonths(endMonth, -lookbackMonths);
  const vals: number[] = [];
  for (const [m, v] of map) {
    if (m >= startYM && m <= endMonth) vals.push(v);
  }
  return vals;
}

function windowMomentumValues(
  map: Map<string, number>,
  endMonth: string,
  lookbackMonths: number,
  momOffset: number = 3
): number[] {
  const startYM = addMonths(endMonth, -lookbackMonths);
  const vals: number[] = [];
  for (const [m, v] of map) {
    if (m >= startYM && m <= endMonth) {
      const prev = map.get(addMonths(m, -momOffset));
      if (prev != null) vals.push(v - prev);
    }
  }
  return vals;
}

/* ── Main computation ── */

async function computeBacktest(): Promise<BacktestResponse> {
  const yahooFinance = new YahooFinance();

  // 21 years back: 10yr backtest + 10yr lookback + 1yr buffer for M2 YoY
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 21);
  const start = startDate.toISOString().slice(0, 10);

  // Fetch monthly FRED data (frequency=m, aggregation=eop)
  const [walclData, rrpData, tgaData, m2Data, hyData, igData, nfciData] =
    await Promise.all([
      fetchFredMonthly("WALCL", start),
      fetchFredMonthly("RRPONTSYD", start),
      fetchFredMonthly("WTREGEN", start),
      fetchFredMonthly("M2SL", start),
      fetchFredMonthly("BAMLH0A0HYM2", start),
      fetchFredMonthly("BAMLC0A0CM", start),
      fetchFredMonthly("NFCI", start),
    ]);

  // VIX daily data for rolling 63-day average
  const vixChart = await yahooFinance.chart("^VIX", {
    period1: startDate,
    interval: "1d",
  });
  const vixDaily = (vixChart.quotes ?? [])
    .filter((q) => q.close != null && q.date != null)
    .map((q) => ({
      date: (q.date as Date).toISOString().slice(0, 10),
      close: q.close as number,
    }));

  // QQQ monthly prices (need 11yr for forward returns beyond backtest end)
  const qqqStart = new Date();
  qqqStart.setFullYear(qqqStart.getFullYear() - 11);
  const qqqChart = await yahooFinance.chart("QQQ", {
    period1: qqqStart,
    interval: "1mo",
  });
  const qqqPrices = (qqqChart.quotes ?? [])
    .filter((q) => q.close != null && q.date != null)
    .map((q) => {
      const d = q.date as Date;
      return {
        date: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
        close: q.close as number,
      };
    });

  // Build base maps
  const walclMap = new Map(walclData.map((o) => [o.date, o.value]));
  const rrpMap = new Map(rrpData.map((o) => [o.date, o.value / 1000]));
  const tgaMap = new Map(tgaData.map((o) => [o.date, o.value]));
  const m2Map = new Map(m2Data.map((o) => [o.date, o.value]));
  const hyMap = new Map(hyData.map((o) => [o.date, o.value]));
  const igMap = new Map(igData.map((o) => [o.date, o.value]));
  const nfciMap = new Map(nfciData.map((o) => [o.date, o.value]));
  const qqqMap = new Map(qqqPrices.map((q) => [q.date, q.close]));

  // Compute VIX 63-day rolling average at each month-end
  const vixMonthMap = new Map<string, number>();
  for (let i = 62; i < vixDaily.length; i++) {
    const ym = vixDaily[i].date.slice(0, 7);
    const nextYm =
      i + 1 < vixDaily.length ? vixDaily[i + 1].date.slice(0, 7) : null;
    if (nextYm !== ym) {
      const win = vixDaily.slice(i - 62, i + 1);
      vixMonthMap.set(
        ym,
        win.reduce((s, d) => s + d.close, 0) / win.length
      );
    }
  }

  // Compute derived monthly series: net liquidity & M2 YoY growth
  const allMonths = [...walclMap.keys()].sort();
  const netLiqMap = new Map<string, number>();
  const m2GrowthMap = new Map<string, number>();

  for (const m of allMonths) {
    const w = walclMap.get(m);
    const t = tgaMap.get(m);
    if (w != null && t != null) {
      netLiqMap.set(m, w - (rrpMap.get(m) ?? 0) - t);
    }
    const m2Val = m2Map.get(m);
    const m2Ago = m2Map.get(addMonths(m, -12));
    if (m2Val != null && m2Ago != null) {
      m2GrowthMap.set(m, ((m2Val - m2Ago) / m2Ago) * 100);
    }
  }

  // Backtest period: last 10 years
  const bt10 = new Date();
  bt10.setFullYear(bt10.getFullYear() - 10);
  const btStartYM = `${bt10.getFullYear()}-${String(bt10.getMonth() + 1).padStart(2, "0")}`;
  const backtestMonths = allMonths.filter((m) => m >= btStartYM);

  const LOOKBACK = 120; // 10 years in months
  const calc = (val: number, hist: number[], inv: boolean) => {
    const pct = percentileRank(hist, val);
    return inv ? 100 - pct : pct;
  };

  const points: BacktestPoint[] = [];

  for (const month of backtestMonths) {
    const nl = netLiqMap.get(month);
    const mg = m2GrowthMap.get(month);
    const hyVal = hyMap.get(month);
    const igVal = igMap.get(month);
    const nfVal = nfciMap.get(month);
    const vxVal = vixMonthMap.get(month);

    if (
      nl == null ||
      mg == null ||
      hyVal == null ||
      igVal == null ||
      nfVal == null ||
      vxVal == null
    )
      continue;

    // Rolling 10-year lookback windows (no future data)
    const nlHist = windowValues(netLiqMap, month, LOOKBACK);
    const mgHist = windowValues(m2GrowthMap, month, LOOKBACK);
    const hyHist = windowValues(hyMap, month, LOOKBACK);
    const igHist = windowValues(igMap, month, LOOKBACK);
    const nfHist = windowValues(nfciMap, month, LOOKBACK);
    const vxHist = windowValues(vixMonthMap, month, LOOKBACK);

    // Level scores
    const nlS = calc(nl, nlHist, false);
    const mgS = calc(mg, mgHist, false);
    const hyS = calc(hyVal, hyHist, true);
    const igS = calc(igVal, igHist, true);
    const nfS = calc(nfVal, nfHist, true);
    const vxS = calc(vxVal, vxHist, true);

    // Momentum scores (3-month change percentile, rolling window)
    const momCalc = (map: Map<string, number>, cur: number, inv: boolean) => {
      const prev = map.get(addMonths(month, -3));
      if (prev == null) return 50;
      const momVal = cur - prev;
      const momHist = windowMomentumValues(map, month, LOOKBACK);
      return calc(momVal, momHist, inv);
    };

    const nlMomS = momCalc(netLiqMap, nl, false);
    const mgMomS = momCalc(m2GrowthMap, mg, false);
    const hyMomS = momCalc(hyMap, hyVal, true);
    const igMomS = momCalc(igMap, igVal, true);
    const nfMomS = momCalc(nfciMap, nfVal, true);
    const vxMomS = momCalc(vixMonthMap, vxVal, true);

    // Combined (level 60% + momentum 40%)
    const nlC = nlS * 0.6 + nlMomS * 0.4;
    const mgC = mgS * 0.6 + mgMomS * 0.4;
    const hyC = hyS * 0.6 + hyMomS * 0.4;
    const igC = igS * 0.6 + igMomS * 0.4;
    const nfC = nfS * 0.6 + nfMomS * 0.4;
    const vxC = vxS * 0.6 + vxMomS * 0.4;

    const macro = (nlC + mgC + hyC + igC) / 4;
    const market = (nfC + vxC) / 2;
    const finalScore = macro * 0.5 + market * 0.5;

    // QQQ forward returns
    const qNow = qqqMap.get(month);
    const q1 = qqqMap.get(addMonths(month, 1));
    const q2 = qqqMap.get(addMonths(month, 2));
    const q3 = qqqMap.get(addMonths(month, 3));

    points.push({
      date: month,
      score: r1(finalScore),
      regime: "EXPANSION" as RegimeType, // placeholder, classified below
      qqq1m: qNow && q1 ? r2((q1 / qNow - 1) * 100) : null,
      qqq2m: qNow && q2 ? r2((q2 / qNow - 1) * 100) : null,
      qqq3m: qNow && q3 ? r2((q3 / qNow - 1) * 100) : null,
    });
  }

  // Classify regimes (compare with score 3 months ago)
  const scoreMap = new Map(points.map((p) => [p.date, p.score]));
  for (const p of points) {
    const past = scoreMap.get(addMonths(p.date, -3));
    const rising = past != null ? p.score > past : true;
    if (p.score < 50 && rising) p.regime = "RECOVERY";
    else if (p.score >= 50 && rising) p.regime = "EXPANSION";
    else if (p.score >= 50 && !rising) p.regime = "SLOWDOWN";
    else p.regime = "CONTRACTION";
  }

  // Bucket stats
  const bucketDefs = [
    { label: "유동성 풍부 (75+)", color: "#16a34a", min: 75, max: 101 },
    { label: "중립 (50~75)", color: "#ca8a04", min: 50, max: 75 },
    { label: "유동성 긴장 (25~50)", color: "#ea580c", min: 25, max: 50 },
    { label: "유동성 경색 (25 이하)", color: "#dc2626", min: -1, max: 25 },
  ];

  const buckets: BucketStats[] = bucketDefs.map(({ label, color, min, max }) => {
    const inB = points.filter((p) => p.score >= min && p.score < max);
    const avg = (key: "qqq1m" | "qqq2m" | "qqq3m") => {
      const valid = inB.filter((p) => p[key] != null);
      return valid.length > 0
        ? r2(valid.reduce((s, p) => s + p[key]!, 0) / valid.length)
        : 0;
    };
    return {
      label,
      color,
      count: inB.length,
      avg1m: avg("qqq1m"),
      avg2m: avg("qqq2m"),
      avg3m: avg("qqq3m"),
    };
  });

  // Accuracy: score>=50 → QQQ up, score<50 → QQQ down
  const calcAcc = (key: "qqq1m" | "qqq2m" | "qqq3m"): number => {
    const valid = points.filter((p) => p[key] != null);
    if (valid.length === 0) return 0;
    const highOk = valid.filter((p) => p.score >= 50 && p[key]! > 0).length;
    const highN = valid.filter((p) => p.score >= 50).length;
    const lowOk = valid.filter((p) => p.score < 50 && p[key]! <= 0).length;
    const lowN = valid.filter((p) => p.score < 50).length;
    const hA = highN > 0 ? highOk / highN : 0;
    const lA = lowN > 0 ? lowOk / lowN : 0;
    if (highN === 0) return r1(lA * 100);
    if (lowN === 0) return r1(hA * 100);
    return r1(((hA + lA) / 2) * 100);
  };

  const a1 = calcAcc("qqq1m");
  const a2 = calcAcc("qqq2m");
  const a3 = calcAcc("qqq3m");

  // Regime stats
  const regimeDefs: { type: RegimeType; label: string }[] = [
    { type: "RECOVERY", label: "바닥 탈출" },
    { type: "EXPANSION", label: "상승 지속" },
    { type: "SLOWDOWN", label: "고점 경고" },
    { type: "CONTRACTION", label: "하락 지속" },
  ];

  const regimeStats = {} as Record<RegimeType, RegimeStat>;
  for (const { type } of regimeDefs) {
    const inR = points.filter((p) => p.regime === type);
    const avgKey = (key: "qqq1m" | "qqq2m" | "qqq3m") => {
      const valid = inR.filter((p) => p[key] != null);
      return valid.length > 0
        ? r2(valid.reduce((s, p) => s + p[key]!, 0) / valid.length)
        : 0;
    };
    const wr3 = (() => {
      const valid = inR.filter((p) => p.qqq3m != null);
      if (valid.length === 0) return 0;
      return r1((valid.filter((p) => p.qqq3m! > 0).length / valid.length) * 100);
    })();
    regimeStats[type] = {
      count: inR.length,
      avg1m: avgKey("qqq1m"),
      avg2m: avgKey("qqq2m"),
      avg3m: avgKey("qqq3m"),
      winRate3m: wr3,
    };
  }

  // Regime accuracy: RECOVERY+EXPANSION → QQQ up, SLOWDOWN+CONTRACTION → QQQ down
  const calcRegimeAcc = (key: "qqq1m" | "qqq2m" | "qqq3m"): number => {
    const valid = points.filter((p) => p[key] != null);
    if (valid.length === 0) return 0;
    const bullish = valid.filter((p) => p.regime === "RECOVERY" || p.regime === "EXPANSION");
    const bearish = valid.filter((p) => p.regime === "SLOWDOWN" || p.regime === "CONTRACTION");
    const bullOk = bullish.filter((p) => p[key]! > 0).length;
    const bearOk = bearish.filter((p) => p[key]! <= 0).length;
    const bA = bullish.length > 0 ? bullOk / bullish.length : 0;
    const bB = bearish.length > 0 ? bearOk / bearish.length : 0;
    if (bullish.length === 0) return r1(bB * 100);
    if (bearish.length === 0) return r1(bA * 100);
    return r1(((bA + bB) / 2) * 100);
  };

  const ra1 = calcRegimeAcc("qqq1m");
  const ra2 = calcRegimeAcc("qqq2m");
  const ra3 = calcRegimeAcc("qqq3m");

  const validPts = points.filter((p) => p.qqq1m != null);

  return {
    points,
    buckets,
    accuracy: {
      month1: a1,
      month2: a2,
      month3: a3,
      overall: r1((a1 + a2 + a3) / 3),
    },
    regimeStats,
    regimeAccuracy: {
      month1: ra1,
      month2: ra2,
      month3: ra3,
      overall: r1((ra1 + ra2 + ra3) / 3),
    },
    periodStart: validPts[0]?.date ?? "",
    periodEnd: validPts[validPts.length - 1]?.date ?? "",
    totalMonths: validPts.length,
    fetchedAt: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const cached = await redis.get<BacktestResponse>(CACHE_KEY);
    if (cached) return NextResponse.json(cached);

    const result = await computeBacktest();
    await redis.set(CACHE_KEY, result, { ex: CACHE_TTL });
    return NextResponse.json(result);
  } catch (error) {
    console.error("liquidity/us/backtest error:", error);
    return NextResponse.json(
      { error: "Failed to compute backtest" },
      { status: 500 }
    );
  }
}
