/**
 * 관측소 4 — 국채시장: 국채 입찰 결과 수집 및 저장
 *
 * 출처: 미 재무부 Fiscal Data API "auctions_query" (TreasuryDirect 입찰 결과와 같은 원자료)
 *   https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query
 *   인증 없음 (2026-10-18 실측).
 *
 * 실측으로 확인한 사실 (2026-10-18):
 *  - 2000-01 이후 Note·Bond 입찰 2,055건. 결과가 있는(응찰 배율이 있는) 건 2,053건 —
 *    나머지는 공고만 되고 아직 입찰 전인 건이다.
 *  - primary_dealer_accepted + direct_bidder_accepted + indirect_bidder_accepted = comp_accepted
 *    가 결과가 있는 전 건에서 정확히 성립했다. 그래서 딜러 비중의 분모는 comp_accepted(경쟁 낙찰)다.
 *  - 딜러 낙찰(primary_dealer_accepted)이 비어 있는 건은 2000-01-12 ~ 2008-03-27 의 295건이다
 *    (TIPS·FRN 포함 Note/Bond 전체 기준, 명목 이표채만 보면 251건) → 딜러 비중은 null.
 *  - 만기는 **입찰 시점의 실제 남은 만기(security_term)** 로 분류한다. 원래 만기(original_security_term)로
 *    분류하면 안 된다 — 재무부는 새 2·3·5년물을 예전 5·7·10년물의 재발행으로 파는 경우가 있어
 *    (예: 2026-01-26 원래 5년·실제 2년, 2019-11-05 원래 10년·실제 3년, 명목 입찰 24건),
 *    2년물 입찰이 5년물 평균과 비교되는 가짜 놀람이 생긴다 (2026-10 독립 검증에서 발견).
 *  - 실제 만기는 "29-Year 10-Month", "9-Year 11-Month", "6-Year 7-Month" 처럼 온다.
 *    가장 가까운 표준 만기로 묶고, 1년 넘게 차이 나면 묶지 않는다.
 *  - 이 API 에는 입찰 직전 발행일전(when-issued) 금리가 없다 → 테일(낙찰 금리 − 직전 금리)은 계산할 수 없다.
 *  - 딜러 낙찰이 있는 첫 입찰은 2008-04-23 이다 (그 전은 비어 있음).
 *  - 공고 당일에 열린 2,500만 달러짜리 소액 입찰이 2건 있다(2019-06-21 10년물, 2021-12-02 20년물).
 *    정규 입찰(가장 작아도 50억 달러)과 성격이 달라 딜러가 전량 낙찰(비중 100%)했다.
 *    그대로 두면 딜러 비중 놀람이 +75%p 로 튀어 가짜 경보가 난다 → 공고 금액 10억 달러 미만은 뺀다.
 *
 * 입찰 결과는 확정 후 바뀌지 않으므로 전체를 받아 통째로 덮어써도 결과가 같다 (약 1MB, 수 초).
 */
import { redis } from "@/lib/redis";
import { assertNotShrunk } from "@/lib/observatory-series-guard";
import type { AuctionRecord } from "@/lib/observatory-constants";

const API =
  "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query";

export const AUCTIONS_KEY = "observatory:treasury-auctions";

/** 저장 시작일 */
export const AUCTIONS_START = "2000-01-01";

/** 이 금액(달러) 미만 공고 입찰은 소액 비정규 입찰로 보고 뺀다 */
export const AUCTION_MIN_OFFERING_USD = 1_000_000_000;

/** 표준 만기(년) — 원래 만기를 이 중 가장 가까운 값으로 묶는다 */
const STANDARD_TERMS = [2, 3, 5, 7, 10, 20, 30];

interface ApiRow {
  cusip: string;
  security_type: string;
  security_term: string;
  auction_date: string;
  reopening: string;
  inflation_index_security: string;
  floating_rate: string;
  bid_to_cover_ratio: string;
  comp_accepted: string;
  offering_amt: string;
  primary_dealer_accepted: string;
}

/** "29-Year 10-Month" → 30, "10-Year" → 10. 해석 못 하면 null */
export function normalizeTerm(term: string): number | null {
  const m = /^(\d+)-Year(?:\s+(\d+)-Month)?$/.exec(term.trim());
  if (!m) return null;
  const years = Number(m[1]) + (m[2] ? Number(m[2]) / 12 : 0);
  let best = STANDARD_TERMS[0];
  for (const t of STANDARD_TERMS) if (Math.abs(t - years) < Math.abs(best - years)) best = t;
  // 표준 만기와 1년 넘게 차이 나면 묶지 않는다 (모르는 만기를 억지로 끼우지 않는다)
  return Math.abs(best - years) <= 1 ? best : null;
}

