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
} from "@/lib/rotation-core";

export { kstDate };
export type { CheckStatus };

export const ROTATION_KEY = "rotation:data";
export const ROTATION_VERSION = 1;

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

export interface SeriesConfig {
  key: string;
  /** 화면에 쓰는 업종 이름 */
  label: string;
  group: "지수" | "업종";
  candidates: Candidate[];
}

const etf = (code: string, name: string): Candidate => ({ naver: code, yahoo: `${code}.KS`, name, kind: "ETF" });
const stock = (code: string, name: string): Candidate => ({ naver: code, yahoo: `${code}.KS`, name, kind: "종목" });

/**
 * 시리즈 목록. 업종은 대표 ETF 가격으로 본다(업종지수가 아니다).
 * 뒤 6개 업종은 ETF 를 먼저 받고, 안 되면 대표 종목 한 개로 대신한다.
 * ETF 코드는 2026-11-27 에 운용사·ETF 정보 사이트로 이름을 확인했다.
 */
export const ROTATION_SERIES: SeriesConfig[] = [
  { key: "kospi", label: "코스피", group: "지수", candidates: [{ naver: "KOSPI", yahoo: "^KS11", name: "코스피 지수", kind: "지수" }] },
  { key: "kosdaq", label: "코스닥", group: "지수", candidates: [{ naver: "KOSDAQ", yahoo: "^KQ11", name: "코스닥 지수", kind: "지수" }] },
  { key: "semi", label: "반도체", group: "업종", candidates: [etf("091160", "KODEX 반도체")] },
  { key: "ship", label: "조선", group: "업종", candidates: [etf("466920", "SOL 조선TOP3플러스")] },
  { key: "defense", label: "방산", group: "업종", candidates: [etf("463250", "TIGER K방산&우주")] },
  { key: "power", label: "전력기기", group: "업종", candidates: [etf("487240", "KODEX AI전력핵심설비")] },
  { key: "battery", label: "2차전지", group: "업종", candidates: [etf("305720", "KODEX 2차전지산업")] },
  { key: "broker", label: "증권", group: "업종", candidates: [etf("102970", "KODEX 증권")] },
  { key: "build", label: "건설", group: "업종", candidates: [etf("117700", "KODEX 건설")] },
  { key: "insure", label: "보험", group: "업종", candidates: [etf("140700", "KODEX 보험")] },
  { key: "bank", label: "은행", group: "업종", candidates: [etf("091170", "KODEX 은행"), stock("105560", "KB금융")] },
  { key: "auto", label: "자동차", group: "업종", candidates: [etf("091180", "KODEX 자동차"), stock("005380", "현대차")] },
  { key: "bio", label: "바이오", group: "업종", candidates: [etf("244580", "KODEX 바이오"), stock("068270", "셀트리온")] },
  { key: "beauty", label: "화장품", group: "업종", candidates: [etf("228790", "TIGER 화장품"), stock("278470", "에이피알")] },
  { key: "ent", label: "엔터", group: "업종", candidates: [etf("475050", "ACE KPOP포커스"), stock("352820", "하이브")] },
  { key: "staples", label: "필수소비재", group: "업종", candidates: [etf("266410", "KODEX 필수소비재"), stock("033780", "KT&G")] },
];

export const ROTATION_BASE_KEY = "semi";
export const ROTATION_MARKET_KEY = "kospi";
export const ROTATION_TARGET_KEYS = ["ship", "defense"];

export interface InstrumentInfo {
  key: string;
  label: string;
  group: "지수" | "업종";
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
  /** 수집 중 생긴 문제(받지 못한 후보 등) */
  notes: string[];
}

/* ───────────────────────── 수집 ───────────────────────── */

const HISTORY_DAYS = 1160; // 약 38개월 (36개 월말 + 여유)
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

async function fetchYahoo(symbol: string, start: string): Promise<DailyPoint[]> {
  const r = (await yf.chart(symbol, { period1: new Date(`${start}T00:00:00Z`), interval: "1d" })) as {
    quotes?: { date: Date; close: number | null }[];
  };
  const out: DailyPoint[] = [];
  for (const q of r.quotes ?? []) {
    if (q.close === null || q.close === undefined || !Number.isFinite(q.close) || q.close <= 0) continue;
    // 야후의 한국 일봉 시각은 장 시작(KST 09:00 = UTC 00:00). KST 날짜로 바꾼다.
    out.push({ date: kstDate(new Date(q.date)), close: q.close });
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
      const y = await tryFetch(() => fetchYahoo(c.yahoo, start));
      if (y.error) notes.push(`${cfg.label}: 야후 대조 실패 (${c.name})`);
      return { cfg, cand: c, candIdx: i, source: "네이버", pts, other: clip(y.pts) };
    }
    notes.push(`${cfg.label}: 네이버에서 ${c.name}(${c.naver})을 받지 못했습니다${r.error ? ` — ${r.error}` : ` — ${pts.length}행`}`);
  }
  // 3) 야후로 후보 순서대로
  for (let i = 0; i < cfg.candidates.length; i++) {
    const c = cfg.candidates[i];
    const r = await tryFetch(() => fetchYahoo(c.yahoo, start));
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
  const start = new Date(Date.parse(`${limit}T00:00:00Z`) - HISTORY_DAYS * 86400000).toISOString().slice(0, 10);
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

  const recentFrom = input.days[0];
  const instruments: InstrumentInfo[] = ok.map((f) => {
    const lastDate = f.pts[f.pts.length - 1].date;
    return {
      key: f.cfg.key,
      label: f.cfg.label,
      group: f.cfg.group,
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
          : { status: "대조 못 함", compared: 0, mismatched: 0, maxDiffPct: null, recentMismatched: 0 },
    };
  });

  return { version: ROTATION_VERSION, builtAt: now.toISOString(), asOf, result, instruments, notes };
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
