import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

export const MARKET_SYMBOLS = [
  "005930.KS", // 삼성전자
  "000660.KS", // SK하이닉스
  "^KS200", // 코스피200 지수
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

/** 특정 날짜(YYYY-MM-DD)의 모든 심볼 1분봉 + 3분봉 수집 */
export async function fetchMarketDataForDate(date: string): Promise<MarketDataForDay> {
  const start = new Date(`${date}T00:00:00Z`);
  const end = new Date(`${date}T23:59:59Z`);

  const symbols: Record<string, SymbolBars> = {};

  // Yahoo는 1분봉을 최근 ~29일까지만 보관 → 실패 심볼은 빈 배열로 처리
  await Promise.all(
    MARKET_SYMBOLS.map(async (symbol) => {
      try {
        const res = await yahooFinance.chart(symbol, {
          period1: start,
          period2: end,
          interval: "1m",
        });
        const quotes = (res.quotes ?? []) as RawQuote[];
        const candles1m = normalize(quotes);
        symbols[symbol] = {
          candles1m,
          candles3m: aggregate3m(candles1m),
        };
      } catch (err) {
        console.error(`[futures-market-data] ${symbol} fetch failed:`, err instanceof Error ? err.message : err);
        symbols[symbol] = { candles1m: [], candles3m: [] };
      }
    })
  );

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
