/**
 * 관측소 3 — 그림자금융: 국채 베이시스 트레이드 대리 지표 수집 및 저장
 *
 * 출처는 CFTC 공개 API(Socrata) 하나만 사용한다.
 *  - 데이터셋 gpe5-46if: Traders in Financial Futures (TFF) — Futures Only
 *  - 인증키 없이 호출된다 (2026-10-18 실측)
 *
 * ⚠ 같은 이름("TFF - Futures Only")의 98ig-3k9y, dw8z-x6ih 는 2022-10 에
 *   갱신이 멈춘 옛 사본이다. 호출은 되지만 값이 안 늘어나 무음 실패가 된다.
 *
 * ⚠ 시장은 **코드로만** 고른다. 이름은 2022-02 에 한 번("2-YEAR U.S. TREASURY
 *   NOTES" → "UST 2Y NOTE"), 울트라 본드는 2025-09 두 주 동안 또 바뀌었다.
 *   이름으로 거르면 그 주들이 조용히 빠진다.
 *
 * ⚠ 숫자 필드가 JSON 문자열로 온다 ("2695299"). 직접 숫자로 바꾸고,
 *   못 바꾸면 던진다 — NaN 이 합계에 섞이면 전체가 NaN 이 되는데 에러는 안 난다.
 *
 * 발표: 매주 금요일 미 동부 15:30, 그 주 화요일 기준 데이터.
 * 우리 cron(평일 13:00 UTC)은 금요일 발표보다 먼저 돌아서, 새 값은 다음 주
 * 월요일 실행에서 들어온다. 연휴 주는 월요일 발표라 화요일에 들어온다.
 */
import { redis } from "@/lib/redis";
import type { BasisTradePoint } from "@/lib/observatory-constants";

const CFTC_BASE = "https://publicreporting.cftc.gov/resource";

export const BASIS_TRADE_KEY = "observatory:basis-trade";

/** TFF Futures Only 데이터셋 id */
export const BASIS_TRADE_DATASET_ID = "gpe5-46if";

/**
 * 합산하는 국채 선물 6개와 계약당 액면 (달러).
 *
 * 액면은 CFTC 응답의 contract_units 필드로 확인한 값이다
 * ("(CONTRACTS OF $200,000 FACE VALUE)" 등). CME 공식 페이지는 확인하지 못했다.
 */
export const BASIS_TRADE_CONTRACTS: Record<
  string,
  { label: string; /** 계약당 액면, 달러(원 단위 아님) */ faceUsd: number }
> = {
  "042601": { label: "2년", faceUsd: 200_000 },
  "044601": { label: "5년", faceUsd: 100_000 },
  "043602": { label: "10년", faceUsd: 100_000 },
  "043607": { label: "울트라 10년", faceUsd: 100_000 },
  "020601": { label: "30년(T-Bond)", faceUsd: 100_000 },
  "020604": { label: "울트라 본드", faceUsd: 100_000 },
};

/**
 * 저장 시작일.
 *
 * 울트라 10년이 2016-03-08 에 시작했고 2016-03 에는 한 주씩 빠진 주가 있다.
 * 6개 만기 구성이 같은 구간만 써야 분포가 왜곡되지 않으므로 2016-04 부터 저장한다.
 */
export const BASIS_TRADE_START = "2016-04-01";

/** 매일 다시 받는 최근 구간 (일). 10주 — CFTC 사후 정정도 같이 반영된다 */
const REFETCH_DAYS = 70;

interface CftcRow {
  cftc_contract_market_code?: string;
  report_date_as_yyyy_mm_dd?: string;
  open_interest_all?: string;
  lev_money_positions_long?: string;
  lev_money_positions_short?: string;
}

/** Redis 에 저장된 시계열 (날짜 오름차순). 없으면 빈 배열 */
export async function loadBasisTrade(): Promise<BasisTradePoint[]> {
  // @upstash/redis 는 직렬화/역직렬화를 자동 처리한다 (JSON.parse 금지)
  const stored = await redis.get<BasisTradePoint[]>(BASIS_TRADE_KEY);
  return Array.isArray(stored) ? stored : [];
}

/** CFTC 문자열 숫자 → number. 못 바꾸면 던진다 (NaN 무음 전파 방지) */
function toNumber(v: string | undefined, field: string, date: string, code: string): number {
  const n = Number(v);
  if (v === undefined || v === "" || !Number.isFinite(n)) {
    throw new Error(`CFTC ${code} ${date} ${field} 숫자 아님: ${JSON.stringify(v)}`);
  }
  return n;
}

/** CFTC 에서 지정일 이후 6개 만기 행을 받는다 */
async function fetchRows(fromDate: string): Promise<CftcRow[]> {
  const codes = Object.keys(BASIS_TRADE_CONTRACTS)
    .map((c) => `'${c}'`)
    .join(",");
  const params = new URLSearchParams({
    $select:
      "cftc_contract_market_code,report_date_as_yyyy_mm_dd,open_interest_all,lev_money_positions_long,lev_money_positions_short",
    $where: `cftc_contract_market_code in(${codes}) AND report_date_as_yyyy_mm_dd >= '${fromDate}T00:00:00.000'`,
    $order: "report_date_as_yyyy_mm_dd",
    $limit: "50000",
  });
  const url = `${CFTC_BASE}/${BASIS_TRADE_DATASET_ID}.json?${params.toString()}`;
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`CFTC ${BASIS_TRADE_DATASET_ID}: ${res.status}`);
  const json = (await res.json()) as unknown;
  if (!Array.isArray(json)) throw new Error("CFTC 응답이 배열이 아님");
  return json as CftcRow[];
}

