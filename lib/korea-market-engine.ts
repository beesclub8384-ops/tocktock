/**
 * 한국 시장 매력도 분석 엔진
 *
 * 데이터 소스:
 *   - 한국 10년물 국채:  FRED 시리즈 IRLTLT01KRM156N (월별, 약간의 시차 있음)
 *   - 종목별 PER/EPS:   yahoo-finance2 (DCF 계산기와 동일 출처)
 *   - 시장 평균 PER:    상위 N개 종목의 시가총액 가중평균(Weighted Harmonic Mean)
 *
 * 켄 피셔의 "이익수익률 vs 채권" 분석법을 한국 시장에 자동 적용.
 * 이익수익률(Earnings Yield) = 1 / PER × 100
 * 스프레드 = 이익수익률 − 비교 대상 수익률
 */

import { redis } from "./redis";
import { isSiteOriginSeries } from "./site-source-config";
import { fetchKoreanStockPrice } from "./kis-client";
import {
  KOSPI_TOP,
  KOSDAQ_TOP,
  SAFETY_FILTER,
  VERDICT_THRESHOLDS,
  CACHE_TTL,
  REDIS_KEYS,
  detectCyclical,
  type KoreaStock,
} from "./data/korea-market-config";

// ── 타입 ──
export type Verdict = "attractive" | "neutral" | "unattractive";

export interface BondYieldResult {
  yieldPct: number;       // 4.3 = 4.3%
  asOfDate: string;       // "2026-03-01"
  source: string;         // "OECD DSD_STES@DF_FINMARK KOR.M.IRLT" 또는 "FRED IRLTLT01KRM156N"
  /** 어디서 받았나 (미션 12) — 화면의 출처 표기·FRED 고지가 이것을 본다. 예전 캐시에는 없음(= fred) */
  origin?: "oecd" | "fred";
  /** OECD 를 못 받아 대신 쓴 경우 그 이유 (화면에 쓰지 않음, 진단용 — 미션 12 배포 확인) */
  fallbackReason?: string;
  fetchedAt: string;
}

export interface StockSnapshot {
  symbol: string;
  resolvedSymbol: string;
  name: string | null;
  industry: string | null;
  market: "kospi" | "kosdaq" | "unknown";
  price: number | null;
  marketCap: number | null;
  eps: number | null;
  pe: number | null;
  earningsYieldPct: number | null;  // 1/PER * 100
  cyclicalLabel: string | null;
  bookValue: number | null;
  pbr: number | null;
}

export interface MarketAvgResult {
  market: "kospi" | "kosdaq";
  weightedPE: number;
  weightedEarningsYieldPct: number;  // 100 / weightedPE
  sampleSize: number;
  totalMarketCap: number;
  asOfDate: string;
}

export interface MarketAttractiveness {
  bond: BondYieldResult;
  kospi: MarketAvgResult & { spreadVsBondPct: number; verdict: Verdict };
  kosdaq: MarketAvgResult & { spreadVsBondPct: number; verdict: Verdict };
  fetchedAt: string;
}

export interface StockAnalysis {
  query: string;
  triedSymbols: string[];
  snapshot: StockSnapshot;
  bond: BondYieldResult;
  marketAvg: MarketAvgResult | null;  // 종목 시장의 평균
  spreadVsBondPct: number | null;
  spreadVsMarketPct: number | null;
  verdictVsBond: Verdict | null;
  verdictVsMarket: Verdict | null;
  notes: string[];
  fetchedAt: string;
}

export interface ScreeningResult {
  market: "kospi" | "kosdaq";
  bond: BondYieldResult;
  marketAvg: MarketAvgResult | null;
  rows: ScreeningRow[];
  filteredOutCount: number;
  fetchedAt: string;
}
export interface ScreeningRow {
  rank: number;
  symbol: string;
  name: string;
  earningsYieldPct: number;
  pe: number;
  spreadVsBondPct: number;
  spreadVsMarketPct: number;
  marketCap: number;
  cyclicalLabel: string | null;
  verdict: Verdict;
}

// ── 유틸 ──
function classifyVerdict(spreadPct: number | null): Verdict | null {
  if (spreadPct == null || !Number.isFinite(spreadPct)) return null;
  if (spreadPct >= VERDICT_THRESHOLDS.attractive) return "attractive";
  if (spreadPct >= VERDICT_THRESHOLDS.neutral) return "neutral";
  return "unattractive";
}

