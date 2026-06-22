/**
 * "이번 주 주요 일정" 통합 빌더.
 *
 * 4개 소스를 공통 스키마로 변환 → 오늘부터 +7일 필터 → 날짜순 정렬:
 *   1) 미국 경제지표  : FRED release/dates (CPI/고용/GDP/PCE/PPI/소매판매)
 *   2) FOMC 회의      : federalreserve.gov fomccalendars.htm (cheerio 파싱)
 *   3) 한·미 실적예정  : yahoo-finance2 quoteSummary calendarEvents.earnings
 *   4) 한국 실적확정  : OpenDART list.json 최근 7일 (화이트리스트)
 *
 * 단위/시간대: 모든 날짜는 KST 기준 YYYY-MM-DD 문자열로 통일.
 */

import * as cheerio from "cheerio";
import YahooFinance from "yahoo-finance2";
import { fetchAllListedStocks } from "@/lib/stock-universe";

export interface CalendarEvent {
  /** YYYY-MM-DD (KST) */
  date: string;
  market: "KR" | "US";
  category: "earnings" | "indicator";
  /** 종목명/지표명 */
  name: string;
  /** 실적: 예정(추정)/확정, 지표: null */
  status: "예정(추정)" | "확정" | null;
  detail: string;
}

export interface WeeklyCalendarBlob {
  updatedAt: string;
  rangeStart: string;
  rangeEnd: string;
  events: CalendarEvent[];
}

/* ── 날짜 유틸 (KST) ───────────────────────────────────────── */
const pad = (n: number) => String(n).padStart(2, "0");

function toKstYmd(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`;
}

function kstTodayYmd(): string {
  return toKstYmd(new Date());
}

function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** 동시 실행 수를 제한하는 간단한 풀 */
async function pool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  async function run() {
    while (idx < items.length) {
      const cur = idx++;
      out[cur] = await worker(items[cur]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return out;
}

/* ── 1) FRED 경제지표 ──────────────────────────────────────── */
const FRED_RELEASES: { id: number; name: string }[] = [
  { id: 10, name: "소비자물가지수(CPI)" },
  { id: 50, name: "고용보고서" },
  { id: 53, name: "GDP" },
  { id: 54, name: "PCE 물가(개인소득·지출)" },
  { id: 46, name: "생산자물가지수(PPI)" },
  { id: 9, name: "소매판매" },
];

async function fetchFredIndicators(
  start: string,
  end: string
): Promise<CalendarEvent[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return [];
  const events: CalendarEvent[] = [];

  await Promise.all(
    FRED_RELEASES.map(async (rel) => {
      const url =
        `https://api.stlouisfed.org/fred/release/dates?release_id=${rel.id}` +
        `&api_key=${apiKey}&file_type=json&include_release_dates_with_no_data=true&sort_order=asc`;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) return;
        const json = (await res.json()) as {
          release_dates?: { date: string }[];
        };
        for (const rd of json.release_dates ?? []) {
          if (rd.date >= start && rd.date <= end) {
            events.push({
              date: rd.date,
              market: "US",
              category: "indicator",
              name: rel.name,
              status: null,
              detail: "미국 경제지표 발표",
            });
          }
        }
      } catch {
        /* 개별 실패는 무시 */
      }
    })
  );
  return events;
}

/* ── 2) FOMC 회의 ──────────────────────────────────────────── */
const MONTH_NUM: Record<string, number> = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};

async function fetchFomcMeetings(
  start: string,
  end: string
): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];
  try {
    const res = await fetch(
      "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);

    $(".panel, .panel-default").each((_i, panel) => {
      const head = $(panel)
        .find(".panel-heading, .pandefault, h4, h5")
        .first()
        .text()
        .trim();
      const ym = head.match(/(20\d\d)\s*FOMC/i);
      if (!ym) return;
      const year = Number(ym[1]);

      $(panel)
        .find(".fomc-meeting")
        .each((_j, row) => {
          const month = $(row)
            .find(".fomc-meeting__month")
            .text()
            .replace(/\s+/g, " ")
            .trim();
          const dateRaw = $(row)
            .find(".fomc-meeting__date")
            .text()
            .replace(/\s+/g, " ")
            .trim();
          const mNum = MONTH_NUM[month];
          if (!mNum || !dateRaw) return;
          // "27-28" / "16-17*" / "22 (notation vote)" → 시작일
          const dayMatch = dateRaw.match(/\d{1,2}/);
          if (!dayMatch) return;
          const day = Number(dayMatch[0]);
          const ymd = `${year}-${pad(mNum)}-${pad(day)}`;
          if (ymd >= start && ymd <= end) {
            events.push({
              date: ymd,
              market: "US",
              category: "indicator",
              name: "FOMC 회의",
              status: null,
              detail: dateRaw.includes("*")
                ? "통화정책 회의 (경제전망·점도표 발표)"
                : "통화정책 회의",
            });
          }
        });
    });
  } catch {
    /* 무시 */
  }
  return events;
}

