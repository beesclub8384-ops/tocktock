import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

const CACHE_KEY = "volume-explosion:latest";
const CACHE_TTL = 86400; // 24h

const YESTERDAY_THRESHOLD = 30_000_000_000; // 300억
const TODAY_THRESHOLD = 100_000_000_000; // 1,000억

const KRX_HEADERS: Record<string, string> = {
  "Content-Type": "application/x-www-form-urlencoded",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Referer:
    "http://data.krx.co.kr/contents/MDC/MDI/mdiStat/tables/MDCSTAT01501.html",
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  Origin: "http://data.krx.co.kr",
  "X-Requested-With": "XMLHttpRequest",
};

interface KRXRow {
  ISU_SRT_CD: string;
  ISU_ABBRV: string;
  TDD_CLSPRC: string;
  CMPPREVDD_PRC: string;
  FLUC_TP_CD: string;
  FLUC_RT: string;
  ACC_TRDVOL: string;
  ACC_TRDVAL: string;
}

interface StockVolume {
  code: string;
  name: string;
  tradingValue: number;
  closePrice: number;
  changeRate: number;
  market: "KOSPI" | "KOSDAQ";
}

export interface VolumeExplosionResponse {
  todayDate: string;
  yesterdayDate: string;
  yesterdayStocks: {
    code: string;
    name: string;
    value: number;
    market: string;
  }[];
  explosionStocks: {
    code: string;
    name: string;
    yesterdayValue: number;
    todayValue: number;
    closePrice: number;
    changeRate: number;
    market: string;
  }[];
  updatedAt: string;
}

function parseNum(s: string): number {
  return Number(s.replace(/,/g, "")) || 0;
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

/** 최근 weekday 날짜 후보 (오늘부터 역순) */
function getWeekdayCandidates(count: number): string[] {
  const result: string[] = [];
  const d = new Date();
  while (result.length < count) {
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      result.push(fmtDate(d));
    }
    d.setDate(d.getDate() - 1);
  }
  return result;
}

async function fetchKRXStocks(
  date: string,
  mktId: string,
): Promise<KRXRow[]> {
  const body = new URLSearchParams({
    bld: "dbms/MDC/STAT/standard/MDCSTAT01501",
    locale: "ko_KR",
    mktId,
    trdDd: date,
  });

  const res = await fetch(
    "http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd",
    {
      method: "POST",
      headers: KRX_HEADERS,
      body: body.toString(),
      signal: AbortSignal.timeout(15000),
    },
  );

  if (!res.ok) return [];

  try {
    const json = await res.json();
    return json?.OutBlock_1 || json?.output || [];
  } catch {
    return [];
  }
}

function toStockVolumes(
  rows: KRXRow[],
  market: "KOSPI" | "KOSDAQ",
): StockVolume[] {
  return rows.map((r) => {
    const changeRate = parseNum(r.FLUC_RT);
    const isDown = r.FLUC_TP_CD === "2";
    return {
      code: r.ISU_SRT_CD,
      name: r.ISU_ABBRV,
      tradingValue: parseNum(r.ACC_TRDVAL),
      closePrice: parseNum(r.TDD_CLSPRC),
      changeRate: isDown ? -changeRate : changeRate,
      market,
    };
  });
}

export async function GET() {
  // 1. Redis 캐시 확인
  try {
    const cached = await redis.get<VolumeExplosionResponse>(CACHE_KEY);
    if (cached) return NextResponse.json(cached);
  } catch {
    /* cache miss */
  }

  // 2. 최근 거래일 2일 찾기 (KOSPI 데이터로 거래일 판별)
  const candidates = getWeekdayCandidates(10);
  let todayDate = "";
  let yesterdayDate = "";
  let todayKospiRows: KRXRow[] = [];
  let yesterdayKospiRows: KRXRow[] = [];

  for (const date of candidates) {
    try {
      const rows = await fetchKRXStocks(date, "STK");
      if (rows.length > 0) {
        if (!todayDate) {
          todayDate = date;
          todayKospiRows = rows;
        } else {
          yesterdayDate = date;
          yesterdayKospiRows = rows;
          break;
        }
      }
    } catch {
      continue;
    }
  }

  if (!todayDate || !yesterdayDate) {
    return NextResponse.json(
      { error: "최근 거래일 데이터를 찾을 수 없습니다." },
      { status: 500 },
    );
  }

  // 3. 코스닥 데이터 병렬 조회
  const [todayKosdaqRows, yesterdayKosdaqRows] = await Promise.all([
    fetchKRXStocks(todayDate, "KSQ"),
    fetchKRXStocks(yesterdayDate, "KSQ"),
  ]);

  // 4. 전체 합산
  const todayAll = [
    ...toStockVolumes(todayKospiRows, "KOSPI"),
    ...toStockVolumes(todayKosdaqRows, "KOSDAQ"),
  ];
  const yesterdayAll = [
    ...toStockVolumes(yesterdayKospiRows, "KOSPI"),
    ...toStockVolumes(yesterdayKosdaqRows, "KOSDAQ"),
  ];

  // 5. 어제 거래대금 300억 이하 종목
  const yesterdayLow = yesterdayAll
    .filter((s) => s.tradingValue > 0 && s.tradingValue <= YESTERDAY_THRESHOLD)
    .sort((a, b) => b.tradingValue - a.tradingValue);

  const yesterdayLowCodes = new Set(yesterdayLow.map((s) => s.code));

  // 6. 폭발 종목: 어제 300억 이하 → 오늘 1,000억 이상
  const yesterdayMap = new Map(yesterdayAll.map((s) => [s.code, s]));

  const explosionStocks = todayAll
    .filter(
      (s) =>
        yesterdayLowCodes.has(s.code) && s.tradingValue >= TODAY_THRESHOLD,
    )
    .sort((a, b) => b.tradingValue - a.tradingValue)
    .map((s) => ({
      code: s.code,
      name: s.name,
      yesterdayValue: yesterdayMap.get(s.code)?.tradingValue || 0,
      todayValue: s.tradingValue,
      closePrice: s.closePrice,
      changeRate: s.changeRate,
      market: s.market,
    }));

  const result: VolumeExplosionResponse = {
    todayDate,
    yesterdayDate,
    yesterdayStocks: yesterdayLow.map((s) => ({
      code: s.code,
      name: s.name,
      value: s.tradingValue,
      market: s.market,
    })),
    explosionStocks,
    updatedAt: new Date().toISOString(),
  };

  // 7. Redis 캐싱 (24시간)
  try {
    await redis.set(CACHE_KEY, result, { ex: CACHE_TTL });
  } catch {
    /* cache write failed */
  }

  return NextResponse.json(result);
}
