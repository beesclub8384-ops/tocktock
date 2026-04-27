/**
 * 네이버 금융 종목별 외국인·기관 일별 매매 스크래퍼
 *
 * 페이지: https://finance.naver.com/item/frgn.naver?code={code}&page={page}
 * 컬럼: 날짜 / 종가 / 전일비 / 등락률 / 거래량 / 기관 순매매(수량) / 외국인 순매매(수량)
 *      / 외국인 보유주수 / 외국인 보유율
 *
 * 한계:
 *   - 개인 매매는 미제공 (KIS만 제공)
 *   - 거래대금(원)은 미제공 — 종가 × 수량으로 추정
 *   - 페이지당 약 10거래일, 약 13페이지면 1년치
 */

import * as cheerio from "cheerio";

export interface NaverInvestorEntry {
  /** YYYY-MM-DD */
  date: string;
  /** 종가 (원) */
  close: number;
  /** 거래량 (주) */
  volume: number;
  /** 기관 순매수 수량 (주). 매수=양수, 매도=음수 */
  institutionShares: number;
  /** 외국인 순매수 수량 (주). 매수=양수, 매도=음수 */
  foreignShares: number;
}

const NAVER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36";

const PAGE_FETCH_TIMEOUT_MS = 8000;
const SLEEP_BETWEEN_PAGES_MS = 200;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** "1,234" 또는 "+1,234" / "-1,234" / "" → number. 빈값=0 */
function parseSignedInt(s: string | undefined | null): number {
  if (!s) return 0;
  const cleaned = s.replace(/,/g, "").replace(/\s+/g, "").trim();
  if (cleaned === "" || cleaned === "-") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** "2026.04.25" → "2026-04-25". 형식 어긋나면 빈 문자열. */
function normalizeDate(raw: string): string {
  const m = raw.replace(/\s+/g, "").match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (!m) return "";
  return `${m[1]}-${m[2]}-${m[3]}`;
}

async function fetchPage(code: string, page: number): Promise<NaverInvestorEntry[]> {
  const url = `https://finance.naver.com/item/frgn.naver?code=${code}&page=${page}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": NAVER_USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ko-KR,ko;q=0.9",
    },
    signal: AbortSignal.timeout(PAGE_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Naver frgn fetch HTTP ${res.status} (page=${page})`);
  }
  // 네이버 금융은 EUC-KR 인코딩
  const buf = Buffer.from(await res.arrayBuffer());
  const html = new TextDecoder("euc-kr").decode(buf);
  const $ = cheerio.load(html);

  const entries: NaverInvestorEntry[] = [];

  // 데이터 테이블: 두 번째 보조 테이블에 일별 행이 들어있음.
  // 견고하게: 모든 tr을 훑으며 td[0]가 YYYY.MM.DD 패턴인 행만 채택.
  $("table tr").each((_i, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 9) return;
    const dateRaw = $(tds[0]).text().trim();
    const date = normalizeDate(dateRaw);
    if (!date) return;
    const close = parseSignedInt($(tds[1]).text());
    const volume = parseSignedInt($(tds[4]).text());
    const institutionShares = parseSignedInt($(tds[5]).text());
    const foreignShares = parseSignedInt($(tds[6]).text());
    if (close <= 0) return;
    entries.push({ date, close, volume, institutionShares, foreignShares });
  });

  return entries;
}

/**
 * 네이버에서 [startDate, endDate] 구간(포함)의 일별 매매 동향을 모두 긁어온다.
 * 페이지를 1부터 차례로 fetch하여 startDate 이전이 나올 때까지 진행.
 *
 * 주의:
 *   - 시간대: 모두 KST 일자
 *   - 응답은 오래된 → 최신 순으로 오름차순 정렬되어 반환
 *   - 너무 큰 기간이면 자연스럽게 시간이 오래 걸림 (페이지당 200ms 슬립)
 */
export async function fetchNaverInvestorTrend(
  symbol: string,
  startDate: string,
  endDate: string,
  opts: { maxPages?: number } = {}
): Promise<NaverInvestorEntry[]> {
  const code = symbol.replace(/\.[A-Z]{2,3}$/, "").trim();
  if (!/^\d{6}$/.test(code)) {
    throw new Error(`invalid Korean stock code: ${symbol}`);
  }
  const maxPages = opts.maxPages ?? 80; // 약 800거래일 = 약 3년 안전

  const seen = new Map<string, NaverInvestorEntry>();
  for (let page = 1; page <= maxPages; page++) {
    if (page > 1) await sleep(SLEEP_BETWEEN_PAGES_MS);

    const rows = await fetchPage(code, page);
    if (rows.length === 0) break;

    let earliestOnPage = rows[0].date;
    for (const r of rows) {
      if (r.date < earliestOnPage) earliestOnPage = r.date;
      if (r.date >= startDate && r.date <= endDate) {
        seen.set(r.date, r);
      }
    }

    // 가장 이른 날짜가 이미 시작일보다 과거면 더 거슬러 올라갈 필요 없음
    if (earliestOnPage < startDate) break;
  }

  return Array.from(seen.values()).sort((a, b) => a.date.localeCompare(b.date));
}
