/**
 * 순환매 점검 — 가격 수집·대조·저장.
 *
 * 수집 순서 (시리즈마다):
 *   1) 네이버 일별 시세(siseJson)로 후보 1번(업종 ETF)을 받는다.
 *   2) 안 되면 후보 2번(대표 종목)을 네이버로 받는다.
 *   3) 네이버가 전부 안 되면 야후(yahoo-finance2)로 같은 순서로 받는다.
 *   4) 네이버로 받았으면 야후 값과 날짜별 종가를 대조해 결과를 남긴다(화면에 표시).
 *
 * 날짜·시간: 모든 날짜는 KST 'YYYY-MM-DD'. 장 마감(15:30) 뒤 여유를 두어 15:40 전에는
 * 당일 값을 버린다 — 장중 값을 종가처럼 쓰지 않기 위해서다.
 *
 * 조용한 실패 방지:
 *   - 코스피·기준 업종(반도체)을 못 받으면 저장하지 않고 오류를 던진다(이전 저장값 유지).
 *   - 기준일이 오늘에서 10일 넘게 떨어져 있으면 저장하지 않는다.
 *   - 시리즈의 마지막 날짜가 기준일보다 5일 넘게 뒤처지면 그 시리즈에 "갱신 지연"을 표시한다.
 *
 * 계산 규칙은 lib/rotation-core.ts, 검증은 scripts/verify-rotation.mjs.
 */
import YahooFinance from "yahoo-finance2";
import { redis } from "@/lib/redis";
import {
  buildSinceChart,
  closedThrough,
  computeRotation,
  crossCheck,
  dedupeSorted,
  kstDate,
  parseSiseJson,
  toCoreInput,
  type CheckStatus,
  type CrossCheckResult,
  type DailyPoint,
  type RotationResult,
  type SinceChart,
} from "@/lib/rotation-core";

export { kstDate };
export type { CheckStatus };

export const ROTATION_KEY = "rotation:data";
// 저장 형식·대조 기준이 바뀌면 올린다 → 이전 저장값을 무시하고 새로 만든다 (5: 출발선부터의 긴 흐름 추가)
export const ROTATION_VERSION = 5;

/**
 * 긴 흐름 차트의 출발선(0%). 날짜를 고정한다 — 매일 움직이면 볼 때마다 숫자가 달라지기 때문이다.
 *
 * 고른 기준 (2026-11-27 사용자와 정함): "불장이 오기 전, 시장이 가장 조용했던 때".
 * 조용함은 세 숫자로 봤다 — 거래대금, 하루 등락 크기, 예탁금.
 *  - 거래대금(코스피+코스닥 일평균, 한국거래소): 2024-07 19.5조원 → 09 16.7조원 → 10 15.8조원.
 *    11월 17.7조원, 12월 15.3조원(계엄 급락 포함), 2025-01 16.6조원, 02 21.1조원으로 깨어남.
 *  - 예탁금(금융투자협회): 2024-10-30 에 49.6조원 — 그해 1월 26일 이후 최저.
 *  - 하루 등락 크기(일간 등락률 표준편차, 일별 종가로 직접 계산): 2024-09~2025-02 의 20거래일 구간 가운데
 *    2024-10-02~10-31 이 코스피 0.86%·코스닥 1.11% 로 두 지수 평균이 가장 낮았다.
 * 세 숫자가 함께 바닥이던 달이 2024년 10월이라 그 달의 마지막 거래일을 출발선으로 삼았다.
 *
 * 견줘 본 다른 날: 2024-12-30(2024년 마지막 거래일 — 12월 하순~1월도 등락은 0.85% 로 조용했지만
 * 계엄 급락 뒤이고, 조선 ETF 가 11~12월에 이미 28% 오른 구간이 잘린다), 2025-05(대체거래소를 합치면
 * 거래대금 20.5조원으로 덜 조용했다).
 *
 * 바꿀 때는 근거 숫자를 다시 확인하고 화면(app/sector-flow/page.tsx)의 설명도 같이 고친다.
 */
export const FLOW_BASE_DATE = "2024-10-31";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

const NAVER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "ko-KR,ko;q=0.9",
};

export type InstrumentKind = "지수" | "ETF" | "종목";

