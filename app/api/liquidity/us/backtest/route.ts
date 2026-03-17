import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import YahooFinance from "yahoo-finance2";

export const maxDuration = 300;

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";
const CACHE_KEY = "liquidity:us:backtest:v5";
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
  qqq4m: number | null;
  qqq5m: number | null;
  qqq6m: number | null;
}

export interface RegimeStat {
  count: number;
  avg1m: number;
  avg2m: number;
  avg3m: number;
  avg4m: number;
  avg5m: number;
  avg6m: number;
  winRate6m: number;
}

export interface BucketStats {
  label: string;
  color: string;
  count: number;
  avg1m: number;
  avg2m: number;
  avg3m: number;
  avg4m: number;
  avg5m: number;
  avg6m: number;
}

type AccuracyObj = {
  overall: number;
  month1: number;
  month2: number;
  month3: number;
  month4: number;
  month5: number;
  month6: number;
};

export interface BacktestResponse {
  points: BacktestPoint[];
  buckets: BucketStats[];
  accuracy: AccuracyObj;
  regimeStats: Record<RegimeType, RegimeStat>;
  regimeAccuracy: AccuracyObj;
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
    .map((o) => ({
      date: o.date.slice(0, 7),
      value: parseFloat(o.value),
    }));
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
  momOffset = 3
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

