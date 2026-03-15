import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import YahooFinance from "yahoo-finance2";

export const maxDuration = 60;

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";
const CACHE_KEY = "liquidity:us";
const CACHE_TTL = 86400; // 24h

interface FredObs {
  date: string;
  value: string;
}

async function fetchFredSeries(
  seriesId: string,
  limit: number
): Promise<FredObs[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error("FRED_API_KEY not set");
  const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`FRED ${seriesId}: ${res.status}`);
  const json = await res.json();
  return (json.observations as FredObs[]).filter((o) => o.value !== ".");
}

function percentileRank(values: number[], current: number): number {
  const below = values.filter((v) => v < current).length;
  return (below / values.length) * 100;
}

export interface IndicatorResult {
  id: string;
  name: string;
  value: number;
  score: number;
  unit: string;
  description: string;
  category: "macro" | "market";
  inverted: boolean;
}

export interface LiquidityResponse {
  finalScore: number;
  macroScore: number;
  marketScore: number;
  indicators: IndicatorResult[];
  fetchedAt: string;
}

async function computeLiquidity(): Promise<LiquidityResponse> {
  const yahooFinance = new YahooFinance();

  // Fetch ~5 years of weekly FRED data (260 weeks) or monthly (60 months)
  const [walclObs, rrpObs, tgaObs, m2Obs, hyObs, igObs, nfciObs] =
    await Promise.all([
      fetchFredSeries("WALCL", 280),   // weekly
      fetchFredSeries("RRPONTSYD", 1400), // daily
      fetchFredSeries("WTREGEN", 280),  // weekly
      fetchFredSeries("M2SL", 72),      // monthly
      fetchFredSeries("BAMLH0A0HYM2", 1300), // daily
      fetchFredSeries("BAMLC0A0CM", 1300),    // daily
      fetchFredSeries("NFCI", 280),     // weekly
    ]);

  // 1. Fed Net Liquidity = WALCL - RRPONTSYD - WTREGEN
  const walclLatest = parseFloat(walclObs[0].value);
  const rrpLatest = parseFloat(rrpObs[0].value) / 1000; // billions to millions
  const tgaLatest = parseFloat(tgaObs[0].value);
  const netLiquidity = walclLatest - rrpLatest - tgaLatest;

  // Build 5-year historical net liquidity (approximate using weekly WALCL dates)
  const walclMap = new Map(walclObs.map((o) => [o.date, parseFloat(o.value)]));
  const tgaMap = new Map(tgaObs.map((o) => [o.date, parseFloat(o.value)]));
  const rrpByDate = new Map(
    rrpObs.map((o) => [o.date, parseFloat(o.value) / 1000])
  );

  const netLiqHistory: number[] = [];
  for (const obs of walclObs) {
    const w = walclMap.get(obs.date);
    const t = tgaMap.get(obs.date);
    // Find closest RRP
    const r = rrpByDate.get(obs.date);
    if (w !== undefined && t !== undefined) {
      netLiqHistory.push(w - (r ?? 0) - t);
    }
  }

  // 2. M2 YoY growth
  const m2Values = m2Obs.map((o) => parseFloat(o.value));
  const m2Latest = m2Values[0];
  const m2YearAgo = m2Values[12] ?? m2Values[m2Values.length - 1];
  const m2Growth = ((m2Latest - m2YearAgo) / m2YearAgo) * 100;
  const m2GrowthHistory: number[] = [];
  for (let i = 0; i + 12 < m2Values.length; i++) {
    m2GrowthHistory.push(
      ((m2Values[i] - m2Values[i + 12]) / m2Values[i + 12]) * 100
    );
  }

  // 3. HY Spread
  const hyValues = hyObs.map((o) => parseFloat(o.value));
  const hyLatest = hyValues[0];

  // 4. IG Spread
  const igValues = igObs.map((o) => parseFloat(o.value));
  const igLatest = igValues[0];

  // 5. NFCI
  const nfciValues = nfciObs.map((o) => parseFloat(o.value));
  const nfciLatest = nfciValues[0];

  // 6. VIX 3-month average
  const vixChart = await yahooFinance.chart("^VIX", {
    period1: new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000),
    interval: "1d",
  });
  const vixCloses = (vixChart.quotes ?? [])
    .map((q: { close?: number | null }) => q.close)
    .filter((v): v is number => v != null);
  const vix63 = vixCloses.slice(-63);
  const vix3mAvg =
    vix63.length > 0 ? vix63.reduce((a, b) => a + b, 0) / vix63.length : 20;

  // Build VIX 3m avg history (rolling 63-day)
  const vixAvgHistory: number[] = [];
  for (let i = 63; i <= vixCloses.length; i++) {
    const slice = vixCloses.slice(i - 63, i);
    vixAvgHistory.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }

  // Calculate scores
  const calcScore = (
    current: number,
    history: number[],
    inverted: boolean
  ): number => {
    if (history.length === 0) return 50;
    const pct = percentileRank(history, current);
    return inverted ? 100 - pct : pct;
  };

  const netLiqScore = calcScore(netLiquidity, netLiqHistory, false);
  const m2Score = calcScore(m2Growth, m2GrowthHistory, false);
  const hyScore = calcScore(hyLatest, hyValues, true);
  const igScore = calcScore(igLatest, igValues, true);
  const nfciScore = calcScore(nfciLatest, nfciValues, true);
  const vixScore = calcScore(vix3mAvg, vixAvgHistory, true);

  const macroScore = (netLiqScore + m2Score + hyScore + igScore) / 4;
  const marketScore = (nfciScore + vixScore) / 2;
  const finalScore = macroScore * 0.5 + marketScore * 0.5;

  const indicators: IndicatorResult[] = [
    {
      id: "net-liquidity",
      name: "연준 순유동성",
      value: Math.round(netLiquidity / 1000) / 1000, // to trillions with 3 decimals
      score: Math.round(netLiqScore * 10) / 10,
      unit: "조 달러",
      description: "연준 대차대조표에서 역레포·재무부 계좌를 뺀 실질 유동성",
      category: "macro",
      inverted: false,
    },
    {
      id: "m2-growth",
      name: "M2 통화량 증가율",
      value: Math.round(m2Growth * 100) / 100,
      score: Math.round(m2Score * 10) / 10,
      unit: "% YoY",
      description: "시중에 풀린 돈의 총량 변화. 플러스면 유동성 확장",
      category: "macro",
      inverted: false,
    },
    {
      id: "hy-spread",
      name: "하이일드 스프레드",
      value: Math.round(hyLatest * 100) / 100,
      score: Math.round(hyScore * 10) / 10,
      unit: "%",
      description: "정크본드와 국채의 금리 차이. 낮을수록 크레딧 시장 안정",
      category: "macro",
      inverted: true,
    },
    {
      id: "ig-spread",
      name: "IG 크레딧 스프레드",
      value: Math.round(igLatest * 100) / 100,
      score: Math.round(igScore * 10) / 10,
      unit: "%",
      description: "투자등급 회사채와 국채 금리 차이. 낮을수록 기업 자금조달 원활",
      category: "macro",
      inverted: true,
    },
    {
      id: "nfci",
      name: "NFCI (금융상황지수)",
      value: Math.round(nfciLatest * 1000) / 1000,
      score: Math.round(nfciScore * 10) / 10,
      unit: "",
      description: "시카고 연준 금융상황지수. 0 이하이면 완화적, 양수이면 긴축적",
      category: "market",
      inverted: true,
    },
    {
      id: "vix-3m",
      name: "VIX 3개월 평균",
      value: Math.round(vix3mAvg * 100) / 100,
      score: Math.round(vixScore * 10) / 10,
      unit: "",
      description: "변동성지수 63거래일 평균. 낮을수록 시장 안정",
      category: "market",
      inverted: true,
    },
  ];

  return {
    finalScore: Math.round(finalScore * 10) / 10,
    macroScore: Math.round(macroScore * 10) / 10,
    marketScore: Math.round(marketScore * 10) / 10,
    indicators,
    fetchedAt: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    // Check cache
    const cached = await redis.get<LiquidityResponse>(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    const result = await computeLiquidity();

    // Cache (no JSON.stringify — @upstash/redis auto-serializes)
    await redis.set(CACHE_KEY, result, { ex: CACHE_TTL });

    return NextResponse.json(result);
  } catch (error) {
    console.error("liquidity/us API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch liquidity data" },
      { status: 500 }
    );
  }
}