/* ── 3) Yahoo 실적 예정일 ──────────────────────────────────── */
const US_TICKERS: string[] = [
  // 빅테크
  "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA",
  // 반도체
  "AMD", "AVGO", "TSM", "MU", "INTC", "QCOM", "ASML", "ARM", "SMCI", "MRVL",
  // 인기 성장주
  "NFLX", "CRM", "ORCL", "ADBE", "PLTR", "SNOW", "CRWD", "PANW", "NOW",
  "UBER", "ABNB", "COIN", "SHOP", "DELL", "MSTR", "LLY", "COST", "AMAT",
  "MRNA", "SOFI", "RBLX", "DDOG", "NET",
];

type YfEarnings = {
  earningsDate?: Date[];
  isEarningsDateEstimate?: boolean;
};

async function fetchYahooEarnings(
  start: string,
  end: string
): Promise<CalendarEvent[]> {
  const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

  // 한국: 시총 상위 약 150종목
  let krList: { symbol: string; name: string }[] = [];
  try {
    const all = await fetchAllListedStocks();
    krList = all
      .filter((s) => !s.tradeStopped)
      .sort((a, b) => b.marketCapKRW - a.marketCapKRW)
      .slice(0, 150)
      .map((s) => ({
        symbol: `${s.code}.${s.market === "KOSPI" ? "KS" : "KQ"}`,
        name: s.name,
      }));
  } catch {
    krList = [];
  }

  const targets: { symbol: string; name: string; market: "KR" | "US" }[] = [
    ...krList.map((s) => ({ ...s, market: "KR" as const })),
    ...US_TICKERS.map((t) => ({ symbol: t, name: t, market: "US" as const })),
  ];

  const results = await pool(targets, 6, async (t) => {
    try {
      const r = (await yf.quoteSummary(
        t.symbol,
        { modules: ["calendarEvents"] },
        { validateResult: false }
      )) as unknown as { calendarEvents?: { earnings?: YfEarnings } };
      const ed = (r?.calendarEvents?.earnings ?? {}) as YfEarnings;
      const dates = Array.isArray(ed.earningsDate) ? ed.earningsDate : [];
      if (dates.length === 0) return null;
      // 배열 길이 2(범위)도 처리: 오늘 이후의 가장 빠른 날짜 채택
      let picked: string | null = null;
      for (const d of dates) {
        if (!(d instanceof Date) || isNaN(d.getTime())) continue;
        const ymd = toKstYmd(d);
        if (ymd >= start && (picked === null || ymd < picked)) picked = ymd;
      }
      if (!picked || picked > end) return null;
      const ev: CalendarEvent = {
        date: picked,
        market: t.market,
        category: "earnings",
        name: t.name,
        status: ed.isEarningsDateEstimate === false ? "확정" : "예정(추정)",
        detail: t.market === "US" ? "미국 기업 실적" : "한국 기업 실적",
      };
      return ev;
    } catch {
      return null;
    }
  });

  return results.filter((e): e is CalendarEvent => e !== null);
}

/* ── 4) OpenDART 실적 확정 공시 ────────────────────────────── */
const DART_WHITELIST = [
  /영업\(잠정\)실적/,
  /연결재무제표기준영업\(잠정\)실적/,
  /영업실적등에대한전망/,
  /매출액또는손익구조/,
];
const DART_EXCLUDE = [/증권발행실적/, /소액공모실적/];

function normName(s: string): string {
  return s.replace(/\s+/g, "").replace(/(주식회사|\(주\))/g, "").toLowerCase();
}