  // 21 years back: 10yr backtest + 10yr lookback + 1yr buffer
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 21);
  const start = startDate.toISOString().slice(0, 10);

  // Fetch monthly FRED data
  const [walclData, rrpData, tgaData, m2Data, t10y2yData, nfciData] =
    await Promise.all([
      fetchFredMonthly("WALCL", start),
      fetchFredMonthly("RRPONTSYD", start),
      fetchFredMonthly("WTREGEN", start),
      fetchFredMonthly("M2SL", start),
      fetchFredMonthly("T10Y2Y", start),
      fetchFredMonthly("NFCI", start),
    ]);

  // TEDRATE — may fail or have limited data
  let tedData: { date: string; value: number }[] = [];
  try {
    tedData = await fetchFredMonthly("TEDRATE", start);
  } catch {
    /* continue without */
  }

  // Yahoo Finance: Copper, Gold, QQQ (monthly)
  const qqqStart = new Date();
  qqqStart.setFullYear(qqqStart.getFullYear() - 11);

  const [cuChart, auChart, qqqChart] = await Promise.all([
    yahooFinance.chart("HG=F", { period1: startDate, interval: "1mo" }),
    yahooFinance.chart("GC=F", { period1: startDate, interval: "1mo" }),
    yahooFinance.chart("QQQ", { period1: qqqStart, interval: "1mo" }),
  ]);

  const parseYahooMonthly = (
    chart: { quotes?: { close?: number | null; date?: Date | null }[] }
  ) => {
    return (chart.quotes ?? [])
      .filter(
        (q: { close?: number | null; date?: Date | null }) =>
          q.close != null && q.date != null
      )
      .map((q) => {
        const d = q.date as Date;
        return {
          date: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
          close: q.close as number,
        };
      });
  };

  const cuPrices = parseYahooMonthly(cuChart);
  const auPrices = parseYahooMonthly(auChart);
  const qqqPrices = parseYahooMonthly(qqqChart);

  // Build base maps
  const walclMap = new Map(walclData.map((o) => [o.date, o.value]));
  const rrpMap = new Map(
    rrpData.map((o) => [o.date, o.value * 1000])
  );
  const tgaMap = new Map(tgaData.map((o) => [o.date, o.value]));
  const m2Map = new Map(m2Data.map((o) => [o.date, o.value]));
  const t10y2yMap = new Map(t10y2yData.map((o) => [o.date, o.value]));
  const tedMap = new Map(tedData.map((o) => [o.date, o.value]));
  const nfciMap = new Map(nfciData.map((o) => [o.date, o.value]));
  const cuMap = new Map(cuPrices.map((q) => [q.date, q.close]));
  const auMap = new Map(auPrices.map((q) => [q.date, q.close]));
  const qqqMap = new Map(qqqPrices.map((q) => [q.date, q.close]));

  // Derived: net liquidity & M2 YoY growth & copper/gold ratio
  const allMonths = [...walclMap.keys()].sort();
  const netLiqMap = new Map<string, number>();
  const m2GrowthMap = new Map<string, number>();
  const cuAuMap = new Map<string, number>();

  for (const m of allMonths) {
    const w = walclMap.get(m);
    const t = tgaMap.get(m);
    if (w != null && t != null)
      netLiqMap.set(m, w - (rrpMap.get(m) ?? 0) - t);

    const m2Val = m2Map.get(m);
    const m2Ago = m2Map.get(addMonths(m, -12));
    if (m2Val != null && m2Ago != null)
      m2GrowthMap.set(m, ((m2Val - m2Ago) / m2Ago) * 100);
  }

  // Copper/gold ratio for all months where both exist
  const allCuAuMonths = [
    ...new Set([...cuMap.keys(), ...auMap.keys()]),
  ].sort();
  for (const m of allCuAuMonths) {
    const cu = cuMap.get(m);
    const au = auMap.get(m);
    if (cu != null && au != null && au > 0) cuAuMap.set(m, cu / au);
  }

  // Backtest period: last 10 years
  const bt10 = new Date();
  bt10.setFullYear(bt10.getFullYear() - 10);
  const btStartYM = `${bt10.getFullYear()}-${String(bt10.getMonth() + 1).padStart(2, "0")}`;
  const backtestMonths = allMonths.filter((m) => m >= btStartYM);

  const LOOKBACK = 120; // 10 years in months
  const calc = (
    val: number,
    hist: number[],
    inv: boolean
  ) => {
    const pct = percentileRank(hist, val);
    return inv ? 100 - pct : pct;
  };

  const points: BacktestPoint[] = [];

  for (const month of backtestMonths) {
    const nl = netLiqMap.get(month);
    const mg = m2GrowthMap.get(month);
    const t10 = t10y2yMap.get(month);
    const nf = nfciMap.get(month);
    const cuAu = cuAuMap.get(month);

    // Need at least net liq, M2, T10Y2Y, NFCI, copper/gold
    if (
      nl == null ||
      mg == null ||
      t10 == null ||
      nf == null ||
      cuAu == null
    )
      continue;

    const ted = tedMap.get(month); // may be null

    // Rolling lookback windows (no future data)
    const nlHist = windowValues(netLiqMap, month, LOOKBACK);
    const mgHist = windowValues(m2GrowthMap, month, LOOKBACK);
    const t10Hist = windowValues(t10y2yMap, month, LOOKBACK);
    const cuAuHist = windowValues(cuAuMap, month, LOOKBACK);
    const tedHist =
      ted != null ? windowValues(tedMap, month, LOOKBACK) : [];
    const nfHist = windowValues(nfciMap, month, LOOKBACK);

    // Level scores
    const nlS = calc(nl, nlHist, false);
    const mgS = calc(mg, mgHist, false);
    const t10S = calc(t10, t10Hist, false);
    const cuAuS = calc(cuAu, cuAuHist, false);
    const tedS = ted != null ? calc(ted, tedHist, true) : 50;
    const nfS = calc(nf, nfHist, true);

    // Momentum scores (3-month change percentile)
    const momCalc = (
      map: Map<string, number>,
      cur: number,
      inv: boolean
    ) => {
      const prev = map.get(addMonths(month, -3));
      if (prev == null) return 50;
      const momVal = cur - prev;
      const momHist = windowMomentumValues(map, month, LOOKBACK);
      return calc(momVal, momHist, inv);
    };

    const nlMomS = momCalc(netLiqMap, nl, false);
    const mgMomS = momCalc(m2GrowthMap, mg, false);
    const t10MomS = momCalc(t10y2yMap, t10, false);
    const cuAuMomS = momCalc(cuAuMap, cuAu, false);
    const tedMomS =
      ted != null ? momCalc(tedMap, ted, true) : 50;
    const nfMomS = momCalc(nfciMap, nf, true);

    // Combined — per-indicator weights
    // Momentum-dominant: net liq, M2, T10Y2Y (mom 60% + level 40%)
    const nlC = nlMomS * 0.6 + nlS * 0.4;
    const mgC = mgMomS * 0.6 + mgS * 0.4;
    const t10C = t10MomS * 0.6 + t10S * 0.4;
    // Level-dominant: copper/gold, TED, NFCI (level 60% + mom 40%)
    const cuAuC = cuAuS * 0.6 + cuAuMomS * 0.4;
    const tedC = tedS * 0.6 + tedMomS * 0.4;
    const nfC = nfS * 0.6 + nfMomS * 0.4;

    // Final = simple average of 6
    const finalScore =
      (nlC + mgC + t10C + cuAuC + tedC + nfC) / 6;

    // QQQ forward returns (1–6 months)
    const qNow = qqqMap.get(month);
    const fwd = (n: number) => {
      const qF = qqqMap.get(addMonths(month, n));
      return qNow && qF ? r2(((qF / qNow) - 1) * 100) : null;
    };

    points.push({
      date: month,
      score: r1(finalScore),
      regime: "EXPANSION" as RegimeType, // classified below
      qqq1m: fwd(1),
      qqq2m: fwd(2),
      qqq3m: fwd(3),
      qqq4m: fwd(4),
      qqq5m: fwd(5),
      qqq6m: fwd(6),
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

  // Return key helpers
  type QKey =
    | "qqq1m"
    | "qqq2m"
    | "qqq3m"
    | "qqq4m"
    | "qqq5m"
    | "qqq6m";
  const qKeys: QKey[] = [
    "qqq1m",
    "qqq2m",
    "qqq3m",
    "qqq4m",
    "qqq5m",
    "qqq6m",
  ];

  const avgReturn = (
    pts: BacktestPoint[],
    key: QKey
  ): number => {
    const valid = pts.filter((p) => p[key] != null);
    return valid.length > 0
      ? r2(valid.reduce((s, p) => s + p[key]!, 0) / valid.length)
      : 0;
  };

  // Bucket stats
  const bucketDefs = [
    {
      label: "유동성 풍부 (75+)",
      color: "#16a34a",
      min: 75,
      max: 101,
    },
    { label: "중립 (50~75)", color: "#ca8a04", min: 50, max: 75 },
    {
      label: "유동성 긴장 (25~50)",
      color: "#ea580c",
      min: 25,
      max: 50,
    },
    {
      label: "유동성 경색 (25 이하)",
      color: "#dc2626",
      min: -1,
      max: 25,
    },
  ];

  const buckets: BucketStats[] = bucketDefs.map(
    ({ label, color, min, max }) => {
      const inB = points.filter(
        (p) => p.score >= min && p.score < max
      );
      return {
        label,
        color,
        count: inB.length,
        avg1m: avgReturn(inB, "qqq1m"),
        avg2m: avgReturn(inB, "qqq2m"),
        avg3m: avgReturn(inB, "qqq3m"),
        avg4m: avgReturn(inB, "qqq4m"),
        avg5m: avgReturn(inB, "qqq5m"),
        avg6m: avgReturn(inB, "qqq6m"),
      };
    }
  );

  // Accuracy: score>=50 → QQQ up, score<50 → QQQ down
  const calcAcc = (key: QKey): number => {
    const valid = points.filter((p) => p[key] != null);
    if (valid.length === 0) return 0;
    const highOk = valid.filter(
      (p) => p.score >= 50 && p[key]! > 0
    ).length;
    const highN = valid.filter((p) => p.score >= 50).length;
    const lowOk = valid.filter(
      (p) => p.score < 50 && p[key]! <= 0
    ).length;
    const lowN = valid.filter((p) => p.score < 50).length;
    const hA = highN > 0 ? highOk / highN : 0;
    const lA = lowN > 0 ? lowOk / lowN : 0;
    if (highN === 0) return r1(lA * 100);
    if (lowN === 0) return r1(hA * 100);
    return r1(((hA + lA) / 2) * 100);
  };

  const accVals = qKeys.map(calcAcc);
  const accuracy: AccuracyObj = {
    month1: accVals[0],
    month2: accVals[1],
    month3: accVals[2],
    month4: accVals[3],
    month5: accVals[4],
    month6: accVals[5],
    overall: r1(accVals.reduce((a, b) => a + b, 0) / 6),
  };

  // Regime stats
  const regimeTypes: RegimeType[] = [
    "RECOVERY",
    "EXPANSION",
    "SLOWDOWN",
    "CONTRACTION",
  ];
  const regimeStats = {} as Record<RegimeType, RegimeStat>;
  for (const type of regimeTypes) {
    const inR = points.filter((p) => p.regime === type);
    const wr6 = (() => {
      const valid = inR.filter((p) => p.qqq6m != null);
      if (valid.length === 0) return 0;
      return r1(
        (valid.filter((p) => p.qqq6m! > 0).length / valid.length) *
          100
      );
    })();
    regimeStats[type] = {
      count: inR.length,
      avg1m: avgReturn(inR, "qqq1m"),
      avg2m: avgReturn(inR, "qqq2m"),
      avg3m: avgReturn(inR, "qqq3m"),
      avg4m: avgReturn(inR, "qqq4m"),
      avg5m: avgReturn(inR, "qqq5m"),
      avg6m: avgReturn(inR, "qqq6m"),
      winRate6m: wr6,
    };
  }

  // Regime accuracy
  const calcRegimeAcc = (key: QKey): number => {
    const valid = points.filter((p) => p[key] != null);
    if (valid.length === 0) return 0;
    const bullish = valid.filter(
      (p) => p.regime === "RECOVERY" || p.regime === "EXPANSION"
    );
    const bearish = valid.filter(
      (p) => p.regime === "SLOWDOWN" || p.regime === "CONTRACTION"
    );
    const bullOk = bullish.filter((p) => p[key]! > 0).length;
    const bearOk = bearish.filter((p) => p[key]! <= 0).length;
    const bA = bullish.length > 0 ? bullOk / bullish.length : 0;
    const bB = bearish.length > 0 ? bearOk / bearish.length : 0;
    if (bullish.length === 0) return r1(bB * 100);
    if (bearish.length === 0) return r1(bA * 100);
    return r1(((bA + bB) / 2) * 100);
  };

  const raVals = qKeys.map(calcRegimeAcc);
  const regimeAccuracy: AccuracyObj = {
    month1: raVals[0],
    month2: raVals[1],
    month3: raVals[2],
    month4: raVals[3],
    month5: raVals[4],
    month6: raVals[5],
    overall: r1(raVals.reduce((a, b) => a + b, 0) / 6),
  };

  const validPts = points.filter((p) => p.qqq1m != null);

  return {
    points,
    buckets,
    accuracy,
    regimeStats,
    regimeAccuracy,
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
