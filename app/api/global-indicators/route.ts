import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { fetchFredLatest, calcYoYWithDate, calcMoM } from "@/lib/fetch-fred";
import type { LiveIndicatorData } from "@/lib/types/global-indicators";
import { isSiteOriginSeries } from "@/lib/site-source-config";
import { redis } from "@/lib/redis";

/** 타일별 마지막으로 받은 값 (미션 11) */
const LAST_GOOD_KEY = "global-indicators:last-good";

/** 이 API 가 쓰는 시리즈 (원출처: 연준 이사회 H.15·H.4.1, BLS, BEA — 미션 8) */
const FRED_IDS = ["DGS2", "T10Y2Y", "DFII10", "WALCL", "CPIAUCNS", "PCEPI", "PAYEMS"];

// 미션 8: 원출처 수집은 Redis(ETag 보관)와 no-store 요청을 써서 빌드 때 정적으로 만들 수 없다(만들면 원출처 7개가
// null 로 굳는다 — 2026-10-19 빌드에서 확인). 그래서 요청 때 실행하고, 예전 ISR 1시간 캐시는 CDN 캐시 헤더로 대신한다.
export const dynamic = "force-dynamic";
// 원출처 묶음을 새로 받는 날(H.15 4.3MB·H.4.1 9MB·BEA 36.8MB, 로컬 각 2~3초)에도 넉넉하게 (미션 8 독립 검증 지적 7)
export const maxDuration = 60;
const CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=600";

const yahooFinance = new YahooFinance();

/* ── FRED fetchers (함수 이름은 그대로, 원출처 전환 시리즈는 lib/fetch-fred.ts 에서 원출처로 받는다) ── */

/** "2026-09-01" → "2026년 9월" */
const ym = (d: string) => `${d.slice(0, 4)}년 ${Number(d.slice(5, 7))}월`;

async function fetchSimpleFred(
  id: string,
  seriesId: string
): Promise<LiveIndicatorData> {
  const obs = await fetchFredLatest(seriesId, 1);
  const val = parseFloat(obs[0].value);
  // 변화값을 받지 않으므로 기준일을 붙인다 — 예전에는 화면의 고정 문구("▲ +0.02" 등)가 실제 변화처럼 보였다 (미션 9)
  return { id, value: val, change: null, unit: "%", label: `${obs[0].date} 기준` };
}

async function fetchWalcl(): Promise<LiveIndicatorData> {
  const obs = await fetchFredLatest("WALCL", 1);
  const val = parseFloat(obs[0].value) / 1_000_000; // millions → trillions
  return { id: "walcl", value: Math.round(val * 100) / 100, change: null, unit: "조$" };
}

async function fetchCpi(): Promise<LiveIndicatorData> {
  // 비조정 CPI-U(BLS CUUR0000SA0 = FRED CPIAUCNS): BLS 가 공표하는 헤드라인 12개월 변동률("before seasonal adjustment")과
  // 같은 정의 (미션 10 — 예전에는 계절조정 CPIAUCSL. 2026-09 은 둘 다 반올림 3.7%: 비조정 3.738%, 계절조정 3.717%)
  const obs = await fetchFredLatest("CPIAUCNS", 16);
  const r = calcYoYWithDate(obs);
  const yoy = r?.value ?? null;
  return {
    id: "cpi",
    value: yoy !== null ? Math.round(yoy * 10) / 10 : null,
    change: null,
    unit: "%yoy",
    label: r ? `${ym(r.date)}, 전년 동월 대비(계절조정 전)` : undefined,
  };
}

async function fetchPce(): Promise<LiveIndicatorData> {
  const obs = await fetchFredLatest("PCEPI", 16);
  const r = calcYoYWithDate(obs);
  const yoy = r?.value ?? null;
  return {
    id: "pce",
    value: yoy !== null ? Math.round(yoy * 10) / 10 : null,
    change: null,
    unit: "%yoy",
    label: r ? `${ym(r.date)}, 전년 동월 대비` : undefined,
  };
}

async function fetchNfp(): Promise<LiveIndicatorData> {
  const obs = await fetchFredLatest("PAYEMS", 4);
  const mom = calcMoM(obs);
  // PAYEMS is in thousands; convert to 만명 (10,000s)
  const valInMan = mom !== null ? Math.round((mom / 10) * 10) / 10 : null;
  return { id: "nfp", value: valInMan, change: null, unit: "만명", label: obs[0] ? `${ym(obs[0].date)}, 전월 대비 증감` : undefined };
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
  try {
  const tasks: Promise<LiveIndicatorData>[] = [
    // FRED (8)
    fetchYahoo("us10y", "^TNX", "%"),
    fetchSimpleFred("us02y", "DGS2"),
    fetchSimpleFred("t10y2y", "T10Y2Y").then((d) => ({ ...d, label: undefined })), // "역전 해소 중" 같은 해석 문구는 그대로 둔다
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

  // 마지막으로 받은 값 (미션 11): 받은 값은 Redis 에 남기고, 못 받은 타일에는 그 값과 받은 날짜를 붙인다.
  // 화면은 고정값을 지금 값처럼 보여 주지 않고 "자료를 불러오지 못했습니다"와 이 값을 보여 준다
  const kstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  let lastGood: Record<string, { value: number; unit: string; asOf: string; label?: string }> = {};
  try {
    lastGood = (await redis.get<typeof lastGood>(LAST_GOOD_KEY)) ?? {};
  } catch {
    /* 보관값이 없어도 응답은 낸다 */
  }
  const nextGood = { ...lastGood };
  for (const d of data) {
    // label(자료 기준월·기준일)도 함께 남긴다 — 받은 날짜만으로는 월간 자료의 기준월을 알 수 없다 (독립 검증 지적 7)
    if (d.value !== null) nextGood[d.id] = { value: d.value, unit: d.unit, asOf: kstToday, ...(d.label ? { label: d.label } : {}) };
    else if (lastGood[d.id]) d.lastGood = lastGood[d.id];
  }
  try {
    await redis.set(LAST_GOOD_KEY, nextGood);
  } catch {
    /* 저장 실패는 화면에 영향 없음 */
  }

  return NextResponse.json({
    data,
    // FRED 경유 여부 (미션 8: 기본은 원출처 — SITE_DATA_SOURCE=fred 로 되돌리면 "fred", 화면이 FRED 고지를 띄운다)
    dataSource: FRED_IDS.some((id) => !isSiteOriginSeries(id)) ? "fred" : "origin",
    fetchedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": CACHE_CONTROL } });
  } catch (error) {
    console.error("global-indicators API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch global indicators" },
      { status: 500 }
    );
  }
}
