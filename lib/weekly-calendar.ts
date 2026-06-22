/**
 * "이번 주 주요 일정" 통합 빌더.
 *
 * 3개 소스를 공통 스키마로 변환 → 기간 필터 → 날짜순 정렬:
 *   1) 미국 경제지표  : FRED release/dates (CPI/고용/GDP/PCE/PPI/소매판매)
 *   2) FOMC 회의      : federalreserve.gov fomccalendars.htm (cheerio 파싱)
 *   3) 한·미 실적     : yahoo-finance2 quoteSummary calendarEvents.earnings
 *                      (isEarningsDateEstimate → 예정(추정)/확정)
 *
 * 단위/시간대: 모든 날짜는 KST 기준 YYYY-MM-DD 문자열로 통일.
 */

import * as cheerio from "cheerio";
import YahooFinance from "yahoo-finance2";
import { fetchAllListedStocks } from "@/lib/stock-universe";

export interface EarningsDetail {
  /** % 단위 (Yahoo 소수값에 ×100). 발표 완료 항목만 */
  surprisePercent?: number;
  /** 실제 EPS (발표 완료) */
  epsActual?: number;
  /** 예상(컨센서스) EPS */
  epsEstimate?: number;
  /** 매출 (실제 또는 예상) */
  revenue?: number;
  /** 순이익 (발표 완료) */
  netIncome?: number;
  /** 통화: KR→KRW, US→USD */
  currency: "KRW" | "USD";
}

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
  /** 실적 상세 (실적 항목만). 지표/FOMC는 비움 */
  earnings?: EarningsDetail;
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
  earningsAverage?: number;
  revenueAverage?: number;
};
type YfHistoryRow = {
  epsActual?: number | null;
  epsEstimate?: number | null;
  surprisePercent?: number | null;
};
type YfFinRow = { revenue?: number | null; earnings?: number | null };
type YfQuoteSummary = {
  calendarEvents?: { earnings?: YfEarnings };
  earningsHistory?: { history?: YfHistoryRow[] };
  earnings?: { financialsChart?: { quarterly?: YfFinRow[] } };
};

const isFiniteNum = (v: unknown): v is number =>
  typeof v === "number" && isFinite(v);

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

  const todayYmd = kstTodayYmd();

  const results = await pool(targets, 6, async (t) => {
    try {
      const r = (await yf.quoteSummary(
        t.symbol,
        { modules: ["calendarEvents", "earnings", "earningsHistory"] },
        { validateResult: false }
      )) as unknown as YfQuoteSummary;
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

      const currency: "KRW" | "USD" = t.market === "KR" ? "KRW" : "USD";
      const detail: EarningsDetail = { currency };
      const isPast = picked < todayYmd; // 발표 완료 = 발표일이 오늘 이전
      if (isPast) {
        // 발표 완료: earningsHistory 최근 분기 실제/예상 + financialsChart 매출/순이익
        const hist = r?.earningsHistory?.history ?? [];
        const lh = hist.length ? hist[hist.length - 1] : undefined;
        const fin = r?.earnings?.financialsChart?.quarterly ?? [];
        const lf = fin.length ? fin[fin.length - 1] : undefined;
        if (lh && isFiniteNum(lh.epsActual)) detail.epsActual = lh.epsActual;
        if (lh && isFiniteNum(lh.epsEstimate)) detail.epsEstimate = lh.epsEstimate;
        if (lh && isFiniteNum(lh.surprisePercent))
          detail.surprisePercent = lh.surprisePercent * 100; // 소수→%
        if (lf && isFiniteNum(lf.revenue)) detail.revenue = lf.revenue;
        if (lf && isFiniteNum(lf.earnings)) detail.netIncome = lf.earnings;
      } else {
        // 예정: calendarEvents 컨센서스(예상 EPS/매출)만
        if (isFiniteNum(ed.earningsAverage)) detail.epsEstimate = ed.earningsAverage;
        if (isFiniteNum(ed.revenueAverage)) detail.revenue = ed.revenueAverage;
      }

      const ev: CalendarEvent = {
        date: picked,
        market: t.market,
        category: "earnings",
        name: t.name,
        status: ed.isEarningsDateEstimate === false ? "확정" : "예정(추정)",
        detail: t.market === "US" ? "미국 기업 실적" : "한국 기업 실적",
      };
      // currency 외 실제 데이터가 하나라도 있을 때만 부착 (무음실패 원칙)
      if (Object.keys(detail).length > 1) ev.earnings = detail;
      return ev;
    } catch {
      return null;
    }
  });

  return results.filter((e): e is CalendarEvent => e !== null);
}

/* ── 통합 ──────────────────────────────────────────────────── */
export async function buildWeeklyCalendar(): Promise<WeeklyCalendarBlob> {
  const start = kstTodayYmd();
  const end = addDaysYmd(start, 7);
  // 실적은 최근 발표분도 보여주기 위해 시작을 5일 앞당김 (지표/FOMC는 미래만)
  const earningsStart = addDaysYmd(start, -5);

  const [fred, fomc, yahoo] = await Promise.all([
    fetchFredIndicators(start, end),
    fetchFomcMeetings(start, end),
    fetchYahooEarnings(earningsStart, end),
  ]);

  let events: CalendarEvent[] = [...fred, ...fomc, ...yahoo];

  // 동일 (market + date + name + category) 중복 제거
  //   (같은 종목이 여러 소스로 중복 유입되는 경우 1개만 남김)
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
