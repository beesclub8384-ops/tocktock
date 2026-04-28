/**
 * 투자자 동향 추적 — Provider 추상화 레이어.
 *
 * 데이터 소스 우선순위:
 *   1. Archive (Redis): 매일 새벽 cron이 추적 종목 약 500개에 대해 KIS 데이터를 누적 저장.
 *      시간이 지날수록 30일+ 과거에서도 외국인·기관·개인·거래대금이 표시된다.
 *   2. KIS API (실시간): 최근 약 30거래일. 추적 종목이 아니어도 동작.
 *   3. Naver 스크래핑 (수년치): 30일+ 과거 fallback. 외국인·기관 수량만.
 *
 * KRX OpenAPI는 종목별 투자자 매매 데이터를 제공하지 않음(2026-04 확인).
 * KrxProvider는 영구 미구현 — getProvider()는 무조건 HybridProvider를 반환한다.
 */

import {
  fetchKisInvestorTrend,
  type KisInvestorDailyEntry,
} from "@/lib/kis-client";
import {
  fetchNaverInvestorTrend,
  type NaverInvestorEntry,
} from "@/lib/naver-investor-scraper";
import {
  loadArchiveRange,
  getTrackingMetadata,
  type ArchiveEntry,
} from "@/lib/investor-flow-archive";
import { peekStockUniverse } from "@/lib/stock-universe";
import type {
  CumulativeTotals,
  CumulativeTrend,
  DailyTrend,
  NormalizedTrend,
  ProviderCapabilities,
  TrackingInfo,
} from "@/lib/types/investor-flow";

export interface InvestorFlowProvider {
  readonly capabilities: ProviderCapabilities;
  fetchTrend(
    symbol: string,
    startDate: string,
    endDate: string
  ): Promise<NormalizedTrend>;
}

/* ──────────────────────────────────────────────────────────────
 *  공용 유틸
 * ────────────────────────────────────────────────────────────── */

const ZERO_TOTALS: CumulativeTotals = { shares: 0, value: 0 };

function addTotals(
  acc: CumulativeTotals,
  shares: number | null,
  value: number | null
): CumulativeTotals {
  return {
    shares: shares == null ? acc.shares : (acc.shares ?? 0) + shares,
    value: value == null ? acc.value : (acc.value ?? 0) + value,
  };
}

/** 기간 내 일별 데이터로 누적 합계 계산. capabilities 따라 제공 여부 분기. */
export function buildCumulative(
  daily: DailyTrend[],
  capabilities: ProviderCapabilities
): CumulativeTrend {
  let foreign: CumulativeTotals = { ...ZERO_TOTALS };
  let institution: CumulativeTotals = { ...ZERO_TOTALS };
  let individual: CumulativeTotals | null = capabilities.hasIndividual
    ? { ...ZERO_TOTALS }
    : null;
  let otherCorp: CumulativeTotals | null = capabilities.hasOtherCorp
    ? { ...ZERO_TOTALS }
    : null;

  for (const row of daily) {
    foreign = addTotals(foreign, row.foreign.shares, row.foreign.value);
    institution = addTotals(
      institution,
      row.institution.shares,
      row.institution.value
    );
    if (individual && row.individual) {
      individual = addTotals(
        individual,
        row.individual.shares,
        row.individual.value
      );
    }
    if (otherCorp && row.otherCorp) {
      otherCorp = addTotals(otherCorp, row.otherCorp.shares, row.otherCorp.value);
    }
  }
  if (!capabilities.hasTradingValue) {
    foreign = { ...foreign, value: null };
    institution = { ...institution, value: null };
    if (individual) individual = { ...individual, value: null };
    if (otherCorp) otherCorp = { ...otherCorp, value: null };
  }
  return { foreign, institution, individual, otherCorp };
}

/* ──────────────────────────────────────────────────────────────
 *  HybridProvider — Archive + KIS + Naver 합본
 * ────────────────────────────────────────────────────────────── */

const HYBRID_CAPABILITIES: ProviderCapabilities = {
  hasIndividual: true,
  hasOtherCorp: false,
  hasTradingValue: true,
  maxHistoryDays: 365 * 5,
  providerName: "하이브리드 (자동 누적 + KIS + 네이버)",
  notes: [
    "추적 대상 종목(약 500개)은 매일 새벽 KIS 데이터를 Redis에 누적 저장 — 시간이 지날수록 30일 한계가 사라진다.",
    "최근 약 30거래일은 KIS API로 외국인·기관·개인 + 거래대금까지 실시간 제공.",
    "추적 대상이 아닌 종목의 30일+ 과거는 네이버 금융에서 외국인·기관 수량만 보충 (개인·거래대금 미제공).",
    "표의 '출처' 컬럼으로 어느 소스에서 왔는지 구분.",
  ],
};

function archiveRowToDaily(r: ArchiveEntry): DailyTrend {
  return {
    date: r.date,
    close: r.close,
    foreign: { shares: r.foreignShares, value: r.foreignValue },
    institution: { shares: r.institutionShares, value: r.institutionValue },
    individual: { shares: r.individualShares, value: r.individualValue },
    otherCorp: null,
    source: "archive",
  };
}

function kisRowToDaily(r: KisInvestorDailyEntry): DailyTrend {
  return {
    date: r.date,
    close: r.close,
    foreign: { shares: r.foreignShares, value: r.foreignValue },
    institution: { shares: r.institutionShares, value: r.institutionValue },
    individual: { shares: r.individualShares, value: r.individualValue },
    otherCorp: null,
    source: "kis",
  };
}

