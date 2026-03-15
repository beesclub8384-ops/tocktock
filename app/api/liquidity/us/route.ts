import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import YahooFinance from "yahoo-finance2";

export const maxDuration = 60;

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";
const CACHE_KEY = "liquidity:us:v4";
const CACHE_TTL = 86400;

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
  if (values.length === 0) return 50;
  const below = values.filter((v) => v < current).length;
  return (below / values.length) * 100;
}

function buildMomHist(
  history: number[],
  offset: number,
  chronological = false
): number[] {
  if (history.length <= offset) return [];
  const mh: number[] = [];
  if (chronological) {
    for (let i = offset; i < history.length; i++)
      mh.push(history[i] - history[i - offset]);
  } else {
    for (let i = 0; i <= history.length - offset - 1; i++)
      mh.push(history[i] - history[i + offset]);
  }
  return mh;
}

function momScore(
  momHist: number[],
  idx: number,
  inverted: boolean
): number {
  if (momHist.length === 0 || idx < 0 || idx >= momHist.length) return 50;
  const pct = percentileRank(momHist, momHist[idx]);
  return inverted ? 100 - pct : pct;
}

type RegimeType = "RECOVERY" | "EXPANSION" | "SLOWDOWN" | "CONTRACTION";

function classifyRegime(
  score: number,
  rising: boolean
): {
  regime: RegimeType;
  regimeLabel: string;
  regimeColor: string;
  regimeSignal: string;
} {
  if (score < 50 && rising)
    return {
      regime: "RECOVERY",
      regimeLabel: "바닥 탈출",
      regimeColor: "blue",
      regimeSignal:
        "강한 매수 신호 — 역사적으로 가장 강한 반등 구간",
    };
  if (score >= 50 && rising)
    return {
      regime: "EXPANSION",
      regimeLabel: "상승 지속",
      regimeColor: "green",
      regimeSignal: "상승 지속 가능성 높음",
    };
  if (score >= 50 && !rising)
    return {
      regime: "SLOWDOWN",
      regimeLabel: "고점 경고",
      regimeColor: "orange",
      regimeSignal: "상승 둔화, 주의 필요",
    };
  return {
    regime: "CONTRACTION",
    regimeLabel: "하락 지속",
    regimeColor: "red",
    regimeSignal: "하락 위험, 회피",
  };
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
  subtitle: string;
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

  /* ── 1. Fetch FRED data (~10 years) ── */
  const [walclObs, rrpObs, tgaObs, m2Obs, t10y2yObs, nfciObs] =
    await Promise.all([
      fetchFredSeries("WALCL", 530),
      fetchFredSeries("RRPONTSYD", 2600),
      fetchFredSeries("WTREGEN", 530),
      fetchFredSeries("M2SL", 132),
      fetchFredSeries("T10Y2Y", 2600),
      fetchFredSeries("NFCI", 530),
    ]);

  // TEDRATE may be discontinued — graceful fallback
  let tedObs: FredObs[] = [];
  let tedAvailable = false;
  try {
    tedObs = await fetchFredSeries("TEDRATE", 2600);
    tedAvailable = tedObs.length > 0;
  } catch {
    tedAvailable = false;
  }

  /* ── 2. Fetch Yahoo Finance: Copper & Gold ── */
  const tenYearsAgo = new Date(
    Date.now() - 10 * 365.25 * 24 * 60 * 60 * 1000
  );
  const [cuChart, auChart] = await Promise.all([
    yahooFinance.chart("HG=F", { period1: tenYearsAgo, interval: "1d" }),
    yahooFinance.chart("GC=F", { period1: tenYearsAgo, interval: "1d" }),
  ]);

  const cuDaily = new Map<string, number>();
  for (const q of cuChart.quotes ?? []) {
    if (q.close != null && q.date != null)
      cuDaily.set(
        (q.date as Date).toISOString().slice(0, 10),
        q.close as number
      );
  }
  const auDaily = new Map<string, number>();
  for (const q of auChart.quotes ?? []) {
    if (q.close != null && q.date != null)
      auDaily.set(
        (q.date as Date).toISOString().slice(0, 10),
        q.close as number
      );
  }

  // Copper/Gold ratio history (chronological)
  const allDates = [
    ...new Set([...cuDaily.keys(), ...auDaily.keys()]),
  ].sort();
  const cuAuHistory: number[] = [];
  for (const d of allDates) {
    const cu = cuDaily.get(d);
    const au = auDaily.get(d);
    if (cu != null && au != null && au > 0) cuAuHistory.push(cu / au);
  }
  const cuAuLatest =
    cuAuHistory.length > 0 ? cuAuHistory[cuAuHistory.length - 1] : 0;

  /* ── 3. Compute indicator values & histories ── */

  // Net Liquidity (reverse-chrono, weekly)
  const walclMap = new Map(
    walclObs.map((o) => [o.date, parseFloat(o.value)])
  );
  const tgaMap = new Map(
    tgaObs.map((o) => [o.date, parseFloat(o.value)])
  );
  const rrpByDate = new Map(
    rrpObs.map((o) => [o.date, parseFloat(o.value) / 1000])
  );
  const walclLatest = parseFloat(walclObs[0].value);
  const rrpLatest = parseFloat(rrpObs[0].value) / 1000;
  const tgaLatest = parseFloat(tgaObs[0].value);
  const netLiquidity = walclLatest - rrpLatest - tgaLatest;

  const netLiqHistory: number[] = [];
  for (const obs of walclObs) {
    const w = walclMap.get(obs.date);
    const t = tgaMap.get(obs.date);
    const r = rrpByDate.get(obs.date);
    if (w !== undefined && t !== undefined)
      netLiqHistory.push(w - (r ?? 0) - t);
  }

  // M2 YoY Growth (reverse-chrono, monthly)
  const m2Values = m2Obs.map((o) => parseFloat(o.value));
  const m2Latest = m2Values[0];
  const m2YearAgo = m2Values[12] ?? m2Values[m2Values.length - 1];
  const m2Growth = ((m2Latest - m2YearAgo) / m2YearAgo) * 100;
  const m2GrowthHistory: number[] = [];
  for (let i = 0; i + 12 < m2Values.length; i++)
    m2GrowthHistory.push(
      ((m2Values[i] - m2Values[i + 12]) / m2Values[i + 12]) * 100
    );

  // T10Y2Y (reverse-chrono, daily)
  const t10y2yValues = t10y2yObs.map((o) => parseFloat(o.value));
  const t10y2yLatest = t10y2yValues[0];

  // TEDRATE (reverse-chrono, daily — may be empty)
  const tedValues = tedObs.map((o) => parseFloat(o.value));
  const tedLatest = tedAvailable ? tedValues[0] : 0;

  // NFCI (reverse-chrono, weekly)
  const nfciValues = nfciObs.map((o) => parseFloat(o.value));
  const nfciLatest = nfciValues[0];

  /* ── 4. Score calculation ── */

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
  const nlLevel = calcScore(netLiquidity, netLiqHistory, false);
  const m2Level = calcScore(m2Growth, m2GrowthHistory, false);
  const t10Level = calcScore(t10y2yLatest, t10y2yValues, false);
  const cuAuLevel = calcScore(cuAuLatest, cuAuHistory, false);
  const tedLevel = tedAvailable
    ? calcScore(tedLatest, tedValues, true)
    : 50;
  const nfciLevel = calcScore(nfciLatest, nfciValues, true);

  // Momentum histories
  const nlMomH = buildMomHist(netLiqHistory, 13); // weekly ~3mo
  const m2MomH = buildMomHist(m2GrowthHistory, 3); // monthly 3mo
  const t10MomH = buildMomHist(t10y2yValues, 63); // daily ~3mo
  const cuAuMomH = buildMomHist(cuAuHistory, 63, true); // daily chrono
  const tedMomH = tedAvailable ? buildMomHist(tedValues, 63) : [];
  const nfciMomH = buildMomHist(nfciValues, 13); // weekly ~3mo

  // Momentum scores (idx 0 = most recent for reverse-chrono, last for chrono)
  const nlMom = momScore(nlMomH, 0, false);
  const m2Mom = momScore(m2MomH, 0, false);
  const t10Mom = momScore(t10MomH, 0, false);
  const cuAuMom = momScore(cuAuMomH, cuAuMomH.length - 1, false);
  const tedMom = tedAvailable ? momScore(tedMomH, 0, true) : 50;
  const nfciMom = momScore(nfciMomH, 0, true);

  // Combined scores — per-indicator weights
  // Momentum-dominant (mom 60% + level 40%): 순유동성, M2, 금리차
  const nlScore = nlMom * 0.6 + nlLevel * 0.4;
  const m2Score = m2Mom * 0.6 + m2Level * 0.4;
  const t10Score = t10Mom * 0.6 + t10Level * 0.4;
  // Level-dominant (level 60% + mom 40%): 구리/금, TED, NFCI
  const cuAuScore = cuAuLevel * 0.6 + cuAuMom * 0.4;
  const tedScore = tedLevel * 0.6 + tedMom * 0.4;
  const nfciScore = nfciLevel * 0.6 + nfciMom * 0.4;

  // Final = simple average of all 6
  const allScores = [nlScore, m2Score, t10Score, cuAuScore, tedScore, nfciScore];
  const finalScore = allScores.reduce((a, b) => a + b, 0) / 6;

  // For display purposes
  const macroScore = (nlScore + m2Score + t10Score + cuAuScore) / 4;
  const marketScore = (tedScore + nfciScore) / 2;

  /* ── 5. Regime classification ── */

  const computePastScore = (): number | null => {
    const pNl =
      netLiqHistory.length > 13 ? netLiqHistory[13] : undefined;
    const pM2 =
      m2GrowthHistory.length > 3 ? m2GrowthHistory[3] : undefined;
    const pT10 =
      t10y2yValues.length > 63 ? t10y2yValues[63] : undefined;
    const pCuAu =
      cuAuHistory.length > 63
        ? cuAuHistory[cuAuHistory.length - 1 - 63]
        : undefined;
    const pTed =
      tedAvailable && tedValues.length > 63
        ? tedValues[63]
        : undefined;
    const pNf =
      nfciValues.length > 13 ? nfciValues[13] : undefined;

    if (
      pNl == null ||
      pM2 == null ||
      pT10 == null ||
      pCuAu == null ||
      pNf == null
    )
      return null;

    const pNlL = calcScore(pNl, netLiqHistory, false);
    const pM2L = calcScore(pM2, m2GrowthHistory, false);
    const pT10L = calcScore(pT10, t10y2yValues, false);
    const pCuAuL = calcScore(pCuAu, cuAuHistory, false);
    const pTedL =
      pTed != null ? calcScore(pTed, tedValues, true) : 50;
    const pNfL = calcScore(pNf, nfciValues, true);

    const pNlM = momScore(nlMomH, 13, false);
    const pM2M = momScore(m2MomH, 3, false);
    const pT10M = momScore(t10MomH, 63, false);
    const pCuAuM = momScore(
      cuAuMomH,
      cuAuMomH.length - 1 - 63,
      false
    );
    const pTedM =
      pTed != null ? momScore(tedMomH, 63, true) : 50;
    const pNfM = momScore(nfciMomH, 13, true);

    const pNlS = pNlM * 0.6 + pNlL * 0.4;
    const pM2S = pM2M * 0.6 + pM2L * 0.4;
    const pT10S = pT10M * 0.6 + pT10L * 0.4;
    const pCuAuS = pCuAuL * 0.6 + pCuAuM * 0.4;
    const pTedS = pTedL * 0.6 + pTedM * 0.4;
    const pNfS = pNfL * 0.6 + pNfM * 0.4;

    return (pNlS + pM2S + pT10S + pCuAuS + pTedS + pNfS) / 6;
  };

  const pastFinal = computePastScore();
  const scoreChange3m =
    pastFinal != null
      ? Math.round((finalScore - pastFinal) * 10) / 10
      : null;
  const rising = scoreChange3m != null ? scoreChange3m > 0 : true;
  const { regime, regimeLabel, regimeColor, regimeSignal } =
    classifyRegime(finalScore, rising);

  /* ── 6. Build response ── */

  const r10 = (v: number) => Math.round(v * 10) / 10;
  const r100 = (v: number) => Math.round(v * 100) / 100;

  const indicators: IndicatorResult[] = [
    {
      id: "net-liquidity",
      name: "연준 순유동성",
      value: Math.round(netLiquidity / 1000) / 1000,
      score: r10(nlScore),
      levelScore: r10(nlLevel),
      momentumScore: r10(nlMom),
      combinedScore: r10(nlScore),
      unit: "조 달러",
      description:
        "연준 대차대조표에서 역레포·재무부 계좌를 뺀 실질 유동성",
      category: "macro",
      inverted: false,
    },
    {
      id: "m2-growth",
      name: "M2 통화량 증가율",
      value: r100(m2Growth),
      score: r10(m2Score),
      levelScore: r10(m2Level),
      momentumScore: r10(m2Mom),
      combinedScore: r10(m2Score),
      unit: "% YoY",
      description: "시중에 풀린 돈의 총량 변화율",
      category: "macro",
      inverted: false,
    },
    {
      id: "t10y2y",
      name: "장단기 금리차",
      value: r100(t10y2yLatest),
      score: r10(t10Score),
      levelScore: r10(t10Level),
      momentumScore: r10(t10Mom),
      combinedScore: r10(t10Score),
      unit: "%",
      description:
        "10년-2년 금리차. 역전 해소될 때 나스닥 반등 경향",
      category: "macro",
      inverted: false,
    },
    {
      id: "copper-gold",
      name: "구리/금 비율",
      value: Math.round(cuAuLatest * 10000) / 10000,
      score: r10(cuAuScore),
      levelScore: r10(cuAuLevel),
      momentumScore: r10(cuAuMom),
      combinedScore: r10(cuAuScore),
      unit: "",
      description:
        "경기 낙관(구리) vs 비관(금) 비율. 낮을수록 향후 반등 가능성",
      category: "macro",
      inverted: false,
    },
    {
      id: "ted-spread",
      name: "테드 스프레드",
      value: tedAvailable ? r100(tedLatest) : 0,
      score: r10(tedScore),
      levelScore: r10(tedLevel),
      momentumScore: r10(tedMom),
      combinedScore: r10(tedScore),
      unit: "%",
      description:
        "은행간 자금 경색 지표. 높을수록 향후 반등 가능성",
      category: "market",
      inverted: true,
    },
    {
      id: "nfci",
      name: "NFCI (금융상황지수)",
      value: Math.round(nfciLatest * 1000) / 1000,
      score: r10(nfciScore),
      levelScore: r10(nfciLevel),
      momentumScore: r10(nfciMom),
      combinedScore: r10(nfciScore),
      unit: "",
      description:
        "시카고 연준 금융상황지수. 높을수록 향후 반등 가능성",
      category: "market",
      inverted: true,
    },
  ];

  return {
    finalScore: r10(finalScore),
    macroScore: r10(macroScore),
    marketScore: r10(marketScore),
    subtitle:
      "연준 유동성·크레딧·시장 상황을 종합한 나스닥 4~6개월 선행 지표",
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
    const cached = await redis.get<LiquidityResponse>(CACHE_KEY);
    if (cached) return NextResponse.json(cached);

    const result = await computeLiquidity();
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