interface Candidate {
  /** 네이버 siseJson symbol (종목코드 6자리 또는 KOSPI·KOSDAQ) */
  naver: string;
  /** 야후 심볼 */
  yahoo: string;
  name: string;
  kind: InstrumentKind;
}

/** 업종 묶음 — 화면에서 표를 이 순서로 나눠 보여 준다 */
export const SECTOR_CATEGORIES = ["지수", "기술·성장", "산업재", "금융", "소비·콘텐츠"] as const;
export type SectorCategory = (typeof SECTOR_CATEGORIES)[number];

export interface SeriesConfig {
  key: string;
  /** 화면에 쓰는 업종 이름 */
  label: string;
  group: "지수" | "업종";
  category: SectorCategory;
  candidates: Candidate[];
}

const etf = (code: string, name: string): Candidate => ({ naver: code, yahoo: `${code}.KS`, name, kind: "ETF" });
/** 대표 종목. 코스닥 종목은 야후 심볼 끝이 .KQ 라 market 으로 구분한다 */
const stock = (code: string, name: string, market: "KS" | "KQ" = "KS"): Candidate => ({
  naver: code,
  yahoo: `${code}.${market}`,
  name,
  kind: "종목",
});

/**
 * 시리즈 목록. 업종은 대표 ETF 가격으로 본다(업종지수가 아니다).
 * ETF 를 먼저 받고, 안 되면 대표 종목 한 개로 대신한다(후보가 둘인 업종).
 * ETF 코드는 2026-11-27 에 운용사 공지·ETF 정보 사이트로 이름을 확인했다.
 *
 * 업종 고르는 기준 (2026-11-27 사용자와 정함):
 *  1) 최근 3년 사이 한 번이라도 주도 업종으로 꼽혔던 업종은 넣는다 (원전·운송·로봇 추가)
 *  2) 시가총액이 큰 업종은 빠짐없이 넣는다 (인터넷·통신, 철강, 화학 추가)
 *  3) 휴대폰에서 읽을 수 있게 업종은 20개 안팎으로 둔다
 */
export const ROTATION_SERIES: SeriesConfig[] = [
  { key: "kospi", label: "코스피", group: "지수", category: "지수", candidates: [{ naver: "KOSPI", yahoo: "^KS11", name: "코스피 지수", kind: "지수" }] },
  { key: "kosdaq", label: "코스닥", group: "지수", category: "지수", candidates: [{ naver: "KOSDAQ", yahoo: "^KQ11", name: "코스닥 지수", kind: "지수" }] },
  // 기술·성장
  { key: "semi", label: "반도체", group: "업종", category: "기술·성장", candidates: [etf("091160", "KODEX 반도체")] },
  { key: "battery", label: "2차전지", group: "업종", category: "기술·성장", candidates: [etf("305720", "KODEX 2차전지산업")] },
  { key: "power", label: "전력기기", group: "업종", category: "기술·성장", candidates: [etf("487240", "KODEX AI전력핵심설비")] },
  { key: "nuclear", label: "원전", group: "업종", category: "기술·성장", candidates: [etf("434730", "HANARO 원자력iSelect"), stock("034020", "두산에너빌리티")] },
  { key: "robot", label: "로봇", group: "업종", category: "기술·성장", candidates: [etf("445290", "KODEX 로봇액티브"), stock("277810", "레인보우로보틱스", "KQ")] },
  { key: "internet", label: "인터넷·통신", group: "업종", category: "기술·성장", candidates: [etf("315270", "TIGER 200커뮤니케이션서비스"), stock("035420", "NAVER")] },
  { key: "bio", label: "바이오", group: "업종", category: "기술·성장", candidates: [etf("244580", "KODEX 바이오"), stock("068270", "셀트리온")] },
  // 산업재
  { key: "ship", label: "조선", group: "업종", category: "산업재", candidates: [etf("466920", "SOL 조선TOP3플러스")] },
  { key: "defense", label: "방산", group: "업종", category: "산업재", candidates: [etf("463250", "TIGER K방산&우주")] },
  { key: "build", label: "건설", group: "업종", category: "산업재", candidates: [etf("117700", "KODEX 건설")] },
  { key: "transport", label: "운송", group: "업종", category: "산업재", candidates: [etf("140710", "KODEX 운송"), stock("011200", "HMM")] },
  { key: "auto", label: "자동차", group: "업종", category: "산업재", candidates: [etf("091180", "KODEX 자동차"), stock("005380", "현대차")] },
  { key: "steel", label: "철강", group: "업종", category: "산업재", candidates: [etf("117680", "KODEX 철강"), stock("005490", "POSCO홀딩스")] },
  { key: "chem", label: "화학·정유", group: "업종", category: "산업재", candidates: [etf("117460", "KODEX 에너지화학"), stock("051910", "LG화학")] },
  // 금융
  { key: "bank", label: "은행", group: "업종", category: "금융", candidates: [etf("091170", "KODEX 은행"), stock("105560", "KB금융")] },
  { key: "broker", label: "증권", group: "업종", category: "금융", candidates: [etf("102970", "KODEX 증권")] },
  { key: "insure", label: "보험", group: "업종", category: "금융", candidates: [etf("140700", "KODEX 보험")] },
  // 소비·콘텐츠
  { key: "beauty", label: "화장품", group: "업종", category: "소비·콘텐츠", candidates: [etf("228790", "TIGER 화장품"), stock("278470", "에이피알")] },
  { key: "ent", label: "엔터", group: "업종", category: "소비·콘텐츠", candidates: [etf("475050", "ACE KPOP포커스"), stock("352820", "하이브")] },
  { key: "staples", label: "필수소비재", group: "업종", category: "소비·콘텐츠", candidates: [etf("266410", "KODEX 필수소비재"), stock("033780", "KT&G")] },
];

