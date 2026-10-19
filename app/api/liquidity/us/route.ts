import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import YahooFinance from "yahoo-finance2";
import { isSiteOriginSeries } from "@/lib/site-source-config";
import { siteObservations } from "@/lib/site-origin";
import { liquiditySources } from "@/lib/liquidity-sources";
import { isStale, lastOnOrBefore, staleReason, type Cadence, type ExcludedComponent } from "@/lib/liquidity-staleness";

export const maxDuration = 60;

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";
// v6 (미션 8): 원출처 전환 — v5 에는 FRED 로 받은 값이 들어 있어 키를 바꿨다(v5 는 TTL 24시간으로 저절로 사라진다)
// v7 (미션 9): 낡은 입력 규칙으로 점수와 응답 모양이 바뀌어 키를 바꿨다(v6 은 TTL 24시간)
const CACHE_KEY = "liquidity:us:v7";
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

/**
 * 시리즈 받기 (미션 8): 원출처로 전환한 시리즈(WALCL·WTREGEN 연준 H.4.1, M2SL 연준 H.6, T10Y2Y 연준 H.15 계산,
 * RRPONTSYD 뉴욕 연은)는 원출처에서 FRED 와 같은 행으로 받고, 나머지(NFCI·TEDRATE)는 FRED 그대로다.
 * 스위치: lib/site-source-config.ts (SITE_DATA_SOURCE=fred 면 모두 FRED)
 */
async function fetchSeries(seriesId: string, limit: number): Promise<FredObs[]> {
  if (isSiteOriginSeries(seriesId)) {
    const rows = await siteObservations(seriesId, { sortOrder: "desc", limit });
    return rows.filter((o) => o.value !== ".");
  }
  return fetchFredSeries(seriesId, limit);
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
        "점수가 낮지만 오르는 중 (국면별 수익률 차이는 통계적으로 확인되지 않음)",
    };
  if (score >= 50 && rising)
    return {
      regime: "EXPANSION",
      regimeLabel: "상승 지속",
      regimeColor: "green",
      regimeSignal: "점수가 높고 오르는 중 (국면별 수익률 차이는 통계적으로 확인되지 않음)",
    };
  if (score >= 50 && !rising)
    return {
      regime: "SLOWDOWN",
      regimeLabel: "고점 경고",
      regimeColor: "orange",
      regimeSignal: "점수가 높지만 내리는 중 (국면별 수익률 차이는 통계적으로 확인되지 않음)",
    };
  return {
    regime: "CONTRACTION",
    regimeLabel: "하락 지속",
    regimeColor: "red",
    regimeSignal: "점수가 낮고 내리는 중 (국면별 수익률 차이는 통계적으로 확인되지 않음)",
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
  /** 낡은 입력이라 종합 점수에서 뺐는지 (미션 9) */
  stale: boolean;
  /** 마지막 관측일 */
  lastDate: string | null;
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
  /** 낡은 입력 규칙 (미션 9): 전체 구성 요소 수, 계산에 쓴 수, 뺀 지표와 사유 */
  componentsTotal: number;
  componentsUsed: number;
  excluded: ExcludedComponent[];
  /** FRED 로 받는 시리즈와 FRED 경유 출처 표기 (미션 8 — 화면이 FRED 고지를 띄운다) */
  fredSeries: string[];
  fredCitations: string[];
  fetchedAt: string;
}

