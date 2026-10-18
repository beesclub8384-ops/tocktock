/**
 * 관측소 3 — 그림자금융: 은행의 비예금 금융기관(NDFI) 대출 수집 및 저장
 *
 * 출처는 FRED 하나 (원자료는 Fed H.8 "Assets and Liabilities of Commercial Banks in the U.S.").
 *  - LNFACBW027SBOG: Loans to Nondepository Financial Institutions, All Commercial Banks
 *    (십억 달러, 계절조정, 주간·수요일 기준, 2015-01-07 시작)
 *  - TOTLL: Loans and Leases in Bank Credit, All Commercial Banks
 *    (같은 단위·조정·주기 — 총대출 대비 비중 참고용)
 *
 * 실측으로 확인한 사실 (2026-10-18):
 *  - 두 시리즈 모두 결측(".")이 없었다. 그래도 "."가 오면 건너뛴다 —
 *    잔액 지표라 0 으로 채우면 가짜 급감이 된다.
 *  - 과거 값이 **사후 개정된다** (H.8 주간 값은 분기말 Call Report 에 맞춰 벤치마크된다.
 *    FRED 빈티지 607개, 2020-03-18 값이 637.25 → 638.61 로 바뀐 사례 확인).
 *    그래서 증분 병합하지 않고 **매번 전체를 받아 통째로 덮어쓴다** (관측치 약 600건).
 *  - H.8 은 매주 금요일 미 동부 16:15 경 발표, 값은 그 전주 수요일 기준이다
 *    (2026-10-16 발표 = 2026-10-07 기준). FRED 갱신은 같은 날 오후.
 *    우리 cron(평일 13:00 UTC)은 금요일 발표보다 먼저 돌아 월요일에 들어온다.
 */
import { redis } from "@/lib/redis";
import { findNbfiSurges, type NbfiLoansPoint } from "@/lib/observatory-constants";

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

export const NBFI_LOANS_KEY = "observatory:nbfi-loans";

/** 사용하는 FRED 시리즈 id */
export const NBFI_SERIES_ID = "LNFACBW027SBOG";
export const TOTAL_LOANS_SERIES_ID = "TOTLL";

/** NDFI 시리즈 시작일 (첫 관측치) */
export const NBFI_START = "2015-01-07";

interface FredObs {
  date: string;
  value: string;
}

/** Redis 에 저장된 시계열 (날짜 오름차순). 없으면 빈 배열 */
export async function loadNbfiLoans(): Promise<NbfiLoansPoint[]> {
  // @upstash/redis 는 직렬화/역직렬화를 자동 처리한다 (JSON.parse 금지)
  const stored = await redis.get<NbfiLoansPoint[]>(NBFI_LOANS_KEY);
  return Array.isArray(stored) ? stored : [];
}

async function fetchSeries(seriesId: string, apiKey: string): Promise<Map<string, number>> {
  const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${NBFI_START}`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`FRED ${seriesId}: ${res.status}`);
  const json = (await res.json()) as { observations?: FredObs[] };
  const out = new Map<string, number>();
  for (const o of json.observations ?? []) {
    // 결측은 건너뛴다 (0 으로 채우지 않는다)
    if (!o.date || o.value === "." || o.value === "") continue;
    const v = parseFloat(o.value);
    if (Number.isFinite(v)) out.set(o.date, v);
  }
  return out;
}

export interface NbfiLoansCollectResult {
  /** 저장 후 전체 주 수 */
  total: number;
  /** 이번 실행으로 늘어난 주 수 */
  added: number;
  /** 총대출 값이 없어 비중을 못 구하는 주 수 */
  missingTotal: number;
  latestDate: string | null;
  latestLoansBillions: number | null;
  /**
   * 최근 4주 안의 "점검 필요" 주 — 주간 변화가 아주 큰데 연준이 밝힌 재분류
   * 날짜와 겹치지 않는 주. 판정에는 쓰지 않는다. cron 이 warnings 로 넘긴다.
   */
  recentSurges: { date: string; changeBillions: number }[];
}

/** 페이지·cron 이 "최근" 으로 보는 주 수 */
export const NBFI_RECENT_SURGE_WEEKS = 4;

/** 최근 n개 기준일 안의 점검 필요 주 */
export function recentNbfiSurges(points: NbfiLoansPoint[]): { date: string; changeBillions: number }[] {
  const recent = new Set(points.slice(-NBFI_RECENT_SURGE_WEEKS).map((p) => p.date));
  return findNbfiSurges(points).flagged.filter((f) => recent.has(f.date));
}

/**
 * FRED 에서 NDFI 대출과 총대출을 받아 날짜로 합쳐 Redis 에 덮어쓴다.
 *
 * NDFI 쪽이 비거나 호출이 실패하면 기존 저장분을 건드리지 않고 던진다
 * (cron 의 errors 에 남게 — 조용히 0건 성공으로 끝나면 갱신이 멈춘 걸 모른다).
 * 총대출은 참고 카드용이라, 그쪽만 실패하면 비중 없이(null) 저장하고 던지지 않는다.
 */
export async function collectNbfiLoans(): Promise<NbfiLoansCollectResult> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error("FRED_API_KEY not set");

  const existing = await loadNbfiLoans();
  const [loans, total] = await Promise.all([
    fetchSeries(NBFI_SERIES_ID, apiKey),
    fetchSeries(TOTAL_LOANS_SERIES_ID, apiKey).catch((e) => {
      console.error("[observatory/nbfi-loans] TOTLL 수집 실패 — 비중 없이 저장:", e);
      return new Map<string, number>();
    }),
  ]);
  if (loans.size === 0) throw new Error(`FRED ${NBFI_SERIES_ID}: 관측치 0건`);

  const series: NbfiLoansPoint[] = [...loans.keys()].sort().map((date) => ({
    date,
    loansBillions: loans.get(date)!,
    totalLoansBillions: total.get(date) ?? null,
  }));

  await redis.set(NBFI_LOANS_KEY, series);

  const latest = series[series.length - 1];
  return {
    total: series.length,
    added: series.length - existing.length,
    missingTotal: series.filter((p) => p.totalLoansBillions === null).length,
    latestDate: latest.date,
    latestLoansBillions: latest.loansBillions,
    recentSurges: recentNbfiSurges(series),
  };
}
