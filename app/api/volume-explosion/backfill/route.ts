import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5분 타임아웃

// --- 상수 (route.ts와 동일) ---
const SNAPSHOT_PREFIX = "volume-snapshot";
const SNAPSHOT_TTL = 5 * 86400;
const EXPLOSION_DAILY_PREFIX = "volume-explosion-daily";
const EXPLOSION_DAILY_TTL = 5 * 86400;
const SUSPECTED_LATEST_KEY = "volume-explosion-suspected-latest";
const SUSPECTED_LATEST_TTL = 7 * 86400;
const YESTERDAY_THRESHOLD = 30_000_000_000; // 300억원
const TODAY_THRESHOLD = 95_000_000_000; // 950억원

const KOREAN_HOLIDAYS = new Set([
  // 2025
  "20250101", "20250127", "20250128", "20250129", "20250130",
  "20250303", "20250505", "20250506", "20250606", "20250815",
  "20251003", "20251006", "20251007", "20251008", "20251009", "20251225",
  // 2026
  "20260101", "20260216", "20260217", "20260218", "20260302",
  "20260505", "20260525", "20260817", "20260924", "20260925",
  "20261005", "20261009", "20261225",
  // 2027
  "20270101", "20270208", "20270209", "20270301", "20270505",
  "20270513", "20270816", "20270914", "20270915", "20270916",
  "20271004", "20271011", "20271227",
]);

const NAVER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

// --- 타입 ---
interface NaverStockRaw {
  itemCode: string;
  stockName: string;
  closePrice: string;
  fluctuationsRatio: string;
  compareToPreviousPrice: { code: string };
  accumulatedTradingValue: string;
  marketValue: string;
  localTradedAt: string;
}

interface NaverPageResponse {
  stocks: NaverStockRaw[];
  totalCount: number;
  page: number;
  pageSize: number;
}

interface StockVolume {
  code: string;
  name: string;
  tradingValue: number;
  closePrice: number;
  changeRate: number;
  marketCap: number;
  market: "KOSPI" | "KOSDAQ";
}

interface SiseJsonDayData {
  date: string;
  open: number;
  close: number;
  volume: number;
  tradingValue: number; // close * volume (근사치)
}

// --- 유틸 ---
const ETF_BRAND_RE =
  /^(KODEX|TIGER|KBSTAR|ACE|ARIRANG|HANARO|SOL|KOSEF|KINDEX|TIMEFOLIO|PLUS|FOCUS|WOORI|BNK|RISE|KIWOOM|KoAct|WON|HK|1Q|TIME|DAISHIN\d+|UNICORN|TRUSTON|VITA|에셋플러스|마이다스|더제이|파워|마이티|히어로)\s/;

function isRegularStock(name: string): boolean {
  if (/ETF|ETN/i.test(name)) return false;
  if (ETF_BRAND_RE.test(name)) return false;
  if (name.includes("리츠") || /REIT/i.test(name)) return false;
  if (/스팩/.test(name)) return false;
  if (/채권|선물|인버스|레버리지/.test(name)) return false;
  if (/^(맥쿼리|KB발해)인프라/.test(name)) return false;
  if (/우[A-C]?$/.test(name)) return false;
  return true;
}

