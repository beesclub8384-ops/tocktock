import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import YahooFinance from "yahoo-finance2";

export const maxDuration = 60;

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";
const CACHE_KEY = "liquidity:us:v3";
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

function buildMomHist(
  history: number[],
  offset: number,
  chronological: boolean = false
): number[] {
  if (history.length <= offset) return [];
  const mh: number[] = [];
  if (chronological) {
    for (let i = offset; i < history.length; i++) mh.push(history[i] - history[i - offset]);
  } else {
    for (let i = 0; i <= history.length - offset - 1; i++) mh.push(history[i] - history[i + offset]);
  }
  return mh;
}

function momScore(momHist: number[], idx: number, inverted: boolean): number {
  if (momHist.length === 0 || idx < 0 || idx >= momHist.length) return 50;
  const pct = percentileRank(momHist, momHist[idx]);
  return inverted ? 100 - pct : pct;
}

type RegimeType = "RECOVERY" | "EXPANSION" | "SLOWDOWN" | "CONTRACTION";

function classifyRegime(score: number, rising: boolean): {
  regime: RegimeType; regimeLabel: string; regimeColor: string; regimeSignal: string;
} {
  if (score < 50 && rising)
    return { regime: "RECOVERY", regimeLabel: "바닥 탈출", regimeColor: "blue", regimeSignal: "강한 매수 신호 — 역사적으로 가장 강한 반등 구간" };
  if (score >= 50 && rising)
    return { regime: "EXPANSION", regimeLabel: "상승 지속", regimeColor: "green", regimeSignal: "상승 지속 가능성 높음" };
  if (score >= 50 && !rising)
    return { regime: "SLOWDOWN", regimeLabel: "고점 경고", regimeColor: "orange", regimeSignal: "상승 둔화, 주의 필요" };
  return { regime: "CONTRACTION", regimeLabel: "하락 지속", regimeColor: "red", regimeSignal: "하락 위험, 회피" };
}

export interface IndicatorResult {
  id: string;
  name: string;
  value: number;
  score: number;
  levelScore: number;
  momentumScore: number;
  combinedScore: number;
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
  regime: RegimeType;
  regimeLabel: string;
  regimeColor: string;
  regimeSignal: string;
  scoreChange3m: number | null;
  fetchedAt: string;
}

