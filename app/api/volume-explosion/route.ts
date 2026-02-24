import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

const CACHE_KEY_PREFIX = "volume-explosion";
const CACHE_TTL_CLOSED = 86400; // 장 마감 후 24h
const CACHE_TTL_OPEN = 600; // 장중 10분 (어제 데이터만 캐시)

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
  marketOpen: boolean; // true = 장 마감 전, 오늘 데이터 없음
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

/** KST 기준 현재 시각 */
function getKSTNow(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 9 * 3600000);
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

/** 장 마감 여부 (KST 15:30 이후이고 평일이면 장 마감) */
function isMarketClosed(kstNow: Date): boolean {
  const day = kstNow.getDay();
  if (day === 0 || day === 6) return true; // 주말은 이전 거래일 마감 상태
  const hhmm = kstNow.getHours() * 100 + kstNow.getMinutes();
  return hhmm >= 1530;
}

/** startDate부터 과거 방향으로 평일 날짜 후보 생성 */
function getWeekdayCandidates(count: number, startDate: Date): string[] {
  const result: string[] = [];
  const d = new Date(startDate);
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

  const url = "http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd";
  console.log(`[KRX] 요청: date=${date}, mktId=${mktId}`);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: KRX_HEADERS,
      body: body.toString(),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    console.error(`[KRX] 네트워크 에러: date=${date}, mktId=${mktId}`, err);
    return [];
  }

  if (!res.ok) {
    console.warn(`[KRX] HTTP ${res.status}: date=${date}, mktId=${mktId}`);
    return [];
  }

  try {
    const json = await res.json();
    const rows: KRXRow[] = json?.OutBlock_1 || json?.output || [];
    console.log(
      `[KRX] 응답: date=${date}, mktId=${mktId}, rows=${rows.length}`,
    );
    if (rows.length === 0) {
      const keys = Object.keys(json || {});
      console.warn(`[KRX] 빈 결과. 응답 키: [${keys.join(", ")}]`);
    }
    return rows;
  } catch (err) {
    console.error(`[KRX] JSON 파싱 에러: date=${date}, mktId=${mktId}`, err);
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
  const kstNow = getKSTNow();
  const marketClosed = isMarketClosed(kstNow);
  const todayKST = fmtDate(kstNow);
  const cacheKey = `${CACHE_KEY_PREFIX}:${todayKST}:${marketClosed ? "closed" : "open"}`;

  console.log(
    `[volume-explosion] KST=${kstNow.toISOString()}, today=${todayKST}, marketClosed=${marketClosed}`,
  );

  // 1. Redis 캐시 확인
  try {
    const cached = await redis.get<VolumeExplosionResponse>(cacheKey);
    if (cached) {
      console.log(`[volume-explosion] 캐시 히트: ${cacheKey}`);
      return NextResponse.json(cached);
    }
  } catch {
    /* cache miss */
  }

  // 2. "어제" 데이터 조회 — 항상 직전 거래일
  //    장 마감 전: 오늘 제외, 어제부터 탐색
  //    장 마감 후: 오늘이 첫 번째, 그 전이 "어제"
  const yesterdayStart = new Date(kstNow);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1); // 어제부터 시작
  const yesterdayCandidates = getWeekdayCandidates(10, yesterdayStart);

  let yesterdayDate = "";
  let yesterdayKospiRows: KRXRow[] = [];

  for (const date of yesterdayCandidates) {
    try {
      const rows = await fetchKRXStocks(date, "STK");
      if (rows.length > 0) {
        yesterdayDate = date;
        yesterdayKospiRows = rows;
        break;
      }
    } catch (err) {
      console.error(`[volume-explosion] 어제 데이터 조회 실패: ${date}`, err);
      continue;
    }
  }

  if (!yesterdayDate) {
    console.error(
      `[volume-explosion] 어제 거래일을 찾을 수 없음. 후보: [${yesterdayCandidates.join(", ")}]`,
    );
    return NextResponse.json(
      {
        error: `최근 거래일 데이터를 찾을 수 없습니다. (후보: ${yesterdayCandidates.slice(0, 3).join(", ")})`,
      },
      { status: 500 },
    );
  }

  // 어제 코스닥 데이터
  const yesterdayKosdaqRows = await fetchKRXStocks(yesterdayDate, "KSQ");

  const yesterdayAll = [
    ...toStockVolumes(yesterdayKospiRows, "KOSPI"),
    ...toStockVolumes(yesterdayKosdaqRows, "KOSDAQ"),
  ];

  const yesterdayLow = yesterdayAll
    .filter((s) => s.tradingValue > 0 && s.tradingValue <= YESTERDAY_THRESHOLD)
    .sort((a, b) => b.tradingValue - a.tradingValue);

  // 3. 장 마감 전이면 어제 데이터만 반환
  if (!marketClosed) {
    console.log(
      `[volume-explosion] 장 마감 전 — 어제(${yesterdayDate}) 데이터만 반환`,
    );
    const result: VolumeExplosionResponse = {
      todayDate: todayKST,
      yesterdayDate,
      marketOpen: true,
      yesterdayStocks: yesterdayLow.map((s) => ({
        code: s.code,
        name: s.name,
        value: s.tradingValue,
        market: s.market,
      })),
      explosionStocks: [],
      updatedAt: new Date().toISOString(),
    };

    try {
      await redis.set(cacheKey, result, { ex: CACHE_TTL_OPEN });
    } catch {
      /* cache write failed */
    }

    return NextResponse.json(result);
  }

  // 4. 장 마감 후 — 오늘 데이터 조회
  const todayCandidates = getWeekdayCandidates(5, kstNow);
  let todayDate = "";
  let todayKospiRows: KRXRow[] = [];

  for (const date of todayCandidates) {
    // 어제와 같은 날짜면 건너뜀
    if (date === yesterdayDate) continue;
    try {
      const rows = await fetchKRXStocks(date, "STK");
      if (rows.length > 0) {
        todayDate = date;
        todayKospiRows = rows;
        break;
      }
    } catch (err) {
      console.error(`[volume-explosion] 오늘 데이터 조회 실패: ${date}`, err);
      continue;
    }
  }

  // 오늘 데이터를 못 찾으면 (공휴일 등) 어제 데이터만 반환
  if (!todayDate) {
    console.warn(
      `[volume-explosion] 장 마감 후지만 오늘 데이터 없음. 후보: [${todayCandidates.join(", ")}]`,
    );
    const result: VolumeExplosionResponse = {
      todayDate: todayKST,
      yesterdayDate,
      marketOpen: false,
      yesterdayStocks: yesterdayLow.map((s) => ({
        code: s.code,
        name: s.name,
        value: s.tradingValue,
        market: s.market,
      })),
      explosionStocks: [],
      updatedAt: new Date().toISOString(),
    };

    try {
      await redis.set(cacheKey, result, { ex: CACHE_TTL_OPEN });
    } catch {
      /* cache write failed */
    }

    return NextResponse.json(result);
  }

  // 5. 오늘 코스닥 데이터 조회
  const todayKosdaqRows = await fetchKRXStocks(todayDate, "KSQ");

  const todayAll = [
    ...toStockVolumes(todayKospiRows, "KOSPI"),
    ...toStockVolumes(todayKosdaqRows, "KOSDAQ"),
  ];

  // 6. 폭발 종목: 어제 300억 이하 → 오늘 1,000억 이상
  const yesterdayLowCodes = new Set(yesterdayLow.map((s) => s.code));
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

  console.log(
    `[volume-explosion] 장 마감 후 — 어제=${yesterdayDate}, 오늘=${todayDate}, 폭발=${explosionStocks.length}개`,
  );

  const result: VolumeExplosionResponse = {
    todayDate,
    yesterdayDate,
    marketOpen: false,
    yesterdayStocks: yesterdayLow.map((s) => ({
      code: s.code,
      name: s.name,
      value: s.tradingValue,
      market: s.market,
    })),
    explosionStocks,
    updatedAt: new Date().toISOString(),
  };

  // 7. Redis 캐싱
  try {
    await redis.set(cacheKey, result, { ex: CACHE_TTL_CLOSED });
  } catch {
    /* cache write failed */
  }

  return NextResponse.json(result);
}