async function computeLiquidity(): Promise<LiquidityResponse> {
  const yahooFinance = new YahooFinance();

  /* ── 1. Fetch FRED data (~10 years) ── */
  const [walclObs, rrpObs, tgaObs, m2Obs, t10y2yObs, nfciObs] =
    await Promise.all([
      fetchSeries("WALCL", 530),
      fetchSeries("RRPONTSYD", 2600),
      fetchSeries("WTREGEN", 530),
      fetchSeries("M2SL", 132),
      fetchSeries("T10Y2Y", 2600),
      fetchSeries("NFCI", 530),
    ]);

  // TEDRATE may be discontinued — graceful fallback
  let tedObs: FredObs[] = [];
  let tedAvailable = false;
  try {
    tedObs = await fetchSeries("TEDRATE", 2600);
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
  const cuAuDates: string[] = []; // 낡은 입력 판단용 (미션 9)
  for (const d of allDates) {
    const cu = cuDaily.get(d);
    const au = auDaily.get(d);
    if (cu != null && au != null && au > 0) {
      cuAuHistory.push(cu / au);
      cuAuDates.push(d);
    }
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
    rrpObs.map((o) => [o.date, parseFloat(o.value) * 1000])
  );
  const walclLatest = parseFloat(walclObs[0].value);
  const rrpLatest = parseFloat(rrpObs[0].value) * 1000;
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

  /* ── 4-1. 낡은 입력 빼기 (미션 9, 결정 로그 21-1 — lib/liquidity-staleness.ts) ──
   * 평가일에 마지막 관측일이 갱신 주기의 3배보다 오래된 구성 요소는 빼고, 남은 결합 점수를 단순 평균한다.
   * 순유동성은 주간 시리즈 WALCL·WTREGEN 중 더 오래된 날짜로 본다(역레포는 운영이 없으면 0 이 정상이라 판단에서 뺀다). */
  const asOf = new Date().toISOString().slice(0, 10);
  const older = (a?: string, b?: string) => (!a || !b ? undefined : a < b ? a : b);
  const sortedDates = (obs: FredObs[]) => obs.map((o) => o.date).sort();
  const COMPONENTS: { id: string; name: string; group: "macro" | "market"; cadence: Cadence; dates: string[]; note?: string }[] = [
    { id: "net-liquidity", name: "연준 순유동성", group: "macro", cadence: "weekly", dates: [] }, // 날짜는 lastAt 이 WALCL·WTREGEN 으로 따로 본다
    { id: "m2-growth", name: "M2 통화량 증가율", group: "macro", cadence: "monthly", dates: sortedDates(m2Obs) },
    { id: "t10y2y", name: "장단기 금리차", group: "macro", cadence: "bday", dates: sortedDates(t10y2yObs) },
    { id: "copper-gold", name: "구리/금 비율", group: "macro", cadence: "bday", dates: cuAuDates },
    { id: "ted-spread", name: "테드 스프레드", group: "market", cadence: "bday", dates: sortedDates(tedObs), note: "FRED 가 2022년 1월에 이 시리즈 갱신을 멈췄습니다(3개월 LIBOR 자료 제거)." },
    { id: "nfci", name: "NFCI (금융상황지수)", group: "market", cadence: "weekly", dates: sortedDates(nfciObs) },
  ];
  const walclDates = sortedDates(walclObs);
  const tgaDates = sortedDates(tgaObs);
  const lastAt = (c: (typeof COMPONENTS)[number], at: string): string | null =>
    c.id === "net-liquidity" ? older(lastOnOrBefore(walclDates, at) ?? undefined, lastOnOrBefore(tgaDates, at) ?? undefined) ?? null : lastOnOrBefore(c.dates, at);
  const staleNow = new Map(COMPONENTS.map((c) => [c.id, isStale(lastAt(c, asOf), asOf, c.cadence)]));
  const excluded: ExcludedComponent[] = COMPONENTS.filter((c) => staleNow.get(c.id)).map((c) => {
    const last = lastAt(c, asOf);
    return { id: c.id, name: c.name, lastDate: last, reason: `${staleReason(last, c.cadence)}${c.note ? " " + c.note : ""}` };
  });

  const combinedById: Record<string, number> = {
    "net-liquidity": nlScore,
    "m2-growth": m2Score,
    t10y2y: t10Score,
    "copper-gold": cuAuScore,
    "ted-spread": tedScore,
    nfci: nfciScore,
  };
  const avgOf = (ids: string[], scores: Record<string, number>, stale: Map<string, boolean>): number | null => {
    const used = ids.filter((id) => !stale.get(id));
    return used.length === 0 ? null : used.reduce((a, id) => a + scores[id], 0) / used.length;
  };
  const allIds = COMPONENTS.map((c) => c.id);
  const macroIds = COMPONENTS.filter((c) => c.group === "macro").map((c) => c.id);
  const marketIds = COMPONENTS.filter((c) => c.group === "market").map((c) => c.id);

  // Final = 낡지 않은 구성 요소의 단순 평균 (예전: 6개 전부의 평균)
  const finalScore = avgOf(allIds, combinedById, staleNow) ?? 50;

  // For display purposes
  const macroScore = avgOf(macroIds, combinedById, staleNow) ?? 50;
  const marketScore = avgOf(marketIds, combinedById, staleNow) ?? 50;

  /* ── 5. Regime classification ──
   * 미션 11: regimeSignal·지표 description 의 반등·매수 신호 문구를 지웠다(백테스트가 우연과 구분되지 않음, 결정 로그 22-4·23-3).
   * 점수 계산은 그대로. 응답 캐시(liquidity:us:v7, 24시간)가 바뀌면 새 문구가 나온다 */

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

    // 3개월 전(91일 전) 시점에도 같은 규칙으로 낡은 입력을 뺀다 (미션 9)
    const pastAsOf = new Date(Date.parse(`${asOf}T00:00:00Z`) - 91 * 86_400_000).toISOString().slice(0, 10);
    const stalePast = new Map(COMPONENTS.map((c) => [c.id, isStale(lastAt(c, pastAsOf), pastAsOf, c.cadence)]));
    return avgOf(
      allIds,
      { "net-liquidity": pNlS, "m2-growth": pM2S, t10y2y: pT10S, "copper-gold": pCuAuS, "ted-spread": pTedS, nfci: pNfS },
      stalePast
    );
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
      stale: staleNow.get("net-liquidity") ?? false,
      lastDate: lastAt(COMPONENTS.find((c) => c.id === "net-liquidity")!, asOf),
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
      stale: staleNow.get("m2-growth") ?? false,
      lastDate: lastAt(COMPONENTS.find((c) => c.id === "m2-growth")!, asOf),
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
        "10년-2년 금리차 (선행성은 이 사이트에서 통계적으로 확인되지 않음)",
      category: "macro",
      inverted: false,
      stale: staleNow.get("t10y2y") ?? false,
      lastDate: lastAt(COMPONENTS.find((c) => c.id === "t10y2y")!, asOf),
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
        "경기 낙관(구리) vs 비관(금) 비율 (선행성은 이 사이트에서 통계적으로 확인되지 않음)",
      category: "macro",
      inverted: false,
      stale: staleNow.get("copper-gold") ?? false,
      lastDate: lastAt(COMPONENTS.find((c) => c.id === "copper-gold")!, asOf),
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
        "은행간 자금 경색 지표 (2022년 1월 갱신 중단)",
      category: "market",
      inverted: true,
      stale: staleNow.get("ted-spread") ?? false,
      lastDate: lastAt(COMPONENTS.find((c) => c.id === "ted-spread")!, asOf),
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
        "시카고 연준 금융상황지수 (선행성은 이 사이트에서 통계적으로 확인되지 않음)",
      category: "market",
      inverted: true,
      stale: staleNow.get("nfci") ?? false,
      lastDate: lastAt(COMPONENTS.find((c) => c.id === "nfci")!, asOf),
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
    componentsTotal: COMPONENTS.length,
    componentsUsed: COMPONENTS.length - excluded.length,
    excluded,
    ...liquiditySources(["WALCL", "RRPONTSYD", "WTREGEN", "M2SL", "T10Y2Y", "NFCI", "TEDRATE"]),
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