const num = (v: string): number | null => {
  if (v === "null" || v === "" || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** API 행 → 저장용 기록. 대상이 아니거나 결과가 없으면 null */
export function toAuctionRecord(r: ApiRow): AuctionRecord | null {
  if (r.inflation_index_security !== "No" || r.floating_rate !== "No") return null;
  if (r.security_type !== "Note" && r.security_type !== "Bond") return null;
  const btc = num(r.bid_to_cover_ratio);
  if (btc === null) return null; // 아직 입찰 전
  const offering = num(r.offering_amt);
  if (offering === null || offering < AUCTION_MIN_OFFERING_USD) return null; // 소액 비정규 입찰
  const termYears = normalizeTerm(r.security_term);
  if (termYears === null) return null;
  const comp = num(r.comp_accepted);
  const pd = num(r.primary_dealer_accepted);
  return {
    date: r.auction_date,
    cusip: r.cusip,
    termYears,
    reopening: r.reopening === "Yes",
    bidToCover: btc,
    dealerSharePct: pd !== null && comp !== null && comp > 0 ? (pd / comp) * 100 : null,
  };
}

/** Redis 에 저장된 기록 (입찰일 오름차순). 없으면 빈 배열 */
export async function loadAuctions(): Promise<AuctionRecord[]> {
  // @upstash/redis 는 직렬화/역직렬화를 자동 처리한다 (JSON.parse 금지)
  const stored = await redis.get<AuctionRecord[]>(AUCTIONS_KEY);
  return Array.isArray(stored) ? stored : [];
}

export interface AuctionsCollectResult {
  total: number;
  added: number;
  /** 원자료 행 수 (Note·Bond 전체) */
  fetched: number;
  latestDate: string | null;
}

export async function collectAuctions(): Promise<AuctionsCollectResult> {
  const existing = await loadAuctions();
  const fields = [
    "cusip",
    "security_type",
    "security_term",
    "auction_date",
    "reopening",
    "inflation_index_security",
    "floating_rate",
    "bid_to_cover_ratio",
    "comp_accepted",
    "offering_amt",
    "primary_dealer_accepted",
  ].join(",");
  const url =
    `${API}?sort=auction_date&page%5Bsize%5D=10000&fields=${fields}` +
    `&filter=security_type:in:(Note,Bond),auction_date:gte:${AUCTIONS_START}`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Fiscal Data auctions: ${res.status}`);
  const json = (await res.json()) as { data?: ApiRow[]; meta?: { "total-count"?: number } };
  const rows = json.data ?? [];
  // 한 페이지(1만 건)를 넘으면 뒤가 잘린다 — 조용히 일부만 저장하지 않게 던진다
  const total = json.meta?.["total-count"] ?? rows.length;
  if (total > rows.length) throw new Error(`Fiscal Data auctions: ${total}건 중 ${rows.length}건만 받음`);

  const records = rows
    .map(toAuctionRecord)
    .filter((r): r is AuctionRecord => r !== null)
    // 같은 날 같은 만기 입찰이 있을 수 있어(2008-10-08 장외 재발행 2건) CUSIP 까지 정렬 기준에 넣는다.
    // 안 그러면 순서가 API 응답 순서에 따라 바뀌어 놀람 계산이 실행마다 달라질 수 있다.
    .sort((a, b) =>
      a.date !== b.date
        ? a.date < b.date ? -1 : 1
        : a.termYears !== b.termYears
          ? a.termYears - b.termYears
          : a.cusip < b.cusip ? -1 : a.cusip > b.cusip ? 1 : 0
    );
  if (records.length === 0) throw new Error("Fiscal Data auctions: 대상 입찰 0건");
  // 잘린 응답으로 저장분을 덮어쓰지 않는다 (같은 날 입찰이 여럿이라 날짜 연속 검사는 못 한다)
  assertNotShrunk("Fiscal Data auctions", records.map((r) => r.date), existing.map((r) => r.date));

  await redis.set(AUCTIONS_KEY, records);
  return {
    total: records.length,
    added: records.length - existing.length,
    fetched: rows.length,
    latestDate: records[records.length - 1].date,
  };
}