async function computeLiquidity(): Promise<LiquidityResponse> {
  const yahooFinance = new YahooFinance();

  // Fetch ~10 years of FRED data for percentile ranking
  const [walclObs, rrpObs, tgaObs, m2Obs, hyObs, igObs, nfciObs] =
    await Promise.all([
      fetchFredSeries("WALCL", 530),      // weekly ~10yr
      fetchFredSeries("RRPONTSYD", 2600), // daily ~10yr
      fetchFredSeries("WTREGEN", 530),    // weekly ~10yr
      fetchFredSeries("M2SL", 132),       // monthly ~11yr (need 12 extra for YoY)
      fetchFredSeries("BAMLH0A0HYM2", 2600), // daily ~10yr
      fetchFredSeries("BAMLC0A0CM", 2600),    // daily ~10yr
      fetchFredSeries("NFCI", 530),       // weekly ~10yr
    ]);

  // 1. Fed Net Liquidity = WALCL - RRPONTSYD - WTREGEN
  const walclLatest = parseFloat(walclObs[0].value);
  const rrpLatest = parseFloat(rrpObs[0].value) / 1000; // billions to millions
  const tgaLatest = parseFloat(tgaObs[0].value);
  const netLiquidity = walclLatest - rrpLatest - tgaLatest;

  // Build 10-year historical net liquidity (approximate using weekly WALCL dates)
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
    period1: new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000),
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

  // Level scores
  const netLiqLevel = calcScore(netLiquidity, netLiqHistory, false);
  const m2Level = calcScore(m2Growth, m2GrowthHistory, false);
  const hyLevel = calcScore(hyLatest, hyValues, true);
  const igLevel = calcScore(igLatest, igValues, true);
  const nfciLevel = calcScore(nfciLatest, nfciValues, true);
  const vixLevel = calcScore(vix3mAvg, vixAvgHistory, true);

  // Build momentum histories
  const nlMomH = buildMomHist(netLiqHistory, 13);
  const m2MomH = buildMomHist(m2GrowthHistory, 3);
  const hyMomH = buildMomHist(hyValues, 63);
  const igMomH = buildMomHist(igValues, 63);
  const nfciMomH = buildMomHist(nfciValues, 13);
  const vixMomH = buildMomHist(vixAvgHistory, 63, true);

  // Current momentum scores (idx 0 = most recent for reverse chrono, last for chrono)
  const netLiqMom = momScore(nlMomH, 0, false);
  const m2Mom = momScore(m2MomH, 0, false);
  const hyMom = momScore(hyMomH, 0, true);
  const igMom = momScore(igMomH, 0, true);
  const nfciMom = momScore(nfciMomH, 0, true);
  const vixMom = momScore(vixMomH, vixMomH.length - 1, true);

  // Combined scores (level 60% + momentum 40%)
  const netLiqScore = netLiqLevel * 0.6 + netLiqMom * 0.4;
  const m2Score = m2Level * 0.6 + m2Mom * 0.4;
  const hyScore = hyLevel * 0.6 + hyMom * 0.4;
  const igScore = igLevel * 0.6 + igMom * 0.4;
  const nfciScore = nfciLevel * 0.6 + nfciMom * 0.4;
  const vixScore = vixLevel * 0.6 + vixMom * 0.4;

  const macroScore = (netLiqScore + m2Score + hyScore + igScore) / 4;
  const marketScore = (nfciScore + vixScore) / 2;
  const finalScore = macroScore * 0.5 + marketScore * 0.5;

  // 3-month-ago final score for regime classification
  const computePastScore = (): number | null => {
    const pNl = netLiqHistory.length > 13 ? netLiqHistory[13] : undefined;
    const pM2 = m2GrowthHistory.length > 3 ? m2GrowthHistory[3] : undefined;
    const pHy = hyValues.length > 63 ? hyValues[63] : undefined;
    const pIg = igValues.length > 63 ? igValues[63] : undefined;
    const pNf = nfciValues.length > 13 ? nfciValues[13] : undefined;
    const pVx = vixAvgHistory.length > 63 ? vixAvgHistory[vixAvgHistory.length - 1 - 63] : undefined;
    if (pNl == null || pM2 == null || pHy == null || pIg == null || pNf == null || pVx == null) return null;

    const pNlL = calcScore(pNl, netLiqHistory, false);
    const pM2L = calcScore(pM2, m2GrowthHistory, false);
    const pHyL = calcScore(pHy, hyValues, true);
    const pIgL = calcScore(pIg, igValues, true);
    const pNfL = calcScore(pNf, nfciValues, true);
    const pVxL = calcScore(pVx, vixAvgHistory, true);

    const pNlM = momScore(nlMomH, 13, false);
    const pM2M = momScore(m2MomH, 3, false);
    const pHyM = momScore(hyMomH, 63, true);
    const pIgM = momScore(igMomH, 63, true);
    const pNfM = momScore(nfciMomH, 13, true);
    const pVxM = momScore(vixMomH, vixMomH.length - 1 - 63, true);

    const pMacro = ((pNlL*0.6+pNlM*0.4) + (pM2L*0.6+pM2M*0.4) + (pHyL*0.6+pHyM*0.4) + (pIgL*0.6+pIgM*0.4)) / 4;
    const pMarket = ((pNfL*0.6+pNfM*0.4) + (pVxL*0.6+pVxM*0.4)) / 2;
    return pMacro * 0.5 + pMarket * 0.5;
  };

  const pastFinal = computePastScore();
  const scoreChange3m = pastFinal != null ? Math.round((finalScore - pastFinal) * 10) / 10 : null;
  const rising = scoreChange3m != null ? scoreChange3m > 0 : true;
  const { regime, regimeLabel, regimeColor, regimeSignal } = classifyRegime(finalScore, rising);

  const indicators: IndicatorResult[] = [
    {
      id: "net-liquidity",
      name: "연준 순유동성",
      value: Math.round(netLiquidity / 1000) / 1000,
      score: Math.round(netLiqScore * 10) / 10,
      levelScore: Math.round(netLiqLevel * 10) / 10,
      momentumScore: Math.round(netLiqMom * 10) / 10,
      combinedScore: Math.round(netLiqScore * 10) / 10,
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
      levelScore: Math.round(m2Level * 10) / 10,
      momentumScore: Math.round(m2Mom * 10) / 10,
      combinedScore: Math.round(m2Score * 10) / 10,
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
      levelScore: Math.round(hyLevel * 10) / 10,
      momentumScore: Math.round(hyMom * 10) / 10,
      combinedScore: Math.round(hyScore * 10) / 10,
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
      levelScore: Math.round(igLevel * 10) / 10,
      momentumScore: Math.round(igMom * 10) / 10,
      combinedScore: Math.round(igScore * 10) / 10,
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
      levelScore: Math.round(nfciLevel * 10) / 10,
      momentumScore: Math.round(nfciMom * 10) / 10,
      combinedScore: Math.round(nfciScore * 10) / 10,
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
      levelScore: Math.round(vixLevel * 10) / 10,
      momentumScore: Math.round(vixMom * 10) / 10,
      combinedScore: Math.round(vixScore * 10) / 10,
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
    regime,
    regimeLabel,
    regimeColor,
    regimeSignal,
    scoreChange3m,
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