async function fetchOpenDartConfirmed(): Promise<{
  events: CalendarEvent[];
  confirmedNames: Set<string>;
}> {
  const key = process.env.OPENDART_API_KEY;
  const confirmedNames = new Set<string>();
  const events: CalendarEvent[] = [];
  if (!key) return { events, confirmedNames };

  const today = kstTodayYmd();
  const bgn = addDaysYmd(today, -7).replace(/-/g, "");
  const end = today.replace(/-/g, "");

  type DartRow = { corp_name?: string; report_nm?: string; rcept_dt?: string };
  const list: DartRow[] = [];

  // 한 페이지 조회 (에러는 빈 결과로 흡수 → 일부 실패해도 전체 수집 유지)
  async function fetchDartPage(
    page: number
  ): Promise<{ rows: DartRow[]; totalPage: number; ok: boolean }> {
    try {
      const url =
        `https://opendart.fss.or.kr/api/list.json?crtfc_key=${key}` +
        `&bgn_de=${bgn}&end_de=${end}&page_count=100&page_no=${page}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { rows: [], totalPage: 1, ok: false };
      const json = (await res.json()) as {
        status?: string;
        total_page?: number;
        list?: DartRow[];
      };
      if (json.status !== "000") return { rows: [], totalPage: 1, ok: false };
      return { rows: json.list ?? [], totalPage: json.total_page ?? 1, ok: true };
    } catch {
      return { rows: [], totalPage: 1, ok: false };
    }
  }

  // 1페이지로 total_page 파악 → 나머지는 배치 병렬(동시 6개)로 수집
  const first = await fetchDartPage(1);
  if (!first.ok) return { events, confirmedNames };
  list.push(...first.rows);
  const totalPage = Math.min(first.totalPage, 40);
  if (totalPage > 1) {
    const restPages = Array.from({ length: totalPage - 1 }, (_, i) => i + 2);
    const batches = await pool(restPages, 6, (p) =>
      fetchDartPage(p).then((r) => r.rows)
    );
    for (const rows of batches) list.push(...rows);
  }

  for (const row of list) {
    const reportNm = row.report_nm ?? "";
    const corp = row.corp_name ?? "";
    if (!reportNm || !corp || !row.rcept_dt) continue;
    if (DART_EXCLUDE.some((re) => re.test(reportNm))) continue;
    if (!DART_WHITELIST.some((re) => re.test(reportNm))) continue;

    confirmedNames.add(normName(corp));
    const d = row.rcept_dt;
    const ymd = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    events.push({
      date: ymd,
      market: "KR",
      category: "earnings",
      name: corp,
      status: "확정",
      detail: reportNm.replace(/\s+/g, " ").trim(),
    });
  }
  return { events, confirmedNames };
}

/* ── 통합 ──────────────────────────────────────────────────── */
export async function buildWeeklyCalendar(): Promise<WeeklyCalendarBlob> {
  const start = kstTodayYmd();
  const end = addDaysYmd(start, 7);
  // 실적은 최근 발표분도 보여주기 위해 시작을 5일 앞당김 (지표/FOMC는 미래만)
  const earningsStart = addDaysYmd(start, -5);

  const [fred, fomc, yahoo, dart] = await Promise.all([
    fetchFredIndicators(start, end),
    fetchFomcMeetings(start, end),
    fetchYahooEarnings(earningsStart, end),
    fetchOpenDartConfirmed(),
  ]);

  let events: CalendarEvent[] = [
    ...fred,
    ...fomc,
    ...yahoo,
    ...dart.events,
  ];

  // 한국 종목이 Yahoo(예정)와 OpenDART(확정)에 모두 있으면 확정 우선 → 예정 제거
  events = events.filter((e) => {
    if (e.market === "KR" && e.category === "earnings" && e.status !== "확정") {
      return !dart.confirmedNames.has(normName(e.name));
    }
    return true;
  });

  // 동일 (market + date + name + category) 중복 제거
  //   (예: OpenDART에 같은 종목이 보고서명 2개로 들어와 2번 잡히는 경우 → 1개)
  const seen = new Set<string>();
  events = events.filter((e) => {
    const k = `${e.market}|${e.date}|${e.name}|${e.category}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // 카테고리별 기간 필터:
  //   실적(earnings): 오늘-5일 ~ 오늘+7일 (최근 발표 + 다가올 예정)
  //   지표/FOMC(indicator): 오늘 ~ 오늘+7일 (미래만)
  events = events.filter((e) => {
    if (e.category === "earnings") return e.date >= earningsStart && e.date <= end;
    return e.date >= start && e.date <= end;
  });

  // 날짜 → 시장(KR먼저) → 종류(indicator먼저) → 이름 순 정렬
  events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.market !== b.market) return a.market === "KR" ? -1 : 1;
    if (a.category !== b.category) return a.category === "indicator" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return {
    updatedAt: new Date().toISOString(),
    rangeStart: start,
    rangeEnd: end,
    events,
  };
}