export const ROTATION_BASE_KEY = "semi";
export const ROTATION_MARKET_KEY = "kospi";
export const ROTATION_TARGET_KEYS = ["ship", "defense"];

export interface InstrumentInfo {
  key: string;
  label: string;
  group: "지수" | "업종";
  category: SectorCategory;
  kind: InstrumentKind;
  /** 실제로 받은 상품·종목 이름 */
  name: string;
  code: string;
  /** 실제로 쓴 출처 */
  source: "네이버" | "야후";
  /** ETF 를 못 받아 대표 종목으로 대신했나 */
  fallback: boolean;
  firstDate: string;
  lastDate: string;
  /** 마지막 날짜가 기준일보다 5일 넘게 뒤처졌나 */
  stale: boolean;
  check: CrossCheckResult;
}

export interface RotationSnapshot {
  version: number;
  /** 계산한 시각 (ISO, UTC) */
  builtAt: string;
  asOf: string;
  result: RotationResult;
  instruments: InstrumentInfo[];
  /** 출발선(FLOW_BASE_DATE)부터의 긴 흐름. 출발선 자료를 못 받았으면 base = null */
  since: SinceChart;
  /** 수집 중 생긴 문제(받지 못한 후보 등) */
  notes: string[];
}

/* ───────────────────────── 수집 ───────────────────────── */

const HISTORY_DAYS = 1160; // 약 38개월 (36개 월말 + 여유)
const BASE_MARGIN_DAYS = 14; // 출발선 앞으로 더 받는 날 수 (출발선 당일 종가를 확실히 포함하려고)
const MIN_ROWS = 40;

function ymd(d: string): string {
  return d.replace(/-/g, "");
}

async function fetchNaver(symbol: string, start: string, end: string): Promise<DailyPoint[]> {
  const url = `https://api.finance.naver.com/siseJson.naver?symbol=${encodeURIComponent(symbol)}&requestType=1&startTime=${ymd(start)}&endTime=${ymd(end)}&timeframe=day`;
  const res = await fetch(url, { headers: NAVER_HEADERS, signal: AbortSignal.timeout(12_000), cache: "no-store" });
  if (!res.ok) throw new Error(`네이버 ${symbol} HTTP ${res.status}`);
  return parseSiseJson(await res.text());
}

/**
 * 야후 일봉.
 *  adjusted=true  → 분배금·배당을 반영한 수정종가(adjclose). 네이버 siseJson 과 같은 기준이라 대조에 쓴다.
 *  adjusted=false → 거래소 종가 그대로(close).
 *
 * ⚠ 2026-11-27 미리보기 배포에서 확인: 네이버 siseJson 의 ETF 종가는 분배금을 반영한 수정주가다.
 *   (KODEX 보험: 네이버가 야후 close 와 최대 12.90% 달랐고, 야후 adjclose 와 close 의 차이도 2023-12 기준 12.9%)
 *   그래서 대조는 야후 adjclose 와 해야 한다. close 와 비교하면 분배금이 있는 ETF 는 전부 "불일치"가 된다.
 */