// ── OECD SDMX API: 한국 10년물 (미션 12, 키 없음) ──
// FRED IRLTLT01KRM156N 은 이 OECD 시리즈(Financial market, KOR.M.IRLT, 월평균 %)를 그대로 옮긴 것이다 —
// 2000-10~2026-09 312개월 값이 모두 같음(결정 로그 24-3). 날짜는 FRED 와 같게 달 첫날("2026-09-01")로 둔다.
const OECD_KOR_LT_URL =
  "https://sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_STES@DF_FINMARK,/KOR.M.IRLT.PA.....";

async function fetchKoreanBondYieldOecd(): Promise<BondYieldResult> {
  const start = new Date();
  start.setUTCMonth(start.getUTCMonth() - 24);
  const startPeriod = start.toISOString().slice(0, 7);
  const r = await fetch(`${OECD_KOR_LT_URL}?startPeriod=${startPeriod}`, {
    headers: { Accept: "application/vnd.sdmx.data+csv; charset=utf-8", "User-Agent": "TockTock/1.0 (https://tocktock.vercel.app)" },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`OECD fetch failed: ${r.status} ${(await r.text().catch(() => "")).slice(0, 160)}`);
  const lines = (await r.text()).trim().split(/\r?\n/);
  const head = lines[0].split(",");
  const iT = head.indexOf("TIME_PERIOD");
  const iV = head.indexOf("OBS_VALUE");
  if (iT < 0 || iV < 0) throw new Error("OECD CSV: TIME_PERIOD/OBS_VALUE 열이 없습니다");
  const rows = lines
    .slice(1)
    .map((l) => l.split(","))
    .filter((c) => /^\d{4}-\d{2}$/.test(c[iT]) && c[iV] !== "" && Number.isFinite(parseFloat(c[iV])))
    .sort((a, b) => (a[iT] < b[iT] ? 1 : -1));
  if (rows.length === 0) throw new Error("OECD returned no usable observation");
  return {
    yieldPct: parseFloat(rows[0][iV]),
    asOfDate: `${rows[0][iT]}-01`,
    source: "OECD Financial market (DSD_STES@DF_FINMARK) KOR.M.IRLT — Long-term interest rates, monthly",
    origin: "oecd",
    fetchedAt: new Date().toISOString(),
  };
}

// ── 한국 10년물: 기본은 OECD 원출처, SITE_DATA_SOURCE=fred 면 FRED (lib/site-source-config.ts) ──
export async function fetchKoreanBondYield(): Promise<BondYieldResult> {
  const cached = await redis.get<BondYieldResult>(REDIS_KEYS.bondYield);
  if (cached && cached.yieldPct != null) return cached;

  if (isSiteOriginSeries("IRLTLT01KRM156N")) {
    // OECD API 는 가끔 500 을 돌려준다(미션 12 시험 중 1회) — 한 번 다시 시도하고, 그래도 실패하면 마지막으로 받은 값을
    // 그 기준월 그대로 쓴다(기한 없는 키). 마지막 값도 없으면 에러를 던진다
    let result: BondYieldResult;
    try {
      result = await fetchKoreanBondYieldOecd().catch(async () => {
        await new Promise((res) => setTimeout(res, 1500));
        return fetchKoreanBondYieldOecd();
      });
    } catch (e) {
      // 조용히 넘어가지 않게 로그를 남기고, 장애 동안 요청마다 OECD 를 다시 두드리지 않게 마지막 값을 1시간만 캐시한다
      // (미션 12 독립 검증 지적 3). 화면에는 그 값의 기준월이 그대로 나온다
      console.error("korea-market: OECD 한국 10년물 수집 실패 — 마지막 값 또는 FRED 사용", e);
      const reason = e instanceof Error ? e.message : String(e);
      const last = await redis.get<BondYieldResult>(REDIS_KEYS.bondYieldLastGood);
      if (last && last.yieldPct != null) {
        await redis.set(REDIS_KEYS.bondYield, { ...last, fallbackReason: reason }, { ex: 3600 });
        return { ...last, fallbackReason: reason };
      }
      // 마지막 OECD 값도 없으면 예전처럼 FRED 로 받는다(origin "fred" → 화면이 FRED 고지를 띄움). 1시간 뒤 OECD 를 다시 시도.
      // 배포 확인 때 Vercel 서버에서 OECD 가 계속 500 을 돌려줘서 넣은 안전장치 (로컬에서는 200)
      const fred = { ...(await fetchKoreanBondYieldFred()), fallbackReason: reason };
      await redis.set(REDIS_KEYS.bondYield, fred, { ex: 3600 });
      return fred;
    }
    await redis.set(REDIS_KEYS.bondYield, result, { ex: CACHE_TTL.bondYield });
    await redis.set(REDIS_KEYS.bondYieldLastGood, result);
    return result;
  }

  const result = await fetchKoreanBondYieldFred();
  await redis.set(REDIS_KEYS.bondYield, result, { ex: CACHE_TTL.bondYield });
  return result;
}

// ── FRED: 한국 10년물 (SITE_DATA_SOURCE=fred 이거나 OECD 를 못 받았을 때) ──
async function fetchKoreanBondYieldFred(): Promise<BondYieldResult> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error("FRED_API_KEY not set");

  // IRLTLT01KRM156N: Long-Term Government Bond Yields: 10-year: Korea (Monthly, %)
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=IRLTLT01KRM156N&api_key=${apiKey}&file_type=json&sort_order=desc&limit=12`;
  const r = await fetch(url, { next: { revalidate: 86400 } });
  if (!r.ok) throw new Error(`FRED fetch failed: ${r.status}`);
  const j = (await r.json()) as { observations?: { date: string; value: string }[] };
  const obs = (j.observations ?? []).find((o) => o.value !== "." && !Number.isNaN(parseFloat(o.value)));
  if (!obs) throw new Error("FRED returned no usable observation");

  const result: BondYieldResult = {
    yieldPct: parseFloat(obs.value),
    asOfDate: obs.date,
    source: "FRED IRLTLT01KRM156N (Long-term gov bond yield Korea, monthly)",
    origin: "fred",
    fetchedAt: new Date().toISOString(),
  };
  return result;
}

// ── 종목 스냅샷 (KIS REST API 사용) ──
// yahoo-finance2는 한국 주식의 PER/EPS를 거의 안 줌 → KIS API로 직접 조회.
async function fetchStockSnapshot(symbol: string, displayName?: string): Promise<StockSnapshot | null> {
  try {
    const code = symbol.replace(/\.[A-Z]{2,3}$/, "");
    const info = await fetchKoreanStockPrice(code);
    if (!info) return null;

    const market: "kospi" | "kosdaq" | "unknown" = symbol.endsWith(".KS")
      ? "kospi"
      : symbol.endsWith(".KQ")
      ? "kosdaq"
      : "unknown";
    const earningsYieldPct = info.per != null && info.per > 0 ? (1 / info.per) * 100 : null;
    const name = displayName ?? info.industryName;
    const cyclicalLabel = detectCyclical(symbol, name, info.industryName);

    return {
      symbol,
      resolvedSymbol: symbol,
      name,
      industry: info.industryName,
      market,
      price: info.price,
      marketCap: info.marketCapKRW,
      eps: info.eps,
      pe: info.per,
      earningsYieldPct,
      cyclicalLabel,
      bookValue: info.bps,
      pbr: info.pbr,
    };
  } catch {
    return null;
  }
}

async function fetchWithFallback(candidates: string[], displayName?: string): Promise<StockSnapshot | null> {
  // 한국 종목은 .KS/.KQ 모두 KIS에서 같은 6자리 코드로 조회되므로 첫 후보만 시도
  for (const sym of candidates) {
    const snap = await fetchStockSnapshot(sym, displayName);
    if (snap) return snap;
  }
  return null;
}

export function buildKoreaCandidateSymbols(rawInput: string): string[] {
  const t = rawInput.trim().toUpperCase();
  if (!t) return [];
  if (/\.[A-Z]{2,3}$/.test(t)) {
    if (t.endsWith(".KS")) return [t, t.replace(".KS", ".KQ")];
    if (t.endsWith(".KQ")) return [t, t.replace(".KQ", ".KS")];
    return [t];
  }
  if (/^\d{6}$/.test(t)) return [`${t}.KS`, `${t}.KQ`];
  return [t];
}

// ── 시장 평균 PER (시총 가중조화평균) ──
// 가중평균 PER을 마켓 캡 가중으로 정확히 계산하려면 시총합/이익합 (∑MC / ∑E) 형태가 맞음
// 즉 market PE = ∑(price × shares) / ∑(EPS × shares) = ∑MC / ∑(MC/PE)
async function computeMarketAverage(
  market: "kospi" | "kosdaq",
  list: KoreaStock[],
): Promise<MarketAvgResult | null> {
  const cached = await redis.get<MarketAvgResult>(REDIS_KEYS.marketAvg(market));
  if (cached && cached.weightedPE > 0) return cached;

  const snaps = await Promise.all(list.map((s) => fetchStockSnapshot(s.symbol, s.name)));
  let mcSum = 0;
  let mcOverPeSum = 0;
  let count = 0;
  for (const snap of snaps) {
    if (!snap) continue;
    if (snap.eps == null || snap.eps <= 0) continue;     // 적자 제외
    if (snap.pe == null || snap.pe < SAFETY_FILTER.minReasonablePE || snap.pe > SAFETY_FILTER.maxReasonablePE) continue;
    if (snap.marketCap == null || snap.marketCap < SAFETY_FILTER.minMarketCapKRW) continue;
    mcSum += snap.marketCap;
    mcOverPeSum += snap.marketCap / snap.pe;             // = ∑(EPS × shares) (영업이익 비례)
    count++;
  }
  if (count === 0 || mcOverPeSum <= 0) return null;
  const weightedPE = mcSum / mcOverPeSum;
  const weightedEarningsYieldPct = (1 / weightedPE) * 100;

  const result: MarketAvgResult = {
    market,
    weightedPE: Math.round(weightedPE * 100) / 100,
    weightedEarningsYieldPct: Math.round(weightedEarningsYieldPct * 100) / 100,
    sampleSize: count,
    totalMarketCap: mcSum,
    asOfDate: new Date().toISOString().slice(0, 10),
  };
  await redis.set(REDIS_KEYS.marketAvg(market), result, { ex: CACHE_TTL.marketAvg });
  return result;
}

// ── 공개 API ──
export async function getMarketAttractiveness(): Promise<MarketAttractiveness> {
  const [bond, kospiAvg, kosdaqAvg] = await Promise.all([
    fetchKoreanBondYield(),
    computeMarketAverage("kospi", KOSPI_TOP),
    computeMarketAverage("kosdaq", KOSDAQ_TOP),
  ]);
  if (!kospiAvg || !kosdaqAvg) {
    throw new Error("시장 평균 PER 계산 실패");
  }
  const kospiSpread = kospiAvg.weightedEarningsYieldPct - bond.yieldPct;
  const kosdaqSpread = kosdaqAvg.weightedEarningsYieldPct - bond.yieldPct;
  return {
    bond,
    kospi: { ...kospiAvg, spreadVsBondPct: Math.round(kospiSpread * 100) / 100, verdict: classifyVerdict(kospiSpread) ?? "neutral" },
    kosdaq: { ...kosdaqAvg, spreadVsBondPct: Math.round(kosdaqSpread * 100) / 100, verdict: classifyVerdict(kosdaqSpread) ?? "neutral" },
    fetchedAt: new Date().toISOString(),
  };
}

export async function analyzeStock(rawInput: string): Promise<StockAnalysis | { error: string; tried: string[] }> {
  const candidates = buildKoreaCandidateSymbols(rawInput);
  if (candidates.length === 0) return { error: "심볼이 비어있습니다", tried: [] };

  const cacheKey = REDIS_KEYS.stock(rawInput);
  const cached = await redis.get<StockAnalysis>(cacheKey);
  if (cached) return cached;

  // 정적 리스트에서 회사명 lookup (KIS는 산업명만 주므로)
  const code6 = rawInput.replace(/\.[A-Z]{2,3}$/, "").trim();
  const lookup = [...KOSPI_TOP, ...KOSDAQ_TOP].find((s) => s.symbol.startsWith(code6));
  const displayName = lookup?.name;

  const snap = await fetchWithFallback(candidates, displayName);
  if (!snap) return { error: "종목 데이터를 찾지 못했습니다", tried: candidates };

  const bond = await fetchKoreanBondYield();
  let marketAvg: MarketAvgResult | null = null;
  if (snap.market === "kospi") marketAvg = await computeMarketAverage("kospi", KOSPI_TOP);
  else if (snap.market === "kosdaq") marketAvg = await computeMarketAverage("kosdaq", KOSDAQ_TOP);

  const notes: string[] = [];
  let spreadVsBond: number | null = null;
  let spreadVsMarket: number | null = null;
  if (snap.eps == null || snap.eps <= 0) {
    notes.push("⚠️ 적자 또는 EPS 데이터 없음 — 이익수익률 계산 불가, 켄 피셔식 비교 부적합");
  } else if (snap.earningsYieldPct == null) {
    notes.push("⚠️ PER 데이터 없음");
  } else {
    spreadVsBond = snap.earningsYieldPct - bond.yieldPct;
    if (marketAvg) spreadVsMarket = snap.earningsYieldPct - marketAvg.weightedEarningsYieldPct;
  }
  if (snap.cyclicalLabel) notes.push(`⚠️ ${snap.cyclicalLabel} 등 사이클 산업 — PER만으로 판단 위험`);
  if (snap.pe != null && snap.pe > 50) notes.push(`PER ${snap.pe.toFixed(0)}배로 매우 높음 — 성장주 성격`);
  if (snap.marketCap != null && snap.marketCap < SAFETY_FILTER.minMarketCapKRW) notes.push("시가총액 1,000억 미만 — 데이터 신뢰도 낮음");

  const result: StockAnalysis = {
    query: rawInput,
    triedSymbols: candidates,
    snapshot: snap,
    bond,
    marketAvg,
    spreadVsBondPct: spreadVsBond != null ? Math.round(spreadVsBond * 100) / 100 : null,
    spreadVsMarketPct: spreadVsMarket != null ? Math.round(spreadVsMarket * 100) / 100 : null,
    verdictVsBond: classifyVerdict(spreadVsBond),
    verdictVsMarket: classifyVerdict(spreadVsMarket),
    notes,
    fetchedAt: new Date().toISOString(),
  };

  await redis.set(cacheKey, result, { ex: CACHE_TTL.stock });
  return result;
}

// ── 스크리닝 ──
export async function screenTopStocks(market: "kospi" | "kosdaq", top = 10): Promise<ScreeningResult> {
  const cached = await redis.get<ScreeningResult>(REDIS_KEYS.screening(market));
  if (cached && cached.rows.length > 0) {
    // top 변경에도 캐시 활용: 잘라쓰기
    return { ...cached, rows: cached.rows.slice(0, top) };
  }

  const list = market === "kospi" ? KOSPI_TOP : KOSDAQ_TOP;
  const [bond, marketAvg, snaps] = await Promise.all([
    fetchKoreanBondYield(),
    computeMarketAverage(market, list),
    Promise.all(list.map((s) => fetchStockSnapshot(s.symbol, s.name).then((snap) => ({ snap, name: s.name })))),
  ]);

  const candidates: { name: string; snap: StockSnapshot }[] = [];
  let filteredOut = 0;
  for (const item of snaps) {
    if (!item.snap) { filteredOut++; continue; }
    const s = item.snap;
    // 안전 필터
    if (SAFETY_FILTER.minPositiveEpsRequired && (s.eps == null || s.eps <= 0)) { filteredOut++; continue; }
    if (s.pe == null || s.pe < SAFETY_FILTER.minReasonablePE || s.pe > SAFETY_FILTER.maxReasonablePE) { filteredOut++; continue; }
    if (s.marketCap == null || s.marketCap < SAFETY_FILTER.minMarketCapKRW) { filteredOut++; continue; }
    if (s.earningsYieldPct == null) { filteredOut++; continue; }
    candidates.push({ name: item.name, snap: s });
  }

  // 이익수익률 내림차순 정렬
  candidates.sort((a, b) => (b.snap.earningsYieldPct ?? 0) - (a.snap.earningsYieldPct ?? 0));

  const rows: ScreeningRow[] = candidates.map((c, i) => {
    const sBond = c.snap.earningsYieldPct! - bond.yieldPct;
    const sMarket = marketAvg ? c.snap.earningsYieldPct! - marketAvg.weightedEarningsYieldPct : 0;
    return {
      rank: i + 1,
      symbol: c.snap.resolvedSymbol,
      name: c.name,
      earningsYieldPct: Math.round(c.snap.earningsYieldPct! * 100) / 100,
      pe: Math.round(c.snap.pe! * 100) / 100,
      spreadVsBondPct: Math.round(sBond * 100) / 100,
      spreadVsMarketPct: Math.round(sMarket * 100) / 100,
      marketCap: c.snap.marketCap!,
      cyclicalLabel: c.snap.cyclicalLabel,
      verdict: classifyVerdict(sBond) ?? "neutral",
    };
  });

  const result: ScreeningResult = {
    market,
    bond,
    marketAvg,
    rows,  // 캐시엔 전체 저장 (top 슬라이스는 사용 시 적용)
    filteredOutCount: filteredOut,
    fetchedAt: new Date().toISOString(),
  };
  await redis.set(REDIS_KEYS.screening(market), result, { ex: CACHE_TTL.screening });
  return { ...result, rows: rows.slice(0, top) };
}