function naverRowToDaily(r: NaverInvestorEntry): DailyTrend {
  return {
    date: r.date,
    close: r.close,
    foreign: { shares: r.foreignShares, value: null },
    institution: { shares: r.institutionShares, value: null },
    individual: null,
    otherCorp: null,
    source: "naver",
  };
}

export class HybridProvider implements InvestorFlowProvider {
  readonly capabilities = HYBRID_CAPABILITIES;

  async fetchTrend(
    symbol: string,
    startDate: string,
    endDate: string
  ): Promise<NormalizedTrend> {
    const code = symbol.replace(/\.[A-Z]{2,3}$/, "").trim();

    // 세 소스 병렬 — 어느 하나가 실패해도 나머지는 살린다
    const [archiveRes, kisRes, naverRes] = await Promise.allSettled([
      loadArchiveRange(code, startDate, endDate),
      fetchKisInvestorTrend(code),
      fetchNaverInvestorTrend(code, startDate, endDate),
    ]);

    const archiveRows: ArchiveEntry[] =
      archiveRes.status === "fulfilled" ? archiveRes.value : [];
    const kisRows: KisInvestorDailyEntry[] =
      kisRes.status === "fulfilled" ? kisRes.value : [];
    const naverRows: NaverInvestorEntry[] =
      naverRes.status === "fulfilled" ? naverRes.value : [];

    if (
      archiveRows.length === 0 &&
      kisRows.length === 0 &&
      naverRows.length === 0
    ) {
      const reasons: string[] = [];
      if (archiveRes.status === "rejected") reasons.push(`Archive: ${archiveRes.reason}`);
      if (kisRes.status === "rejected") reasons.push(`KIS: ${kisRes.reason}`);
      if (naverRes.status === "rejected") reasons.push(`Naver: ${naverRes.reason}`);
      throw new Error(
        `투자자 매매 데이터를 가져오지 못했습니다. (${reasons.join(" / ") || "알 수 없는 오류"})`
      );
    }

    /*
     * 병합 우선순위 (각 날짜별로 가장 풍부한 소스 채택):
     *   1. KIS (실시간, 가장 신선) > 2. Archive (KIS 출처지만 과거) > 3. Naver
     */
    const byDate = new Map<string, DailyTrend>();
    for (const r of naverRows) {
      if (r.date < startDate || r.date > endDate) continue;
      byDate.set(r.date, naverRowToDaily(r));
    }
    for (const r of archiveRows) {
      if (r.date < startDate || r.date > endDate) continue;
      byDate.set(r.date, archiveRowToDaily(r));
    }
    for (const r of kisRows) {
      if (r.date < startDate || r.date > endDate) continue;
      byDate.set(r.date, kisRowToDaily(r));
    }

    const daily = Array.from(byDate.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    const cumulative = buildCumulative(daily, HYBRID_CAPABILITIES);

    // 추적 메타데이터 수집 (universe + archive 양쪽 확인)
    const tracking = await collectTracking(code);

    return {
      symbol: code,
      name: null,
      startDate,
      endDate,
      daily,
      cumulative,
      capabilities: HYBRID_CAPABILITIES,
      fetchedAt: new Date().toISOString(),
      tracking,
    };
  }
}

async function collectTracking(symbol: string): Promise<TrackingInfo> {
  // 두 호출은 Redis 단순 GET 한 번씩 — 병렬
  const [universe, meta] = await Promise.all([
    peekStockUniverse(),
    getTrackingMetadata(symbol),
  ]);
  const isTracked = universe.symbols.includes(symbol);
  return {
    isTracked,
    daysTracked: meta.daysTracked,
    firstDate: meta.firstDate,
    lastDate: meta.lastDate,
  };
}

/* ──────────────────────────────────────────────────────────────
 *  KrxProvider — DEPRECATED (KRX OpenAPI 미제공 확인 2026-04)
 *
 *  KRX OpenAPI는 종목별 투자자 매매 데이터를 제공하지 않는다(공식 서비스 목록 확인).
 *  pykrx 같은 라이브러리는 data.krx.co.kr 웹 스크래핑으로 우회하지만 여기서는
 *  자동 누적 시스템(HybridProvider + cron)으로 같은 목표를 달성한다.
 *  이 클래스는 호환을 위해 남겨두지만 호출되지 않는다.
 * ────────────────────────────────────────────────────────────── */

const KRX_CAPABILITIES_DEPRECATED: ProviderCapabilities = {
  hasIndividual: true,
  hasOtherCorp: true,
  hasTradingValue: true,
  maxHistoryDays: Number.POSITIVE_INFINITY,
  providerName: "KRX OpenAPI (사용 안 함)",
  notes: [
    "KRX OpenAPI에 종목별 투자자 매매 endpoint가 없음을 확인 (2026-04). 자동 누적 시스템으로 대체.",
  ],
};

/** @deprecated KRX OpenAPI에 필요한 endpoint가 존재하지 않음. 호출하면 throw. */
export class KrxProvider implements InvestorFlowProvider {
  readonly capabilities = KRX_CAPABILITIES_DEPRECATED;

  async fetchTrend(
    _symbol: string,
    _startDate: string,
    _endDate: string
  ): Promise<NormalizedTrend> {
    throw new Error(
      "KrxProvider is permanently deprecated: KRX OpenAPI does not expose " +
        "per-stock investor trading data. Use HybridProvider (automatic accumulation)."
    );
  }
}

/* ──────────────────────────────────────────────────────────────
 *  팩토리 — 항상 HybridProvider
 * ────────────────────────────────────────────────────────────── */

export function getProvider(): InvestorFlowProvider {
  return new HybridProvider();
}