async function fetchYahoo(symbol: string, start: string, adjusted: boolean): Promise<DailyPoint[]> {
  const r = (await yf.chart(symbol, { period1: new Date(`${start}T00:00:00Z`), interval: "1d" })) as {
    quotes?: { date: Date; close: number | null; adjclose?: number | null }[];
  };
  const out: DailyPoint[] = [];
  for (const q of r.quotes ?? []) {
    const v = adjusted ? (q.adjclose ?? q.close) : q.close;
    if (v === null || v === undefined || !Number.isFinite(v) || v <= 0) continue;
    // 야후의 한국 일봉 시각은 장 시작(KST 09:00 = UTC 00:00). KST 날짜로 바꾼다.
    out.push({ date: kstDate(new Date(q.date)), close: v });
  }
  return dedupeSorted(out);
}

async function tryFetch(fn: () => Promise<DailyPoint[]>): Promise<{ pts: DailyPoint[]; error: string | null }> {
  try {
    const pts = await fn();
    return { pts, error: null };
  } catch (e) {
    return { pts: [], error: e instanceof Error ? e.message : String(e) };
  }
}

interface Fetched {
  cfg: SeriesConfig;
  cand: Candidate;
  candIdx: number;
  source: "네이버" | "야후";
  pts: DailyPoint[];
  other: DailyPoint[];
}

