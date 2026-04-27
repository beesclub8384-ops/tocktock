/**
 * 투자자 동향 추적 — Provider 추상화 레이어.
 *
 *   현재: HybridProvider (KIS 최근 30거래일 + Naver 그 이전)
 *   미래: KrxProvider (KRX OpenAPI 승인 후 활성화)
 *
 * 환경변수 KRX_OPENAPI_KEY가 설정되면 자동으로 KrxProvider로 전환.
 * UI는 capabilities를 보고 한계를 표시 — provider 교체 시 UI 코드 수정 불필요.
 */

import {
  fetchKisInvestorTrend,
  type KisInvestorDailyEntry,
} from "@/lib/kis-client";
import {
  fetchNaverInvestorTrend,
  type NaverInvestorEntry,
} from "@/lib/naver-investor-scraper";
import type {
  CumulativeTotals,
  CumulativeTrend,
  DailyTrend,
  NormalizedTrend,
  ProviderCapabilities,
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

function nullableTotals(values: (number | null)[]): CumulativeTotals {
  let shares = 0;
  let any = false;
  for (const v of values) {
    if (v != null) {
      shares += v;
      any = true;
    }
  }
  return any ? { shares, value: null } : { shares: null, value: null };
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
  // 거래대금이 한 번도 안 들어왔으면 null로 표시
  if (!capabilities.hasTradingValue) {
    foreign = { ...foreign, value: null };
    institution = { ...institution, value: null };
    if (individual) individual = { ...individual, value: null };
    if (otherCorp) otherCorp = { ...otherCorp, value: null };
  }
  void nullableTotals; // 보조 함수, 미사용 시 dead-code elimination
  return { foreign, institution, individual, otherCorp };
}

/* ──────────────────────────────────────────────────────────────
 *  HybridProvider — KIS(최근 30일) + Naver(30일+)
 * ────────────────────────────────────────────────────────────── */

const HYBRID_CAPABILITIES: ProviderCapabilities = {
  hasIndividual: true, // KIS 구간 한정
  hasOtherCorp: false,
  hasTradingValue: true, // KIS 구간 한정
  maxHistoryDays: 365 * 5, // 네이버는 수년치 가능
  providerName: "하이브리드 (KIS + 네이버)",
  notes: [
    "최근 약 30거래일은 한국투자증권(KIS) API로 외국인·기관·개인 3주체 + 거래대금까지 제공.",
    "그 이전 구간은 네이버 금융 페이지에서 외국인·기관 2주체 수량만 가져옴 (개인·거래대금 미제공).",
    "기타법인은 미제공 (KRX OpenAPI 승인 후 추가 예정).",
    "표의 '출처' 컬럼으로 어느 소스에서 왔는지 구분.",
  ],
};

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
    individual: null, // 네이버는 미제공
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

    // 두 소스 병렬 호출 — 실패해도 한쪽은 살린다
    const [kisRes, naverRes] = await Promise.allSettled([
      fetchKisInvestorTrend(code),
      fetchNaverInvestorTrend(code, startDate, endDate),
    ]);

    const kisRows: KisInvestorDailyEntry[] =
      kisRes.status === "fulfilled" ? kisRes.value : [];
    const naverRows: NaverInvestorEntry[] =
      naverRes.status === "fulfilled" ? naverRes.value : [];

    if (kisRows.length === 0 && naverRows.length === 0) {
      const reasons: string[] = [];
      if (kisRes.status === "rejected") reasons.push(`KIS: ${kisRes.reason}`);
      if (naverRes.status === "rejected") {
        reasons.push(`Naver: ${naverRes.reason}`);
      }
      throw new Error(
        `투자자 매매 데이터를 가져오지 못했습니다. (${reasons.join(" / ") || "알 수 없는 오류"})`
      );
    }

    // 병합: KIS 우선 (3주체 + 거래대금까지 제공), 그 외 날짜만 네이버에서 보충
    const byDate = new Map<string, DailyTrend>();
    for (const r of kisRows) {
      if (r.date < startDate || r.date > endDate) continue;
      byDate.set(r.date, kisRowToDaily(r));
    }
    for (const r of naverRows) {
      if (r.date < startDate || r.date > endDate) continue;
      if (byDate.has(r.date)) continue; // KIS가 이미 있음 → 더 풍부하므로 유지
      byDate.set(r.date, naverRowToDaily(r));
    }

    const daily = Array.from(byDate.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    const cumulative = buildCumulative(daily, HYBRID_CAPABILITIES);

    return {
      symbol: code,
      name: null,
      startDate,
      endDate,
      daily,
      cumulative,
      capabilities: HYBRID_CAPABILITIES,
      fetchedAt: new Date().toISOString(),
    };
  }
}

/* ──────────────────────────────────────────────────────────────
 *  KrxProvider — 미래 활성화 (스켈레톤)
 *
 *  KRX OpenAPI 승인 후 fetchTrend()만 구현하면 된다.
 *  - 4주체 (외국인·기관·개인·기타법인)
 *  - 거래대금(원) 제공
 *  - 무한 과거 조회
 * ────────────────────────────────────────────────────────────── */

const KRX_CAPABILITIES: ProviderCapabilities = {
  hasIndividual: true,
  hasOtherCorp: true,
  hasTradingValue: true,
  maxHistoryDays: Number.POSITIVE_INFINITY,
  providerName: "KRX OpenAPI",
  notes: [
    "KRX 공식 데이터로 외국인·기관·개인·기타법인 4주체 + 거래대금 + 무한 과거 조회 가능.",
  ],
};

export class KrxProvider implements InvestorFlowProvider {
  readonly capabilities = KRX_CAPABILITIES;

  async fetchTrend(
    _symbol: string,
    _startDate: string,
    _endDate: string
  ): Promise<NormalizedTrend> {
    // 미래 작업: KRX OpenAPI 호출 + 정규화
    // 현재는 의도적으로 미구현 — 환경변수가 잘못 설정되어도 명확히 실패하도록.
    throw new Error(
      "KrxProvider is not implemented yet. " +
        "Set KRX_OPENAPI_KEY only after the KRX integration is complete. " +
        "Implement fetchTrend() and return NormalizedTrend with KRX_CAPABILITIES."
    );
  }
}

/* ──────────────────────────────────────────────────────────────
 *  팩토리: 환경변수 기반 자동 선택
 * ────────────────────────────────────────────────────────────── */

export function getProvider(): InvestorFlowProvider {
  if (process.env.KRX_OPENAPI_KEY && process.env.KRX_OPENAPI_KEY.trim()) {
    return new KrxProvider();
  }
  return new HybridProvider();
}