function parseNum(s: string): number {
  return Number(s.replace(/,/g, "")) || 0;
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function getWeekdayCandidates(count: number, startDate: Date): string[] {
  const result: string[] = [];
  const d = new Date(startDate);
  while (result.length < count) {
    const dateStr = fmtDate(d);
    if (d.getDay() !== 0 && d.getDay() !== 6 && !KOREAN_HOLIDAYS.has(dateStr)) {
      result.push(dateStr);
    }
    d.setDate(d.getDate() - 1);
  }
  return result;
}

function formatBillion(value: number): string {
  const eok = Math.round(value / 100_000_000);
  return eok >= 10000 ? (eok / 10000).toFixed(2) + "조" : eok.toLocaleString() + "억";
}

// --- 네이버 금융 API ---
async function fetchNaverPage(
  market: string,
  page: number,
  pageSize: number,
): Promise<NaverPageResponse | null> {
  const url = `https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${page}&pageSize=${pageSize}`;
  try {
    const res = await fetch(url, {
      headers: NAVER_HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json as NaverPageResponse;
  } catch {
    return null;
  }
}

function toStockVolumes(
  rawStocks: NaverStockRaw[],
  market: "KOSPI" | "KOSDAQ",
): StockVolume[] {
  return rawStocks.map((s) => ({
    code: s.itemCode,
    name: s.stockName,
    tradingValue: parseNum(s.accumulatedTradingValue) * 1_000_000,
    closePrice: parseNum(s.closePrice),
    changeRate: parseNum(s.fluctuationsRatio),
    marketCap: parseNum(s.marketValue) * 1_000_000,
    market,
  }));
}

async function fetchAllStocks(
  market: "KOSPI" | "KOSDAQ",
): Promise<{ stocks: StockVolume[]; dataDate: string }> {
  const PAGE_SIZE = 100;
  const first = await fetchNaverPage(market, 1, PAGE_SIZE);
  if (!first?.stocks?.length) return { stocks: [], dataDate: "" };

  const localTradedAt = first.stocks[0].localTradedAt || "";
  const dataDate = localTradedAt ? localTradedAt.slice(0, 10).replace(/-/g, "") : "";

  const allStocks = toStockVolumes(first.stocks, market);
  const totalPages = Math.ceil(first.totalCount / PAGE_SIZE);

  const BATCH = 5;
  for (let i = 2; i <= totalPages; i += BATCH) {
    const promises: Promise<NaverPageResponse | null>[] = [];
    for (let j = i; j < i + BATCH && j <= totalPages; j++) {
      promises.push(fetchNaverPage(market, j, PAGE_SIZE));
    }
    const results = await Promise.all(promises);
    for (const r of results) {
      if (r?.stocks) {
        allStocks.push(...toStockVolumes(r.stocks, market));
      }
    }
  }

  console.log(`[backfill] ${market} 완료: ${allStocks.length}종목, dataDate=${dataDate}`);
  return { stocks: allStocks, dataDate };
}

// --- siseJson 전체 히스토리 조회 (open/close/volume 포함) ---
async function fetchStockSiseJsonFull(
  code: string,
  startDate: string,
  endDate: string,
): Promise<SiseJsonDayData[]> {
  const url = `https://api.finance.naver.com/siseJson.naver?symbol=${code}&requestType=1&startTime=${startDate}&endTime=${endDate}&timeframe=day`;
  try {
    const res = await fetch(url, {
      headers: NAVER_HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const text = await res.text();
    const parsed = JSON.parse(text.trim().replace(/'/g, '"'));
    if (!Array.isArray(parsed) || parsed.length < 2) return [];

    // siseJson 컬럼: [날짜, 시가, 고가, 저가, 종가, 거래량, 거래대금(원)]
    return parsed.slice(1).map((row: any[]) => ({
      date: String(row[0]).trim(),
      open: Number(row[1]),
      close: Number(row[4]),
      volume: Number(row[5]),
      tradingValue: Math.round(Number(row[4]) * Number(row[5])), // 종가 × 거래량 (근사치)
    }));
  } catch {
    return [];
  }
}

// --- 메인 핸들러 ---
export async function GET() {
  const startTime = Date.now();

  console.log(`[backfill] 백필 시작`);

  // 1. 전종목 코드/이름/마켓 조회
  const [kospiResult, kosdaqResult] = await Promise.all([
    fetchAllStocks("KOSPI"),
    fetchAllStocks("KOSDAQ"),
  ]);

  const allStocksLive = [...kospiResult.stocks, ...kosdaqResult.stocks];
  if (allStocksLive.length === 0) {
    return NextResponse.json({ error: "전종목 조회 실패" }, { status: 500 });
  }

  const totalStocksProcessed = allStocksLive.length;
  console.log(`[backfill] 전종목 조회 완료: ${totalStocksProcessed}종목`);

  // 2. 최근 거래일 기준 20일 범위 설정
  const now = new Date();
  const kstNow = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 9 * 3600000);
  const endDate = fmtDate(kstNow);
  const startD = new Date(kstNow);
  startD.setDate(startD.getDate() - 30); // 20영업일 + 여유
  const startDate = fmtDate(startD);

  console.log(`[backfill] siseJson 범위: ${startDate} ~ ${endDate}`);

  // 3. 전종목 siseJson 히스토리 조회 (배치 50개씩)
  const BATCH = 50;
  // Map<code, SiseJsonDayData[]>
  const stockHistoryMap = new Map<string, SiseJsonDayData[]>();

  for (let i = 0; i < allStocksLive.length; i += BATCH) {
    const batch = allStocksLive.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (s) => ({
        code: s.code,
        history: await fetchStockSiseJsonFull(s.code, startDate, endDate),
      })),
    );
    for (const r of results) {
      if (r.history.length > 0) {
        stockHistoryMap.set(r.code, r.history);
      }
    }
    if (i + BATCH < allStocksLive.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if ((i / BATCH) % 20 === 0) {
      console.log(
        `[backfill] siseJson 진행: ${Math.min(i + BATCH, allStocksLive.length)}/${allStocksLive.length}`,
      );
    }
  }

  console.log(`[backfill] siseJson 조회 완료: ${stockHistoryMap.size}종목`);

  // 4. 날짜별 데이터 그룹핑
  const stockInfoMap = new Map(allStocksLive.map((s) => [s.code, { name: s.name, market: s.market, marketCap: s.marketCap }]));

  // 날짜 목록 수집
  const allDatesSet = new Set<string>();
  for (const [, history] of stockHistoryMap) {
    for (const day of history) {
      allDatesSet.add(day.date);
    }
  }
  const allDates = [...allDatesSet].sort();

  // 최근 7거래일 확보 (5거래일 + 이전 2일 여유)
  const tradingDates = getWeekdayCandidates(7, kstNow);
  tradingDates.reverse(); // 오래된 순으로

  console.log(`[backfill] 거래일 후보: ${tradingDates.join(", ")}`);
  console.log(`[backfill] siseJson 날짜: ${allDates.join(", ")}`);

  // 5. 각 거래일에 대해 폭발 종목 탐지
  const explosionsPerDate: Record<string, number> = {};
  const processedDates: string[] = [];

  for (let i = 1; i < tradingDates.length; i++) {
    const dMinusOne = tradingDates[i - 1]; // D-1
    const dDay = tradingDates[i]; // D

    // D-1과 D의 데이터가 siseJson에 있는지 확인
    const explosionStocks: {
      code: string;
      name: string;
      todayValue: number;
      closePrice: number;
      changeRate: number;
      marketCap: number;
      market: string;
    }[] = [];

    const snapshotStocks: {
      code: string;
      name: string;
      tradingValue: number;
      market: "KOSPI" | "KOSDAQ";
    }[] = [];

    for (const [code, history] of stockHistoryMap) {
      const info = stockInfoMap.get(code);
      if (!info) continue;

      const dMinusOneData = history.find((h) => h.date === dMinusOne);
      const dDayData = history.find((h) => h.date === dDay);

      if (!dDayData) continue;

      // 스냅샷 데이터 수집 (D일)
      snapshotStocks.push({
        code,
        name: info.name,
        tradingValue: dDayData.tradingValue,
        market: info.market,
      });

      if (!dMinusOneData) continue;
      if (!isRegularStock(info.name)) continue;

      // D-1 거래대금 ≤ 300억
      if (dMinusOneData.tradingValue > YESTERDAY_THRESHOLD) continue;
      // D 거래대금 ≥ 950억
      if (dDayData.tradingValue < TODAY_THRESHOLD) continue;

      // 등락률 > 0 (D_close vs D-1_close)
      if (dMinusOneData.close <= 0) continue;
      const changeRate = ((dDayData.close - dMinusOneData.close) / dMinusOneData.close) * 100;
      if (changeRate <= 0) continue;

      // 갭상승(10%+) + 음봉 제외
      const gapPct = ((dDayData.open - dMinusOneData.close) / dMinusOneData.close) * 100;
      if (gapPct >= 10 && dDayData.close < dDayData.open) {
        console.log(
          `[backfill] 갭상승+음봉 제외: ${info.name} D=${dDay} (갭=${gapPct.toFixed(1)}%)`,
        );
        continue;
      }

      explosionStocks.push({
        code,
        name: info.name,
        todayValue: dDayData.tradingValue,
        closePrice: dDayData.close,
        changeRate: Math.round(changeRate * 100) / 100,
        marketCap: info.marketCap,
        market: info.market,
      });
    }

    // Redis에 저장
    if (explosionStocks.length > 0) {
      const dailyKey = `${EXPLOSION_DAILY_PREFIX}:${dDay}`;
      await redis.set(dailyKey, explosionStocks, { ex: EXPLOSION_DAILY_TTL });
      console.log(`[backfill] 폭발 저장: ${dailyKey}, ${explosionStocks.length}종목`);
    }

    if (snapshotStocks.length > 0) {
      const snapshotKey = `${SNAPSHOT_PREFIX}:${dDay}`;
      await redis.set(snapshotKey, snapshotStocks, { ex: SNAPSHOT_TTL });
      console.log(`[backfill] 스냅샷 저장: ${snapshotKey}, ${snapshotStocks.length}종목`);
    }

    explosionsPerDate[dDay] = explosionStocks.length;
    processedDates.push(dDay);

    console.log(
      `[backfill] ${dDay}: 폭발 ${explosionStocks.length}개, 스냅샷 ${snapshotStocks.length}개`,
    );
  }

  // 6. 가장 최근 D/D+1 쌍으로 suspectedStocks 계산
  let suspectedCount = 0;
  if (processedDates.length >= 2) {
    const dDay = processedDates[processedDates.length - 2]; // D
    const dPlusOne = processedDates[processedDates.length - 1]; // D+1

    try {
      const dExplosions = await redis.get<
        { code: string; name: string; todayValue: number; closePrice: number; changeRate: number; marketCap?: number; market: string }[]
      >(`${EXPLOSION_DAILY_PREFIX}:${dDay}`);

      if (dExplosions && dExplosions.length > 0) {
        // D+1 스냅샷에서 거래대금 매핑
        const dPlusOneData = new Map<string, number>();
        for (const [code, history] of stockHistoryMap) {
          const dayData = history.find((h) => h.date === dPlusOne);
          if (dayData) dPlusOneData.set(code, dayData.tradingValue);
        }

        const MARKET_CAP_MIN = 50_000_000_000; // 500억원
        const suspectedStocks = dExplosions
          .filter((s) => {
            const dPlusOneValue = dPlusOneData.get(s.code);
            if (dPlusOneValue === undefined) return false;
            // 시총 500억 이하 제외
            const cap = s.marketCap || stockInfoMap.get(s.code)?.marketCap || 0;
            if (cap <= MARKET_CAP_MIN) {
              console.log(
                `[backfill] 시총 필터 제외: ${s.name} (시총=${formatBillion(cap)})`,
              );
              return false;
            }
            const ratio = dPlusOneValue / s.todayValue;
            const pass = ratio <= 1 / 3;
            if (pass) {
              console.log(
                `[backfill] 세력진입 의심: ${s.name} D=${formatBillion(s.todayValue)} → D+1=${formatBillion(dPlusOneValue)} (${(ratio * 100).toFixed(1)}%), 시총=${formatBillion(cap)}`,
              );
            }
            return pass;
          })
          .map((s) => ({
            code: s.code,
            name: s.name,
            dDayValue: s.todayValue,
            dPlusOneValue: dPlusOneData.get(s.code)!,
            dDayClosePrice: s.closePrice,
            dDayChangeRate: s.changeRate,
            marketCap: s.marketCap || stockInfoMap.get(s.code)?.marketCap || 0,
            market: s.market,
            dDate: dDay,
          }))
          .sort((a, b) => b.dDayValue - a.dDayValue);

        await redis.set(SUSPECTED_LATEST_KEY, suspectedStocks, { ex: SUSPECTED_LATEST_TTL });
        console.log(`[backfill] 세력진입 의심 최신 저장: ${suspectedStocks.length}종목`);
        suspectedCount = suspectedStocks.length;
      }
    } catch (err) {
      console.error(`[backfill] 세력진입 의심 계산 실패:`, err);
    }
  }

  // 7. 메인 API 캐시 무효화 (stale 결과 방지)
  {
    const CACHE_PREFIX = "volume-explosion";
    const kstNowDate = fmtDate(kstNow);
    const keysToDelete = [
      `${CACHE_PREFIX}:${kstNowDate}:closed`,
      `${CACHE_PREFIX}:${kstNowDate}:open`,
    ];
    // 어제 날짜 캐시도 삭제 (자정 전후 타이밍 이슈 대비)
    const yesterday = new Date(kstNow);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDate = fmtDate(yesterday);
    keysToDelete.push(`${CACHE_PREFIX}:${yesterdayDate}:closed`);
    keysToDelete.push(`${CACHE_PREFIX}:${yesterdayDate}:open`);

    for (const key of keysToDelete) {
      try {
        await redis.del(key);
      } catch { /* */ }
    }
    console.log(`[backfill] 메인 API 캐시 무효화: ${keysToDelete.join(", ")}`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[backfill] 완료: ${elapsed}s`);

  return NextResponse.json({
    status: "ok",
    tradingDates: processedDates,
    explosionsPerDate,
    suspectedStocks: suspectedCount,
    totalStocksProcessed,
    elapsed: `${elapsed}s`,
  });
}