async function fetchSeries(cfg: SeriesConfig, start: string, limit: string, notes: string[]): Promise<Fetched | null> {
  const clip = (pts: DailyPoint[]) => pts.filter((p) => p.date <= limit);
  // 1·2) 네이버로 후보 순서대로
  for (let i = 0; i < cfg.candidates.length; i++) {
    const c = cfg.candidates[i];
    const r = await tryFetch(() => fetchNaver(c.naver, start, limit));
    const pts = clip(r.pts);
    if (pts.length >= MIN_ROWS) {
      const y = await tryFetch(() => fetchYahoo(c.yahoo, start, true));
      if (y.error) notes.push(`${cfg.label}: 야후 대조 실패 (${c.name})`);
      return { cfg, cand: c, candIdx: i, source: "네이버", pts, other: clip(y.pts) };
    }
    notes.push(`${cfg.label}: 네이버에서 ${c.name}(${c.naver})을 받지 못했습니다${r.error ? ` — ${r.error}` : ` — ${pts.length}행`}`);
  }
  // 3) 야후로 후보 순서대로
  for (let i = 0; i < cfg.candidates.length; i++) {
    const c = cfg.candidates[i];
    // 네이버와 같은 기준(분배금 반영)으로 맞추려고 수정종가를 쓴다
    const r = await tryFetch(() => fetchYahoo(c.yahoo, start, true));
    const pts = clip(r.pts);
    if (pts.length >= MIN_ROWS) return { cfg, cand: c, candIdx: i, source: "야후", pts, other: [] };
    notes.push(`${cfg.label}: 야후에서도 ${c.name}(${c.yahoo})을 받지 못했습니다`);
  }
  return null;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** 가격을 받아 계산한다. 저장은 하지 않는다. */
export async function buildRotationSnapshot(now: Date = new Date()): Promise<RotationSnapshot> {
  const limit = closedThrough(now);
  const byHistory = new Date(Date.parse(`${limit}T00:00:00Z`) - HISTORY_DAYS * 86400000).toISOString().slice(0, 10);
  const byBase = new Date(Date.parse(`${FLOW_BASE_DATE}T00:00:00Z`) - BASE_MARGIN_DAYS * 86400000).toISOString().slice(0, 10);
  // 출발선은 고정이라 시간이 지나면 38개월 밖으로 밀려난다 — 그때도 출발선까지는 항상 받는다
  const start = byHistory < byBase ? byHistory : byBase;
  const notes: string[] = [];

  const fetched = await mapLimit(ROTATION_SERIES, 4, (cfg) => fetchSeries(cfg, start, limit, notes));
  const ok = fetched.filter((f): f is Fetched => f !== null);
  const byKey = new Map(ok.map((f) => [f.cfg.key, f]));

  const market = byKey.get(ROTATION_MARKET_KEY);
  const base = byKey.get(ROTATION_BASE_KEY);
  if (!market) throw new Error("코스피 지수를 받지 못했습니다 — 저장하지 않음");
  if (!base || base.pts.length < 250) throw new Error("기준 업종(반도체) 자료가 부족합니다 — 저장하지 않음");

  const asOf = market.pts[market.pts.length - 1].date;
  if (daysBetween(asOf, kstDate(now)) > 10) throw new Error(`기준일(${asOf})이 너무 오래됐습니다 — 저장하지 않음`);

  for (const cfg of ROTATION_SERIES) {
    if (!byKey.has(cfg.key)) notes.push(`${cfg.label}: 어느 출처에서도 받지 못해 화면에서 뺐습니다`);
  }

  const series: Record<string, DailyPoint[]> = {};
  for (const f of ok) series[f.cfg.key] = f.pts;
  const input = toCoreInput(series, ROTATION_MARKET_KEY, asOf);
  const order = ROTATION_SERIES.filter((c) => byKey.has(c.key)).map((c) => c.key);
  const result = computeRotation(input, {
    baseKey: ROTATION_BASE_KEY,
    marketKey: ROTATION_MARKET_KEY,
    targetKeys: ROTATION_TARGET_KEYS.filter((k) => byKey.has(k)),
    indexKeys: ROTATION_SERIES.filter((c) => c.group === "지수").map((c) => c.key),
    order,
  });

  // ── 출발선부터의 긴 흐름 ──
  const since = buildSinceChart(series, ROTATION_MARKET_KEY, FLOW_BASE_DATE, asOf, order);
  if (since.base === null) {
    notes.push(`출발선(${FLOW_BASE_DATE}) 자료를 받지 못해 긴 흐름 차트를 뺐습니다`);
  } else {
    if (since.base !== FLOW_BASE_DATE) notes.push(`출발선 ${FLOW_BASE_DATE} 이 거래일이 아니어서 ${since.base} 종가를 0% 로 삼았습니다`);
    for (const s of since.series) {
      if (s.values[0] !== null) continue;
      const f = byKey.get(s.key);
      if (f) notes.push(`${f.cfg.label}: 출발선(${since.base}) 뒤에 자료가 시작돼(${f.pts[0].date}) 긴 흐름 차트에서 빠집니다`);
    }
  }

  // 화면에 "최근 8주 안"으로 표시하므로 8주 창의 기준점부터 센다 (60거래일 전체가 아님)
  const recentFrom = result.windowBase ?? input.days[0];
  const instruments: InstrumentInfo[] = ok.map((f) => {
    const lastDate = f.pts[f.pts.length - 1].date;
    return {
      key: f.cfg.key,
      label: f.cfg.label,
      group: f.cfg.group,
      category: f.cfg.category,
      kind: f.cand.kind,
      name: f.cand.name,
      code: f.cand.naver,
      source: f.source,
      fallback: f.candIdx > 0,
      firstDate: f.pts[0].date,
      lastDate,
      stale: daysBetween(lastDate, asOf) > 5,
      check:
        f.source === "네이버"
          ? crossCheck(f.pts, f.other, recentFrom)
          : { status: "대조 못 함", compared: 0, mismatched: 0, maxDiffPct: null, returnMismatched: 0, recentMismatched: 0 },
    };
  });

  return { version: ROTATION_VERSION, builtAt: now.toISOString(), asOf, result, instruments, since, notes };
}

export async function getRotationSnapshot(): Promise<RotationSnapshot | null> {
  // Upstash 자동 역직렬화 — JSON.parse 금지
  const data = await redis.get<RotationSnapshot>(ROTATION_KEY);
  if (!data || data.version !== ROTATION_VERSION) return null;
  return data;
}

export async function saveRotationSnapshot(snap: RotationSnapshot): Promise<void> {
  // Upstash 자동 직렬화 — JSON.stringify 금지
  await redis.set(ROTATION_KEY, snap);
}
