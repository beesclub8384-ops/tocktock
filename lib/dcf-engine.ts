/**
 * DCF 엔진
 * scripts/dcf-trial.mjs의 검증된 로직을 그대로 이식 (TS).
 *
 * 핵심 정책:
 * - 시작 FCF 우선순위: 시계열 최근 3년 양수 평균 → TTM → 시계열 최신
 * - D등급은 적정가 비공개 (UI에서 처리)
 * - 베타 구간별 시장 위험 프리미엄 차등화
 * - 빅테크 화이트리스트 영구성장률 3.5%
 */

import YahooFinance from "yahoo-finance2";
import {
  DCF_ASSUMPTIONS,
  mrpForBeta,
  mrpBucketLabel,
  findBigTech,
  type BigTechEntry,
} from "./data/dcf-config";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

// ── 타입 ──
export type Grade = "A" | "B" | "C" | "D";

export interface AnnualPoint {
  year: number;
  revenue: number | null;
  operatingCF: number | null;
  capex: number | null;
  fcf: number | null;
  ebit: number | null;
  netIncome: number | null;
}

export interface SeriesResult {
  source: string;
  series: AnnualPoint[];
}

export interface DCFRunInput {
  startFcf: number | null;
  growthRate: number;
  perpetualGrowth: number;
  discountRate: number;
  years: number;
  sharesOutstanding: number | null;
}

export interface DCFRunResult {
  ok: boolean;
  reason?: string;
  projected?: { year: number; fcf: number; pv: number }[];
  pvSum?: number;
  terminalValue?: number;
  pvTerminal?: number;
  enterpriseValue?: number;
  fairPerShare?: number | null;
}

export interface SensitivityCell {
  growthRate: number;
  discountRate: number;
  fairPerShare: number | null;
}

export interface DCFAnalysis {
  query: string;
  resolvedSymbol: string;
  triedSymbols: string[];
  data: {
    name: string | null;
    longName: string | null;
    industry: string | null;
    currency: string;
    price: number | null;
    marketCap: number | null;
    sharesOutstanding: number | null;
    beta: number | null;
    pe: number | null;
    roe: number | null;
    employees: number | null;
    totalDebt: number | null;
    totalCash: number | null;
    ttmFcf: number | null;
    ttmOcf: number | null;
  };
  series: AnnualPoint[];
  seriesSource: string;
  growth: {
    avgGrowth: number | null;
    sdGrowth: number | null;
    growthRates: number[];
  };
  grade: Grade;
  reasons: string[];
  reasonDetail: string;
  industryContext: string | null;
  bigTech: BigTechEntry | null;
  assumptions: {
    growthAssumption: number;
    growthSource: string;
    perpetualGrowth: number;
    perpetualSource: string;
    discountRate: number;
    discountSource: string;
    mrp: number;
    mrpLabel: string;
    startFcf: number | null;
    startFcfSource: string;
  };
  dcf: DCFRunResult | null;
  sensitivity: SensitivityCell[];
}

// ── 유틸 ──
function mean(arr: number[]): number | null {
  if (!arr.length) return null;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}
