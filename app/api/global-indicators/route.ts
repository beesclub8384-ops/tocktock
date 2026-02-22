import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { fetchFredLatest, calcYoY, calcMoM } from "@/lib/fetch-fred";
import type { LiveIndicatorData } from "@/lib/types/global-indicators";

export const revalidate = 3600; // ISR: 1시간

const yahooFinance = new YahooFinance();

/* ── FRED fetchers ── */

async function fetchSimpleFred(
  id: string,
  seriesId: string
): Promise<LiveIndicatorData> {
  const obs = await fetchFredLatest(seriesId, 1);
  const val = parseFloat(obs[0].value);
  return { id, value: val, change: null, unit: "%" };
}

async function fetchWalcl(): Promise<LiveIndicatorData> {
  const obs = await fetchFredLatest("WALCL", 1);
  const val = parseFloat(obs[0].value) / 1_000_000; // millions → trillions
  return { id: "walcl", value: Math.round(val * 100) / 100, change: null, unit: "조$" };
}

async function fetchCpi(): Promise<LiveIndicatorData> {
  const obs = await fetchFredLatest("CPIAUCSL", 16);
  const yoy = calcYoY(obs);
  return {
    id: "cpi",
    value: yoy !== null ? Math.round(yoy * 10) / 10 : null,
    change: null,
    unit: "%yoy",
  };
}

async function fetchPce(): Promise<LiveIndicatorData> {
  const obs = await fetchFredLatest("PCEPI", 16);
  const yoy = calcYoY(obs);
  return {
    id: "pce",
    value: yoy !== null ? Math.round(yoy * 10) / 10 : null,
    change: null,
    unit: "%yoy",
  };
}

async function fetchNfp(): Promise<LiveIndicatorData> {
  const obs = await fetchFredLatest("PAYEMS", 4);
  const mom = calcMoM(obs);
  // PAYEMS is in thousands; convert to 만명 (10,000s)
  const valInMan = mom !== null ? Math.round((mom / 10) * 10) / 10 : null;
  return { id: "nfp", value: valInMan, change: null, unit: "만명" };
}

/* ── Yahoo fetchers ── */

interface YahooQuoteResult {
  regularMarketPrice?: number;
  regularMarketChange?: number;
}

async function fetchYahoo(
  id: string,
  symbol: string,
  unit: string
): Promise<LiveIndicatorData> {
  const result = await yahooFinance.quote(symbol);
  const q = result as unknown as YahooQuoteResult;
  return {
    id,
    value: q.regularMarketPrice ?? null,
    change: q.regularMarketChange ?? null,
    unit,
  };
}

/* ── Main handler ── */

export async function GET() {
  const tasks: Promise<LiveIndicatorData>[] = [
    // FRED (8)
    fetchSimpleFred("us10y", "DGS10"),
    fetchSimpleFred("us02y", "DGS2"),
    fetchSimpleFred("t10y2y", "T10Y2Y"),
    fetchSimpleFred("tips", "DFII10"),
    fetchWalcl(),
    fetchCpi(),
    fetchPce(),
    fetchNfp(),
    // Yahoo (7)
    fetchYahoo("dxy", "DX-Y.NYB", "index"),
    fetchYahoo("usdkrw", "USDKRW=X", "원"),
    fetchYahoo("usdjpy", "JPY=X", "엔"),
    fetchYahoo("vix", "^VIX", "index"),
    fetchYahoo("wti", "CL=F", "$/bbl"),
    fetchYahoo("gold", "GC=F", "$/oz"),
    fetchYahoo("copper", "HG=F", "$/lb"),
  ];

  const results = await Promise.allSettled(tasks);

  const data: LiveIndicatorData[] = results
    .map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      // Extract task id from the ordered list
      const ids = [
        "us10y", "us02y", "t10y2y", "tips", "walcl",
        "cpi", "pce", "nfp",
        "dxy", "usdkrw", "usdjpy", "vix", "wti", "gold", "copper",
      ];
      console.error(`global-indicators: ${ids[i]} failed:`, r.reason);
      return { id: ids[i], value: null, change: null, unit: "" };
    });

  return NextResponse.json({
    data,
    fetchedAt: new Date().toISOString(),
  });
}
