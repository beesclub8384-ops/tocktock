import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { redis } from "@/lib/redis";

const yahooFinance = new YahooFinance();

// 영업일 계산 (주말 건너뛰기)
function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface IndicatorResult {
  name: string;
  d1: number | null;
  d3: number | null;
  d5: number | null;
}

async function fetchYahooClose(symbol: string, dates: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const minDate = dates.reduce((a, b) => (a < b ? a : b));
    const maxDate = dates.reduce((a, b) => (a > b ? a : b));
    const start = new Date(minDate);
    start.setDate(start.getDate() - 3); // 여유
    const end = new Date(maxDate);
    end.setDate(end.getDate() + 3);

    const result = await yahooFinance.chart(symbol, {
      period1: toDateStr(start),
      period2: toDateStr(end),
      interval: "1d",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const q of result.quotes as any[]) {
      if (q.date && q.close != null) {
        const d = new Date(q.date).toISOString().slice(0, 10);
        map.set(d, Number(q.close));
      }
    }
  } catch (err) {
    console.error(`[market-reaction] Yahoo ${symbol} error:`, err);
  }
  return map;
}

async function fetchFredClose(seriesId: string, dates: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return map;

  try {
    const minDate = dates.reduce((a, b) => (a < b ? a : b));
    const maxDate = dates.reduce((a, b) => (a > b ? a : b));
    const start = new Date(minDate);
    start.setDate(start.getDate() - 5);

    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${toDateStr(start)}&observation_end=${maxDate}&sort_order=asc`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return map;

    const data = await res.json();
    for (const obs of data.observations || []) {
      if (obs.value !== ".") {
        map.set(obs.date, parseFloat(obs.value));
      }
    }
  } catch (err) {
    console.error(`[market-reaction] FRED ${seriesId} error:`, err);
  }
  return map;
}

// 가장 가까운 이전 영업일의 종가 찾기
function findClose(map: Map<string, number>, dateStr: string): number | null {
  // 정확히 해당 날짜
  if (map.has(dateStr)) return map.get(dateStr)!;
  // 1~3일 전까지 탐색 (공휴일 대응)
  const d = new Date(dateStr);
  for (let i = 1; i <= 3; i++) {
    d.setDate(d.getDate() - 1);
    const prev = toDateStr(d);
    if (map.has(prev)) return map.get(prev)!;
  }
  return null;
}

function calcChange(base: number | null, target: number | null): number | null {
  if (base === null || target === null || base === 0) return null;
  return Number(((target - base) / base * 100).toFixed(2));
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const date = searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date parameter required (YYYY-MM-DD)" }, { status: 400 });
  }

  try {
    // 캐시 확인
    const cacheKey = `market-reaction:${date}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const baseDate = new Date(date);
    const d1 = addBusinessDays(baseDate, 1);
    const d3 = addBusinessDays(baseDate, 3);
    const d5 = addBusinessDays(baseDate, 5);
    const allDates = [date, toDateStr(d1), toDateStr(d3), toDateStr(d5)];

    // 데이터 동시 수집
    const [sp500, kospi, dxy, usdjpy, gold, sofr] = await Promise.allSettled([
      fetchYahooClose("^GSPC", allDates),
      fetchYahooClose("^KS11", allDates),
      fetchYahooClose("DX-Y.NYB", allDates),
      fetchYahooClose("JPY=X", allDates),
      fetchYahooClose("GC=F", allDates),
      fetchFredClose("SOFR", allDates),
    ]);

    function buildIndicator(name: string, result: PromiseSettledResult<Map<string, number>>): IndicatorResult {
      if (result.status !== "fulfilled") return { name, d1: null, d3: null, d5: null };
      const map = result.value;
      const base = findClose(map, date!);
      return {
        name,
        d1: calcChange(base, findClose(map, toDateStr(d1))),
        d3: calcChange(base, findClose(map, toDateStr(d3))),
        d5: calcChange(base, findClose(map, toDateStr(d5))),
      };
    }

    const responseData = {
      date,
      indicators: {
        sp500: buildIndicator("S&P500", sp500),
        kospi: buildIndicator("KOSPI", kospi),
        dxy: buildIndicator("DXY", dxy),
        usdjpy: buildIndicator("달러/엔", usdjpy),
        gold: buildIndicator("금", gold),
        sofr: buildIndicator("SOFR", sofr),
      },
    };

    // 캐시 저장 (7일 이전 데이터는 30일, 최근은 1시간)
    const daysDiff = (Date.now() - baseDate.getTime()) / (1000 * 60 * 60 * 24);
    const ttl = daysDiff > 7 ? 86400 * 30 : 3600;
    try {
      await redis.set(cacheKey, responseData, { ex: ttl });
    } catch { /* ok */ }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("[market-reaction] API error:", error);
    return NextResponse.json({ error: "Failed to fetch market reaction" }, { status: 500 });
  }
}
