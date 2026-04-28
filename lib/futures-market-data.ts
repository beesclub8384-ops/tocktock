import YahooFinance from "yahoo-finance2";
import { fetchKosp200FuturesMinutes } from "./kis-client.ts";
import { loadDynamicSymbols, loadMarketData } from "./futures-trading-store.ts";

const yahooFinance = new YahooFinance();

export const KOSP200F_SYMBOL = "KOSP200F";

export const MARKET_SYMBOLS = [
  "005930.KS", // 삼성전자
  "000660.KS", // SK하이닉스
  KOSP200F_SYMBOL, // 코스피200 선물 근월물 (KIS)
  "ES=F", // S&P500 선물
  "DX-Y.NYB", // ICE 달러 인덱스
] as const;

export type MarketSymbol = (typeof MARKET_SYMBOLS)[number];

export interface MinuteCandle {
  time: string; // ISO timestamp (UTC)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SymbolBars {
  candles1m: MinuteCandle[];
  candles3m: MinuteCandle[];
}

export interface MarketDataForDay {
  date: string; // YYYY-MM-DD
  fetchedAt: string; // ISO timestamp
  symbols: Record<string, SymbolBars>;
}

interface RawQuote {
  date: Date | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

/** 1분봉 배열을 3개씩 묶어 3분봉 합성 */
export function aggregate3m(candles1m: MinuteCandle[]): MinuteCandle[] {
  const out: MinuteCandle[] = [];
  for (let i = 0; i + 2 < candles1m.length; i += 3) {
    const a = candles1m[i];
    const b = candles1m[i + 1];
    const c = candles1m[i + 2];
    out.push({
      time: a.time,
      open: a.open,
      high: Math.max(a.high, b.high, c.high),
      low: Math.min(a.low, b.low, c.low),
      close: c.close,
      volume: (a.volume ?? 0) + (b.volume ?? 0) + (c.volume ?? 0),
    });
  }
  return out;
}

/** Yahoo Finance 1분봉 → MinuteCandle 정규화. null 포함 캔들 제외 */
function normalize(quotes: RawQuote[]): MinuteCandle[] {
  const out: MinuteCandle[] = [];
  for (const q of quotes) {
    if (!q.date || q.open == null || q.high == null || q.low == null || q.close == null) {
      continue;
    }
    out.push({
      time: q.date.toISOString(),
      open: q.open,
      high: q.high,
      low: q.low,
      close: q.close,
      volume: q.volume ?? 0,
    });
  }
  return out;
}

async function fetchYahooMinutes(symbol: string, date: string): Promise<MinuteCandle[]> {
  const start = new Date(`${date}T00:00:00Z`);
  const end = new Date(`${date}T23:59:59Z`);
  const res = await yahooFinance.chart(symbol, { period1: start, period2: end, interval: "1m" });
  const quotes = (res.quotes ?? []) as RawQuote[];
  return normalize(quotes);
}

/** 특정 날짜(YYYY-MM-DD)의 모든 심볼 1분봉 + 3분봉 수집 (정적 + 동적).
 *  Redis에 이미 해당 심볼 데이터(candles1m.length > 0)가 있으면 재수집하지 않고 보존한다. */
export async function fetchMarketDataForDate(date: string): Promise<MarketDataForDay> {
  const symbols: Record<string, SymbolBars> = {};

  // 기존 Redis 데이터 — 심볼별 보존 판단용
  let existing: MarketDataForDay | null = null;
  try {
    existing = await loadMarketData(date);
  } catch (err) {
    console.error("[futures-market-data] loadMarketData failed:", err instanceof Error ? err.message : err);
  }
  const hasExisting = (sym: string): boolean =>
    !!(existing && existing.symbols[sym] && existing.symbols[sym].candles1m.length > 0);

  // 정적 심볼 (Yahoo + KOSP200F)
  await Promise.all(
    MARKET_SYMBOLS.map(async (symbol) => {
      if (hasExisting(symbol)) {
        symbols[symbol] = existing!.symbols[symbol];
        return;
      }
      try {
        if (symbol === KOSP200F_SYMBOL) {
          const candles1m = await fetchKosp200FuturesMinutes(date);
          symbols[symbol] = { candles1m, candles3m: aggregate3m(candles1m) };
          return;
        }
        const candles1m = await fetchYahooMinutes(symbol, date);
        symbols[symbol] = { candles1m, candles3m: aggregate3m(candles1m) };
      } catch (err) {
        console.error(`[futures-market-data] ${symbol} fetch failed:`, err instanceof Error ? err.message : err);
        symbols[symbol] = { candles1m: [], candles3m: [] };
      }
    })
  );

  // 동적 심볼 (메모/댓글에서 자동 감지된 추가 수집 대상)
  let dynamic: Awaited<ReturnType<typeof loadDynamicSymbols>> = [];
  try {
    dynamic = await loadDynamicSymbols();
  } catch (err) {
    console.error("[futures-market-data] loadDynamicSymbols failed:", err instanceof Error ? err.message : err);
  }
  await Promise.all(
    dynamic.map(async (dyn) => {
      // 정적 심볼과 충돌하면 스킵 (정적 우선)
      if (symbols[dyn.symbol]) return;
      if (hasExisting(dyn.symbol)) {
        symbols[dyn.symbol] = existing!.symbols[dyn.symbol];
        return;
      }
      try {
        if (dyn.source === "kis" || dyn.symbol.startsWith("KIS:")) {
          // 임의 KIS 종목코드는 아직 지원하지 않음 — 빈 배열로 자리만 마련
          symbols[dyn.symbol] = { candles1m: [], candles3m: [] };
          return;
        }
        const candles1m = await fetchYahooMinutes(dyn.symbol, date);
        symbols[dyn.symbol] = { candles1m, candles3m: aggregate3m(candles1m) };
      } catch (err) {
        console.error(`[futures-market-data] dynamic ${dyn.symbol} fetch failed:`, err instanceof Error ? err.message : err);
        symbols[dyn.symbol] = { candles1m: [], candles3m: [] };
      }
    })
  );

  // 기존에 있었지만 이번에 다시 수집되지 않은 심볼도 보존 (예: 동적 심볼 목록에서 빠진 경우)
  if (existing) {
    for (const [sym, bars] of Object.entries(existing.symbols)) {
      if (!symbols[sym] && bars.candles1m.length > 0) {
        symbols[sym] = bars;
      }
    }
  }

  return {
    date,
    fetchedAt: new Date().toISOString(),
    symbols,
  };
}

/** entryTime(HH:MM, KST) ± windowMinutes 범위에 속한 캔들만 추출 */
export function sliceAroundEntry(
  candles: MinuteCandle[],
  date: string,
  entryTimeKst: string,
  windowMinutes = 30
): MinuteCandle[] {
  if (!/^\d{2}:\d{2}$/.test(entryTimeKst)) return candles;
  const [hh, mm] = entryTimeKst.split(":").map(Number);
  // KST = UTC+9 → UTC 시각으로 환산
  const entryUtc = new Date(`${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+09:00`);
  const ms = windowMinutes * 60 * 1000;
  const lo = entryUtc.getTime() - ms;
  const hi = entryUtc.getTime() + ms;
  return candles.filter((c) => {
    const t = new Date(c.time).getTime();
    return t >= lo && t <= hi;
  });
}

/** 데이터 "있음" 판정: 최소 한 심볼이라도 캔들이 있으면 있음으로 본다 */
export function hasAnyData(d: MarketDataForDay | null): boolean {
  if (!d) return false;
  return Object.values(d.symbols).some((s) => s.candles1m.length > 0);
}
