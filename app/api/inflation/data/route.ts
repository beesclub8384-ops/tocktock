import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { isSiteOriginSeries } from "@/lib/site-source-config";
import { siteObservations } from "@/lib/site-origin";

export const maxDuration = 60;

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";
// 미션 8: 원출처 전환으로 키를 바꿨다(옛 키 inflation:fred:v1 에는 FRED 값이 있고 TTL 25시간으로 저절로 사라진다).
// cron(app/api/cron/inflation-refresh)도 같은 키를 쓴다 — 그 파일의 CACHE_KEY 를 함께 고칠 것
const CACHE_KEY = "inflation:v2";
const CACHE_TTL = 25 * 60 * 60; // 25시간

interface FredObs {
  date: string;
  value: string;
}

interface SeriesPoint {
  date: string;
  headline: number | null;
  core: number | null;
  corePce: number | null;
}

interface LatestEntry {
  value: number | null;
  date: string | null;
  prevValue: number | null;
}

export interface InflationData {
  series: SeriesPoint[];
  latest: {
    headline: LatestEntry;
    core: LatestEntry;
    corePce: LatestEntry;
  };
  /** "origin" = BLS·BEA 원출처, "fred" = FRED 경유 (미션 8, 화면 출처 문장에 쓴다) */
  source: "origin" | "fred";
  lastUpdated: string;
}

const SERIES = ["CPIAUCSL", "CPILFESL", "PCEPILFE"];

/**
 * 전년 동월 대비 변화율 (미션 8): 원출처(CPI·근원 CPI = BLS 시계열 파일, 근원 PCE = BEA NIPA 월별 파일)에서 지수를 받아
 * FRED units=pc1 과 같은 식으로 계산한다(FRED 출력과 시리즈마다 800개 전부 같음, 결정 로그 20-3).
 * SITE_DATA_SOURCE=fred 면 FRED 그대로.
 */
async function fetchYoY(seriesId: string): Promise<FredObs[]> {
  if (isSiteOriginSeries(seriesId)) {
    return siteObservations(seriesId, { units: "pc1", observationStart: "1960-01-01", sortOrder: "asc" });
  }
  return fetchFredYoY(seriesId);
}

async function fetchFredYoY(seriesId: string): Promise<FredObs[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error("FRED_API_KEY not set");
  // units=pc1 → 전년 동기 대비 변화율(YoY%)을 FRED 가 직접 계산해서 반환
  const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&units=pc1&observation_start=1960-01-01`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`FRED ${seriesId}: ${res.status}`);
  const json = (await res.json()) as { observations: FredObs[] };
  return json.observations;
}

function toNum(v: string): number | null {
  if (v === "." || v === "" || v === undefined || v === null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function buildLatest(obs: FredObs[]): LatestEntry {
  // 최신부터 거꾸로 가며 가장 최근의 유효값 + 그 전 유효값 찾기
  let latestIdx = -1;
  for (let i = obs.length - 1; i >= 0; i--) {
    if (toNum(obs[i].value) !== null) {
      latestIdx = i;
      break;
    }
  }
  if (latestIdx < 0) {
    return { value: null, date: null, prevValue: null };
  }
  let prev: number | null = null;
  for (let i = latestIdx - 1; i >= 0; i--) {
    const v = toNum(obs[i].value);
    if (v !== null) {
      prev = v;
      break;
    }
  }
  return {
    value: toNum(obs[latestIdx].value),
    date: obs[latestIdx].date,
    prevValue: prev,
  };
}

export async function GET() {
  try {
    const cached = await redis.get<InflationData>(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    const [headlineObs, coreObs, corePceObs] = await Promise.all([
      fetchYoY("CPIAUCSL"),
      fetchYoY("CPILFESL"),
      fetchYoY("PCEPILFE"),
    ]);

    // 날짜 → 각 지표 값 매핑
    const headlineMap = new Map(headlineObs.map((o) => [o.date, toNum(o.value)]));
    const coreMap = new Map(coreObs.map((o) => [o.date, toNum(o.value)]));
    const corePceMap = new Map(corePceObs.map((o) => [o.date, toNum(o.value)]));

    // 모든 날짜 합집합 (CPI 시리즈가 가장 길 가능성이 높음 — 1947 ~)
    const allDates = new Set<string>();
    headlineObs.forEach((o) => allDates.add(o.date));
    coreObs.forEach((o) => allDates.add(o.date));
    corePceObs.forEach((o) => allDates.add(o.date));

    const sortedDates = Array.from(allDates).sort();

    const series: SeriesPoint[] = sortedDates.map((date) => ({
      date,
      headline: headlineMap.get(date) ?? null,
      core: coreMap.get(date) ?? null,
      corePce: corePceMap.get(date) ?? null,
    }));

    const data: InflationData = {
      series,
      latest: {
        headline: buildLatest(headlineObs),
        core: buildLatest(coreObs),
        corePce: buildLatest(corePceObs),
      },
      source: SERIES.every((id) => isSiteOriginSeries(id)) ? "origin" : "fred",
      lastUpdated: new Date().toISOString(),
    };

    await redis.set(CACHE_KEY, data, { ex: CACHE_TTL });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