/**
 * CFTC 행을 보고일 단위로 묶어 합산한다.
 *
 * ⚠ 6개 코드가 **모두** 있는 보고일만 쓴다. 하나라도 빠진 날을 합치면
 *   그 주만 액면이 뚝 떨어져 가짜 청산 신호가 켜진다. 빠진 날은 로그에 남긴다.
 *
 * 4주·8주 변화는 저장하지 않는다. 판정 규칙이 바뀌어도 저장 데이터는 그대로
 * 두려고, 읽을 때마다 withChanges(observatory-constants)로 계산한다.
 */
export function aggregateRows(rows: CftcRow[]): {
  points: BasisTradePoint[];
  skippedDates: string[];
} {
  const byDate = new Map<string, Map<string, CftcRow>>();
  for (const r of rows) {
    const code = r.cftc_contract_market_code;
    const date = r.report_date_as_yyyy_mm_dd?.slice(0, 10);
    if (!code || !date || !(code in BASIS_TRADE_CONTRACTS)) continue;
    if (date < BASIS_TRADE_START) continue;
    let g = byDate.get(date);
    if (!g) byDate.set(date, (g = new Map()));
    g.set(code, r);
  }

  const points: BasisTradePoint[] = [];
  const skippedDates: string[] = [];
  for (const date of [...byDate.keys()].sort()) {
    const g = byDate.get(date)!;
    const missing = Object.keys(BASIS_TRADE_CONTRACTS).filter((c) => !g.has(c));
    if (missing.length > 0) {
      skippedDates.push(date);
      console.warn(`[observatory/basis-trade] ${date} 건너뜀 — 빠진 코드: ${missing.join(",")}`);
      continue;
    }

    let netShortContracts = 0;
    let notionalUsd = 0;
    let openInterest = 0;
    for (const [code, { faceUsd }] of Object.entries(BASIS_TRADE_CONTRACTS)) {
      const r = g.get(code)!;
      const long = toNumber(r.lev_money_positions_long, "lev_money_positions_long", date, code);
      const short = toNumber(r.lev_money_positions_short, "lev_money_positions_short", date, code);
      const oi = toNumber(r.open_interest_all, "open_interest_all", date, code);
      const net = short - long;
      netShortContracts += net;
      notionalUsd += net * faceUsd;
      openInterest += oi;
    }

    points.push({
      date,
      netShortContracts,
      // 달러 → 십억 달러
      notionalBillions: notionalUsd / 1e9,
      openInterest,
      netShortPctOfOi: openInterest > 0 ? (netShortContracts / openInterest) * 100 : 0,
    });
  }
  return { points, skippedDates };
}

/**
 * 저장할 필드만 남긴다.
 *
 * 96a85a8 판에서는 각 점에 change4wPct 를 함께 저장했다. 병합은 기존 객체를
 * 그대로 들고 가므로, 걸러내지 않으면 옛 필드가 영원히 남는다.
 */
function toStored(p: BasisTradePoint): BasisTradePoint {
  return {
    date: p.date,
    netShortContracts: p.netShortContracts,
    notionalBillions: p.notionalBillions,
    openInterest: p.openInterest,
    netShortPctOfOi: p.netShortPctOfOi,
  };
}

export interface BasisTradeCollectResult {
  /** 이번 실행이 전체 백필이었는지 */
  backfill: boolean;
  /** 저장 후 전체 보고일 수 */
  total: number;
  /** 이번 실행으로 늘어난 보고일 수 */
  added: number;
  /** 6개 코드가 다 없어 건너뛴 보고일 */
  skippedDates: string[];
  latestDate: string | null;
  latestNotionalBillions: number | null;
}

/**
 * CFTC 에서 받아 Redis 에 병합 저장한다.
 *
 * 처음에는 2016-04-01 이후 전체를, 이후에는 마지막 저장일 기준 최근 10주를
 * 다시 받아 **같은 날짜는 덮어쓴다** (몇 번을 돌려도 결과가 같다).
 *
 * 받은 행이 하나도 없거나 호출이 실패하면 기존 저장분을 건드리지 않고 던진다.
 * cron 이 errors 에 남기게 하려는 것이다 — 조용히 0건 성공으로 끝나면 갱신이
 * 멈춘 걸 아무도 모른다.
 */
export async function collectBasisTrade(): Promise<BasisTradeCollectResult> {
  const existing = await loadBasisTrade();
  const backfill = existing.length === 0;

  let fromDate = BASIS_TRADE_START;
  if (!backfill) {
    const last = existing[existing.length - 1].date;
    const d = new Date(Date.parse(`${last}T00:00:00Z`) - REFETCH_DAYS * 86_400_000);
    const candidate = d.toISOString().slice(0, 10);
    if (candidate > fromDate) fromDate = candidate;
  }

  const rows = await fetchRows(fromDate);
  const { points, skippedDates } = aggregateRows(rows);
  if (points.length === 0) {
    throw new Error(`CFTC ${fromDate} 이후 6개 만기가 다 있는 보고일이 없음 (행 ${rows.length}건)`);
  }

  const merged = new Map(existing.map((p) => [p.date, toStored(p)]));
  for (const p of points) merged.set(p.date, p);
  const series = [...merged.values()].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  );

  await redis.set(BASIS_TRADE_KEY, series);

  const latest = series[series.length - 1];
  return {
    backfill,
    total: series.length,
    added: series.length - existing.length,
    skippedDates,
    latestDate: latest.date,
    latestNotionalBillions: latest.notionalBillions,
  };
}