function stdev(arr: number[]): number | null {
  if (arr.length < 2) return null;
  const m = arr.reduce((s, x) => s + x, 0) / arr.length;
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v);
}
function fmtPct(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`;
}
function fmtMoneyRoughKR(v: number | null | undefined): string {
  if (v == null) return "N/A";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}조원`;
  if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(0)}억원`;
  return `${sign}${abs.toLocaleString("en-US")}원`;
}
function fmtMoneyRoughUSD(v: number | null | undefined): string {
  if (v == null) return "N/A";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
function fmtMoney(v: number | null | undefined, currency: string): string {
  return currency === "KRW" ? fmtMoneyRoughKR(v) : fmtMoneyRoughUSD(v);
}

// ── 데이터 수집 ──
interface FetchedData {
  fundamentals: unknown[] | null;
  summary: Record<string, unknown> | null;
  quote: Record<string, unknown> | null;
}

async function fetchSymbolData(symbol: string): Promise<FetchedData> {
  const tenYearsAgo = new Date();
  tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);

  const [fundamentals, summary, quote] = await Promise.allSettled([
    yf.fundamentalsTimeSeries(
      symbol,
      { period1: tenYearsAgo, type: "annual", module: "all" },
      { validateResult: false }
    ),
    yf.quoteSummary(
      symbol,
      {
        modules: [
          "price",
          "summaryDetail",
          "defaultKeyStatistics",
          "financialData",
          "assetProfile",
        ],
      },
      { validateResult: false }
    ),
    yf.quote(symbol, {}, { validateResult: false }),
  ]);

  return {
    fundamentals:
      fundamentals.status === "fulfilled"
        ? (fundamentals.value as unknown[])
        : null,
    summary:
      summary.status === "fulfilled"
        ? (summary.value as Record<string, unknown>)
        : null,
    quote:
      quote.status === "fulfilled"
        ? (quote.value as Record<string, unknown>)
        : null,
  };
}

// 후보 심볼 중 가장 풍부한 데이터를 가진 응답 채택
async function fetchWithFallback(
  candidates: string[]
): Promise<{ resolvedSymbol: string; data: FetchedData; tried: string[] } | null> {
  const tried: string[] = [];
  let best: { score: number; resolvedSymbol: string; data: FetchedData } | null = null;

  for (const sym of candidates) {
    tried.push(sym);
    try {
      const data = await fetchSymbolData(sym);
      const fundamentalsArr = data.fundamentals as Array<Record<string, unknown>> | null;
      const annualCount =
        fundamentalsArr
          ?.filter(
            (d) =>
              d.periodType === "12M" &&
              d.date != null &&
              new Date(d.date as string | number).getFullYear() > 2000
          )
          .filter(
            (d) =>
              d.totalRevenue != null ||
              d.operatingCashFlow != null ||
              d.freeCashFlow != null
          ).length ?? 0;

      const summary = (data.summary ?? {}) as Record<string, Record<string, unknown> | undefined>;
      const summaryRichness =
        (summary.price?.marketCap ? 5 : 0) +
        (summary.defaultKeyStatistics?.sharesOutstanding ? 5 : 0) +
        (summary.summaryDetail?.beta ? 2 : 0) +
        (summary.financialData?.freeCashflow ? 3 : 0) +
        (summary.assetProfile?.fullTimeEmployees ? 1 : 0);

      const quote = (data.quote ?? {}) as Record<string, unknown>;
      const score =
        annualCount * 10 +
        summaryRichness +
        (quote.regularMarketPrice ? 1 : 0);

      if (!best || score > best.score) {
        best = { score, resolvedSymbol: sym, data };
      }
    } catch {
      // 다음 후보로
    }
  }
  if (!best || best.score <= 0) return null;
  return { resolvedSymbol: best.resolvedSymbol, data: best.data, tried };
}

// ── 시계열 변환 ──
export function buildAnnualSeries(fundamentals: unknown[] | null): SeriesResult {
  const annual = ((fundamentals ?? []) as Array<Record<string, unknown>>)
    .filter(
      (d) =>
        d.periodType === "12M" &&
        d.date != null &&
        new Date(d.date as string | number).getFullYear() > 2000
    )
    .filter(
      (d) =>
        d.totalRevenue != null ||
        d.operatingCashFlow != null ||
        d.freeCashFlow != null ||
        d.netIncome != null
    )
    .sort(
      (a, b) =>
        new Date(a.date as string | number).getTime() -
        new Date(b.date as string | number).getTime()
    );

  if (annual.length === 0) return { source: "none", series: [] };

  const series = annual.map((d): AnnualPoint => {
    const operatingCF = (d.operatingCashFlow as number | undefined) ?? null;
    const capex = (d.capitalExpenditure as number | undefined) ?? null;
    let fcf = (d.freeCashFlow as number | undefined) ?? null;
    if (fcf == null && operatingCF != null && capex != null) {
      fcf = operatingCF + capex;
    }
    return {
      year: new Date(d.date as string | number).getFullYear(),
      revenue: (d.totalRevenue as number | undefined) ?? null,
      operatingCF,
      capex,
      fcf,
      ebit: (d.operatingIncome as number | undefined) ?? null,
      netIncome: (d.netIncome as number | undefined) ?? null,
    };
  });
  return { source: "fundamentalsTimeSeries", series };
}

// ── 적합도 등급 판정 ──
// D등급일 때 사용자 이해를 돕는 산업 컨텍스트 메시지를 함께 반환.
// 4분기 분류:
//   A. 매출 성장 ≥20% + 양수FCF<50%   → 사이클/대규모투자기
//   B. 매출 성장 <10% + 양수FCF<50%   → 구조조정/침체
//   C. 직전 대비 매출 -10% 이상       → 매출 감소 추세
//   D. 그 외                          → 일반
function classifyDContext(
  positivePct: number,
  avgGrowth: number | null,
  revenues: number[]
): string | null {
  // C 조건: 직전→현재 매출 감소가 가장 강한 신호이므로 우선 검사
  if (revenues.length >= 2) {
    const last = revenues[revenues.length - 1];
    const prev = revenues[revenues.length - 2];
    if (prev > 0 && last < prev * 0.9) {
      return "💡 매출이 감소 추세입니다. 사업 전망 자체에 의문이 있을 수 있어 DCF보다는 자산가치 또는 청산가치로 접근 권장.";
    }
  }
  // A 조건: 매출 폭증 + 현금흐름 부진 (사이클)
  if (avgGrowth != null && avgGrowth > 0.2 && positivePct < 0.5) {
    return "💡 매출은 빠르게 늘고 있지만 현금흐름이 아직 부진합니다. 조선·해운·건설·전력 같은 사이클 산업 또는 대규모 투자 단계에서 자주 보이는 패턴으로, 수년 후 흑자 전환이 누적되면 재평가 필요.";
  }
  // B 조건: 매출 정체 + 현금흐름 부진 (구조조정/침체)
  if (avgGrowth != null && avgGrowth < 0.1 && positivePct < 0.5) {
    return "💡 매출 정체와 현금흐름 부진이 동반됩니다. 구조조정 진행 중이거나 산업 침체기일 수 있어, 다른 평가법(PBR, 자산가치) 권장.";
  }
  // D 조건: 그 외 일반
  return "💡 양수 FCF 데이터가 부족해 DCF 신뢰도가 낮습니다. 다른 평가법(PBR, EV/Sales)을 함께 보세요.";
}

function judgeGrade(
  series: AnnualPoint[],
  pe: number | null,
  revenues: number[]
): { grade: Grade; reasons: string[]; reasonDetail: string; industryContext: string | null } {
  const reasons: string[] = [];
  const fcfYears = series.filter((s) => s.fcf != null);
  const positiveFcf = fcfYears.filter((s) => (s.fcf as number) > 0).length;
  const totalFcfYears = fcfYears.length;
  const lastFcf = fcfYears.at(-1)?.fcf ?? null;

  const growthRates: number[] = [];
  for (let i = 1; i < revenues.length; i++) {
    if (revenues[i - 1] !== 0) {
      growthRates.push(
        (revenues[i] - revenues[i - 1]) / Math.abs(revenues[i - 1])
      );
    }
  }
  const sd = stdev(growthRates);

  let grade: Grade = "B";
  if (totalFcfYears === 0) {
    grade = "D";
    reasons.push("FCF 데이터 없음");
  } else if (lastFcf != null && lastFcf < 0) {
    grade = "D";
    reasons.push("최근 연도 FCF 음수");
  } else if (
    positiveFcf < Math.max(2, Math.floor(totalFcfYears * 0.6))
  ) {
    grade = "D";
    reasons.push(`${totalFcfYears}년 중 ${positiveFcf}년만 양의 FCF`);
  } else if (totalFcfYears < 3) {
    grade = "D";
    reasons.push(`데이터 ${totalFcfYears}년 (3년 미만)`);
  } else if (
    positiveFcf === totalFcfYears &&
    totalFcfYears >= 4 &&
    sd != null &&
    sd < 0.2
  ) {
    grade = "A";
    reasons.push(`${totalFcfYears}년 연속 양의 FCF`);
    reasons.push(`매출 성장률 표준편차 ${fmtPct(sd)}로 안정적`);
  } else if (positiveFcf >= totalFcfYears - 1 && totalFcfYears >= 3) {
    grade = "B";
    reasons.push(`${totalFcfYears}년 중 ${positiveFcf}년 양의 FCF`);
  } else {
    grade = "C";
    reasons.push(`FCF 변동 큼 (${totalFcfYears}년 중 ${positiveFcf}년 양수)`);
    if (pe != null && pe > 50) reasons.push(`PER ${pe.toFixed(0)}배로 성장주 성격`);
  }

  // D등급 사유 강화: 매출 추이도 함께
  let reasonDetail = reasons.join(" / ");
  if (grade === "D" && revenues.length >= 3) {
    const tail = revenues.slice(-Math.min(4, revenues.length));
    const trend = tail.map((r) => {
      if (r >= 1e12) return `${(r / 1e12).toFixed(1)}조`;
      if (r >= 1e8) return `${(r / 1e8).toFixed(0)}억`;
      if (r >= 1e9) return `${(r / 1e9).toFixed(1)}B`;
      return `${(r / 1e6).toFixed(0)}M`;
    }).join("→");
    reasonDetail += ` / 매출 추이: ${trend}`;
  }

  let industryContext: string | null = null;
  if (grade === "D") {
    const positivePct = totalFcfYears > 0 ? positiveFcf / totalFcfYears : 0;
    const avgGrowth = mean(growthRates);
    industryContext = classifyDContext(positivePct, avgGrowth, revenues);
  }

  return { grade, reasons, reasonDetail, industryContext };
}

// ── DCF 계산 ──
export function runDCF(input: DCFRunInput): DCFRunResult {
  const { startFcf, growthRate, perpetualGrowth, discountRate, years, sharesOutstanding } = input;
  if (startFcf == null || startFcf <= 0) {
    return { ok: false, reason: "시작 FCF가 양수가 아님" };
  }
  if (discountRate <= perpetualGrowth) {
    return {
      ok: false,
      reason: `할인율(${fmtPct(discountRate)})이 영구성장률(${fmtPct(perpetualGrowth)}) 이하`,
    };
  }
  const projected: { year: number; fcf: number; pv: number }[] = [];
  let pvSum = 0;
  let lastFcf = startFcf;
  for (let t = 1; t <= years; t++) {
    lastFcf = lastFcf * (1 + growthRate);
    const pv = lastFcf / Math.pow(1 + discountRate, t);
    projected.push({ year: t, fcf: lastFcf, pv });
    pvSum += pv;
  }
  const terminalValue = (lastFcf * (1 + perpetualGrowth)) / (discountRate - perpetualGrowth);
  const pvTerminal = terminalValue / Math.pow(1 + discountRate, years);
  const enterpriseValue = pvSum + pvTerminal;
  const fairPerShare = sharesOutstanding ? enterpriseValue / sharesOutstanding : null;
  return {
    ok: true,
    projected,
    pvSum,
    terminalValue,
    pvTerminal,
    enterpriseValue,
    fairPerShare,
  };
}

// ── 메인: 종목 1개 분석 ──
export async function analyzeSymbol(
  query: string,
  candidateSymbols: string[]
): Promise<DCFAnalysis | { error: string; tried: string[] }> {
  const fetched = await fetchWithFallback(candidateSymbols);
  if (!fetched) {
    return { error: "데이터를 찾을 수 없습니다.", tried: candidateSymbols };
  }
  const { resolvedSymbol, data, tried } = fetched;

  const summary = (data.summary ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const quote = (data.quote ?? {}) as Record<string, unknown>;

  const { source: seriesSource, series } = buildAnnualSeries(data.fundamentals);

  const price =
    (quote.regularMarketPrice as number | undefined) ??
    (summary.price?.regularMarketPrice as number | undefined) ??
    null;
  const marketCap =
    (quote.marketCap as number | undefined) ??
    (summary.price?.marketCap as number | undefined) ??
    (summary.summaryDetail?.marketCap as number | undefined) ??
    null;
  const sharesOutstanding =
    (summary.defaultKeyStatistics?.sharesOutstanding as number | undefined) ??
    (summary.price?.sharesOutstanding as number | undefined) ??
    (quote.sharesOutstanding as number | undefined) ??
    (price != null && marketCap != null ? marketCap / price : null);
  const beta =
    (summary.summaryDetail?.beta as number | undefined) ??
    (summary.defaultKeyStatistics?.beta as number | undefined) ??
    null;
  const pe =
    (summary.summaryDetail?.trailingPE as number | undefined) ??
    (quote.trailingPE as number | undefined) ??
    null;
  const roe = (summary.financialData?.returnOnEquity as number | undefined) ?? null;
  const employees = (summary.assetProfile?.fullTimeEmployees as number | undefined) ?? null;
  const totalDebt = (summary.financialData?.totalDebt as number | undefined) ?? null;
  const totalCash = (summary.financialData?.totalCash as number | undefined) ?? null;
  const ttmFcf = (summary.financialData?.freeCashflow as number | undefined) ?? null;
  const ttmOcf = (summary.financialData?.operatingCashflow as number | undefined) ?? null;
  const currency = (quote.currency as string | undefined) ?? (resolvedSymbol.match(/\.(KS|KQ)$/) ? "KRW" : "USD");
  const name =
    (quote.shortName as string | undefined) ??
    (summary.price?.shortName as string | undefined) ??
    null;
  const longName =
    (quote.longName as string | undefined) ??
    (summary.price?.longName as string | undefined) ??
    null;
  const industry = (summary.assetProfile?.industry as string | undefined) ?? null;

  // 매출 성장률
  const revenues = series.filter((s) => s.revenue != null).map((s) => s.revenue as number);
  const growthRates: number[] = [];
  for (let i = 1; i < revenues.length; i++) {
    if (revenues[i - 1] !== 0) {
      growthRates.push((revenues[i] - revenues[i - 1]) / Math.abs(revenues[i - 1]));
    }
  }
  const avgGrowth = mean(growthRates);
  const sdGrowth = stdev(growthRates);

  // 등급
  const verdict = judgeGrade(series, pe, revenues);

  // 빅테크 매칭
  const bigTech = findBigTech([resolvedSymbol, ...candidateSymbols]);

  // 가정 계산
  let growthAssumption: number;
  let growthSource: string;
  if (avgGrowth != null && Number.isFinite(avgGrowth)) {
    growthAssumption = Math.max(-0.2, Math.min(0.5, avgGrowth));
    growthSource =
      Math.abs(avgGrowth - growthAssumption) > 1e-9
        ? `과거 평균 ${fmtPct(avgGrowth)} → 클램프 후 ${fmtPct(growthAssumption)}`
        : `과거 평균 ${fmtPct(avgGrowth)} 적용`;
  } else {
    growthAssumption = DCF_ASSUMPTIONS.fallbackGrowth;
    growthSource = `폴백 ${fmtPct(growthAssumption)} (과거 데이터 부족)`;
  }

  const mrp = mrpForBeta(beta);
  const mrpLabel = mrpBucketLabel(beta);
  let discountRate: number;
  let discountSource: string;
  if (beta != null) {
    discountRate = DCF_ASSUMPTIONS.riskFreeRate + beta * mrp;
    discountSource = `CAPM ${fmtPct(DCF_ASSUMPTIONS.riskFreeRate)} + β${beta.toFixed(2)} × ${fmtPct(mrp)} (${mrpLabel}) = ${fmtPct(discountRate)}`;
  } else {
    discountRate = DCF_ASSUMPTIONS.fallbackDiscount;
    discountSource = `폴백 ${fmtPct(discountRate)} — 한국 코스닥 종목은 베타가 부정확해 9% 가정`;
  }

  const perpetualGrowth = bigTech
    ? DCF_ASSUMPTIONS.perpetualGrowthBigTech
    : DCF_ASSUMPTIONS.perpetualGrowthGeneral;
  const perpetualSource = bigTech
    ? `${fmtPct(perpetualGrowth)} (빅테크/플랫폼 우위: ${bigTech.reason})`
    : `${fmtPct(perpetualGrowth)} (일반)`;

  // 시작 FCF
  let startFcf: number | null = null;
  let startFcfSource = "";
  const recent3 = series.slice(-3);
  const recent3Positive = recent3
    .filter((s) => s.fcf != null && (s.fcf as number) > 0)
    .map((s) => s.fcf as number);
  if (recent3Positive.length > 0) {
    startFcf = mean(recent3Positive);
    const list = recent3
      .map((s) =>
        s.fcf == null
          ? `${s.year}=N/A`
          : `${s.year}=${fmtMoney(s.fcf, currency)}`
      )
      .join(", ");
    startFcfSource = `시계열 최근 3년 양수 평균 [${list}]`;
  } else if (ttmFcf != null && ttmFcf > 0) {
    startFcf = ttmFcf;
    startFcfSource = "Yahoo financialData TTM FCF";
  } else {
    const lastPositive = [...series].reverse().find(
      (s) => s.fcf != null && (s.fcf as number) > 0
    );
    if (lastPositive) {
      startFcf = lastPositive.fcf as number;
      startFcfSource = `시계열 최신 단일 연도 (${lastPositive.year})`;
    }
  }

  // DCF 본 계산 (D등급은 비공개지만 결과 구조는 동일하게 만들어 둠 — UI에서 가림)
  let dcf: DCFRunResult | null = null;
  if (verdict.grade !== "D" && startFcf != null && startFcf > 0) {
    dcf = runDCF({
      startFcf,
      growthRate: growthAssumption,
      perpetualGrowth,
      discountRate,
      years: DCF_ASSUMPTIONS.forecastYears,
      sharesOutstanding,
    });
  }

  // 민감도 표 (D등급 또는 시작 FCF 없으면 빈 배열)
  const sensitivity: SensitivityCell[] = [];
  if (verdict.grade !== "D" && startFcf != null && startFcf > 0 && sharesOutstanding) {
    const grs = [0.05, 0.08, 0.12];
    const drs = [0.07, 0.09, 0.11];
    for (const dr of drs) {
      for (const gr of grs) {
        const r = runDCF({
          startFcf,
          growthRate: gr,
          perpetualGrowth,
          discountRate: dr,
          years: DCF_ASSUMPTIONS.forecastYears,
          sharesOutstanding,
        });
        sensitivity.push({
          growthRate: gr,
          discountRate: dr,
          fairPerShare: r.ok && r.fairPerShare != null ? r.fairPerShare : null,
        });
      }
    }
  }

  return {
    query,
    resolvedSymbol,
    triedSymbols: tried,
    data: {
      name,
      longName,
      industry,
      currency,
      price,
      marketCap,
      sharesOutstanding,
      beta,
      pe,
      roe,
      employees,
      totalDebt,
      totalCash,
      ttmFcf,
      ttmOcf,
    },
    series,
    seriesSource,
    growth: { avgGrowth, sdGrowth, growthRates },
    grade: verdict.grade,
    reasons: verdict.reasons,
    reasonDetail: verdict.reasonDetail,
    industryContext: verdict.industryContext,
    bigTech,
    assumptions: {
      growthAssumption,
      growthSource,
      perpetualGrowth,
      perpetualSource,
      discountRate,
      discountSource,
      mrp,
      mrpLabel,
      startFcf,
      startFcfSource,
    },
    dcf,
    sensitivity,
  };
}

// ── 입력 → 후보 심볼 자동 생성 ──
// 6자리 숫자: KOSPI(.KS) 우선, KOSDAQ(.KQ) 폴백 (또는 반대)
// 일반 영문 티커: 그대로
export function buildCandidateSymbols(rawInput: string): string[] {
  const trimmed = rawInput.trim().toUpperCase();
  if (!trimmed) return [];
  // 이미 .KS/.KQ 등 거래소 접미사 포함
  if (/\.[A-Z]{2,3}$/.test(trimmed)) {
    // 한국 종목이면 양쪽 시도
    if (trimmed.endsWith(".KS")) return [trimmed, trimmed.replace(".KS", ".KQ")];
    if (trimmed.endsWith(".KQ")) return [trimmed, trimmed.replace(".KQ", ".KS")];
    return [trimmed];
  }
  // 6자리 숫자 → 한국 종목
  if (/^\d{6}$/.test(trimmed)) {
    return [`${trimmed}.KS`, `${trimmed}.KQ`];
  }
  // 그 외 영문 티커
  return [trimmed];
}
