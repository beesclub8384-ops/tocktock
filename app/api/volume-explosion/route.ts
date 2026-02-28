import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

// --- 상수 ---
const SNAPSHOT_PREFIX = "volume-snapshot";
const SNAPSHOT_TTL = 5 * 86400; // 5일
const CACHE_PREFIX = "volume-explosion";
const CACHE_TTL_CLOSED = 3 * 86400; // 장 마감 후 3일 (주말 커버)
const CACHE_TTL_OPEN = 600; // 장중 10분

const YESTERDAY_THRESHOLD = 30_000_000_000; // 300억원
const TODAY_THRESHOLD = 95_000_000_000; // 950억원

const EXPLOSION_DAILY_PREFIX = "volume-explosion-daily";
const EXPLOSION_DAILY_TTL = 5 * 86400; // 5일

// --- 한국 공휴일 (2025~2027) ---
const KOREAN_HOLIDAYS = new Set([
  // 2025
  "20250101", // 신정
  "20250127", // 임시공휴일 (설 연휴)
  "20250128", "20250129", "20250130", // 설날 연휴
  "20250303", // 삼일절 대체공휴일
  "20250505", // 어린이날 + 부처님오신날
  "20250506", // 부처님오신날 대체공휴일
  "20250606", // 현충일
  "20250815", // 광복절
  "20251003", // 개천절
  "20251006", "20251007", // 추석 연휴 (10/5 일요일 제외)
  "20251008", // 추석 대체공휴일
  "20251009", // 한글날
  "20251225", // 성탄절
  // 2026
  "20260101", // 신정
  "20260216", "20260217", "20260218", // 설날 연휴
  "20260302", // 삼일절 대체공휴일
  "20260505", // 어린이날
  "20260525", // 부처님오신날 대체공휴일
  "20260817", // 광복절 대체공휴일
  "20260924", "20260925", // 추석 연휴
  "20261005", // 개천절 대체공휴일
  "20261009", // 한글날
  "20261225", // 성탄절
  // 2027
  "20270101", // 신정
  "20270208", "20270209", // 설날 연휴 + 대체공휴일
  "20270301", // 삼일절
  "20270505", // 어린이날
  "20270513", // 부처님오신날
  "20270816", // 광복절 대체공휴일
  "20270914", "20270915", "20270916", // 추석 연휴
  "20271004", // 개천절 대체공휴일
  "20271011", // 한글날 대체공휴일
  "20271227", // 성탄절 대체공휴일
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
  tradingValue: number; // 원
  closePrice: number;
  changeRate: number;
  market: "KOSPI" | "KOSDAQ";
}

interface StockSnapshot {
  code: string;
  name: string;
  tradingValue: number;
  market: "KOSPI" | "KOSDAQ";
}

export interface VolumeExplosionResponse {
  todayDate: string;
  yesterdayDate: string;
  marketOpen: boolean;
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
  suspectedStocks: {
    code: string;
    name: string;
    dDayValue: number;
    dPlusOneValue: number;
    dDayClosePrice: number;
    dDayChangeRate: number;
    market: string;
    dDate: string;
  }[];
  updatedAt: string;
}

// --- 유틸 ---
/** ETF·ETN·스팩·리츠·인프라펀드·우선주·파생상품 제외 — 일반 기업 주식만 */
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

function formatBillion(value: number): string {
  const eok = Math.round(value / 100_000_000);
  return eok >= 10000 ? (eok / 10000).toFixed(2) + "조" : eok.toLocaleString() + "억";
}

function getKSTNow(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 9 * 3600000);
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function isKoreanHoliday(date: Date | string): boolean {
  const dateStr = typeof date === "string" ? date : fmtDate(date);
  return KOREAN_HOLIDAYS.has(dateStr);
}

/** 평일(공휴일 제외) 09:00~15:30 → 장중 */
function isMarketOpen(kstNow: Date): boolean {
  const day = kstNow.getDay();
  if (day === 0 || day === 6) return false;
  if (isKoreanHoliday(kstNow)) return false;
  const hhmm = kstNow.getHours() * 100 + kstNow.getMinutes();
  return hhmm >= 900 && hhmm < 1530;
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
    if (!res.ok) {
      console.warn(`[Naver] HTTP ${res.status}: ${market} page=${page}`);
      return null;
    }
    const json = await res.json();
    console.log(
      `[Naver] ${market} page=${page}: ${json.stocks?.length ?? 0}종목 (total=${json.totalCount})`,
    );
    return json as NaverPageResponse;
  } catch (err) {
    console.error(`[Naver] 에러: ${market} page=${page}`, err);
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
    tradingValue: parseNum(s.accumulatedTradingValue) * 1_000_000, // 백만원 → 원
    closePrice: parseNum(s.closePrice),
    changeRate: parseNum(s.fluctuationsRatio), // 이미 부호 포함 (e.g. "-11.13")
    market,
  }));
}

/** 특정 시장 전종목 페이지네이션 조회. dataDate(실제 거래일)도 반환 */
async function fetchAllStocks(
  market: "KOSPI" | "KOSDAQ",
): Promise<{ stocks: StockVolume[]; dataDate: string }> {
  const PAGE_SIZE = 100;

  const first = await fetchNaverPage(market, 1, PAGE_SIZE);
  if (!first?.stocks?.length) return { stocks: [], dataDate: "" };

  // localTradedAt에서 실제 데이터 날짜 추출 (주말엔 금요일 날짜)
  const localTradedAt = first.stocks[0].localTradedAt || "";
  const dataDate = localTradedAt
    ? localTradedAt.slice(0, 10).replace(/-/g, "")
    : "";

  const allStocks = toStockVolumes(first.stocks, market);
  const totalPages = Math.ceil(first.totalCount / PAGE_SIZE);

  // 나머지 페이지 병렬 조회 (5개씩)
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

  console.log(`[Naver] ${market} 완료: ${allStocks.length}종목, dataDate=${dataDate}`);
  return { stocks: allStocks, dataDate };
}

// --- 스냅샷 ---
async function saveSnapshot(
  date: string,
  stocks: { code: string; name: string; tradingValue: number; market: string }[],
): Promise<void> {
  const data = stocks.map((s) => ({
    code: s.code,
    name: s.name,
    tradingValue: s.tradingValue,
    market: s.market as "KOSPI" | "KOSDAQ",
  }));
  try {
    await redis.set(`${SNAPSHOT_PREFIX}:${date}`, data, { ex: SNAPSHOT_TTL });
    console.log(`[snapshot] 저장: ${date}, ${data.length}종목`);
  } catch (err) {
    console.error(`[snapshot] 저장 실패: ${date}`, err);
  }
}

async function loadSnapshot(
  date: string,
): Promise<StockSnapshot[] | null> {
  try {
    const data = await redis.get<StockSnapshot[]>(
      `${SNAPSHOT_PREFIX}:${date}`,
    );
    if (data && data.length > 0) {
      console.log(`[snapshot] 로드: ${date}, ${data.length}종목`);
      return data;
    }
  } catch (err) {
    console.error(`[snapshot] 로드 실패: ${date}`, err);
  }
  return null;
}

/** dataDate 이전의 가장 최근 스냅샷을 찾음 */
async function findPreviousSnapshot(
  dataDate: string,
): Promise<{ date: string; stocks: StockSnapshot[] } | null> {
  const d = new Date(
    parseInt(dataDate.slice(0, 4)),
    parseInt(dataDate.slice(4, 6)) - 1,
    parseInt(dataDate.slice(6, 8)),
  );
  d.setDate(d.getDate() - 1);
  const candidates = getWeekdayCandidates(10, d);

  for (const date of candidates) {
    const snapshot = await loadSnapshot(date);
    if (snapshot) return { date, stocks: snapshot };
  }

  console.warn(
    `[snapshot] 이전 스냅샷 없음 (기준=${dataDate}). 후보: [${candidates.slice(0, 5).join(", ")}]`,
  );
  return null;
}

// --- 개별 종목 시가 조회 ---
async function fetchOpenPrice(code: string): Promise<number | null> {
  const url = `https://m.stock.naver.com/api/stock/${code}/price`;
  try {
    const res = await fetch(url, {
      headers: NAVER_HEADERS,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0 && data[0].openPrice) {
      return parseNum(String(data[0].openPrice));
    }
    if (data?.openPrice) {
      return parseNum(String(data.openPrice));
    }
    return null;
  } catch {
    return null;
  }
}

// --- siseJson 개별 종목 히스토리 fallback ---
async function fetchStockSiseJson(
  code: string,
  startDate: string,
  endDate: string,
): Promise<{ date: string; tradingValue: number }[]> {
  const url = `https://api.finance.naver.com/siseJson.naver?symbol=${code}&requestType=1&startTime=${startDate}&endTime=${endDate}&timeframe=day`;
  try {
    const res = await fetch(url, {
      headers: NAVER_HEADERS,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const text = await res.text();
    const parsed = JSON.parse(text.trim().replace(/'/g, '"'));
    if (!Array.isArray(parsed) || parsed.length < 2) return [];
    return parsed.slice(1).map((row: any[]) => ({
      date: String(row[0]).trim(),
      tradingValue: Math.round(Number(row[4]) * Number(row[5])), // 종가 × 거래량 (근사치)
    }));
  } catch {
    return [];
  }
}

/** 전종목의 이전 거래일 데이터를 siseJson으로 조회 (스냅샷 없을 때 fallback) */
async function fetchYesterdayFromSiseJson(
  stocks: { code: string; name: string; market: "KOSPI" | "KOSDAQ" }[],
  dataDate: string,
): Promise<{ date: string; stocks: StockSnapshot[] } | null> {
  const d = new Date(
    parseInt(dataDate.slice(0, 4)),
    parseInt(dataDate.slice(4, 6)) - 1,
    parseInt(dataDate.slice(6, 8)),
  );
  d.setDate(d.getDate() - 10);
  const startDate = fmtDate(d);

  console.log(
    `[siseJson] ${stocks.length}종목의 이전 거래일 데이터 조회 시작 (${startDate}~${dataDate})`,
  );

  const BATCH = 50;
  const results: StockSnapshot[] = [];
  let foundDate = "";

  for (let i = 0; i < stocks.length; i += BATCH) {
    const batch = stocks.slice(i, i + BATCH);
    const batchResults = await Promise.all(
      batch.map(async (stock) => {
        const history = await fetchStockSiseJson(
          stock.code,
          startDate,
          dataDate,
        );
        if (!history.length) return null;
        // dataDate와 같은 날짜면 그 전 항목 사용 (오늘 데이터 제외)
        let entry = history[history.length - 1];
        if (entry.date === dataDate && history.length >= 2) {
          entry = history[history.length - 2];
        }
        if (entry && entry.date !== dataDate) {
          if (!foundDate && entry.date) foundDate = entry.date;
          return {
            code: stock.code,
            name: stock.name,
            tradingValue: entry.tradingValue,
            market: stock.market,
          } as StockSnapshot;
        }
        return null;
      }),
    );
    results.push(...(batchResults.filter(Boolean) as StockSnapshot[]));
    if (i + BATCH < stocks.length) {
      await new Promise((r) => setTimeout(r, 100)); // rate limit 방지
    }
    if ((i / BATCH) % 10 === 0) {
      console.log(
        `[siseJson] 진행: ${Math.min(i + BATCH, stocks.length)}/${stocks.length}`,
      );
    }
  }

  console.log(
    `[siseJson] 완료: ${results.length}/${stocks.length}종목 조회, 날짜=${foundDate}`,
  );

  if (results.length === 0 || !foundDate) return null;
  return { date: foundDate, stocks: results };
}

// --- 메인 핸들러 ---
export async function GET() {
  const kstNow = getKSTNow();
  const todayKST = fmtDate(kstNow);
  const marketOpen = isMarketOpen(kstNow);

  console.log(
    `[volume-explosion] KST=${kstNow.toISOString()}, today=${todayKST}, marketOpen=${marketOpen}`,
  );

  // ===== 장중: 어제 스냅샷만 반환 =====
  if (marketOpen) {
    const cacheKey = `${CACHE_PREFIX}:${todayKST}:open`;
    try {
      const cached = await redis.get<VolumeExplosionResponse>(cacheKey);
      if (cached) {
        console.log(`[volume-explosion] 캐시 히트 (장중): ${cacheKey}`);
        return NextResponse.json(cached);
      }
    } catch {
      /* miss */
    }

    // 어제 스냅샷 찾기
    const yesterday = new Date(kstNow);
    yesterday.setDate(yesterday.getDate() - 1);
    const candidates = getWeekdayCandidates(10, yesterday);

    let yesterdayDate = "";
    let yesterdayStocks: StockSnapshot[] = [];
    for (const date of candidates) {
      const snap = await loadSnapshot(date);
      if (snap) {
        yesterdayDate = date;
        yesterdayStocks = snap;
        break;
      }
    }

    // 스냅샷 없으면 siseJson fallback
    if (yesterdayStocks.length === 0) {
      console.log(`[volume-explosion] 장중 - 스냅샷 없음 → siseJson fallback`);
      const [kospiResult, kosdaqResult] = await Promise.all([
        fetchAllStocks("KOSPI"),
        fetchAllStocks("KOSDAQ"),
      ]);
      const allStocks = [...kospiResult.stocks, ...kosdaqResult.stocks];
      const liveDate =
        kospiResult.dataDate || kosdaqResult.dataDate || todayKST;

      if (allStocks.length > 0) {
        const stockInfos = allStocks.map((s) => ({
          code: s.code,
          name: s.name,
          market: s.market,
        }));
        const yesterdayData = await fetchYesterdayFromSiseJson(
          stockInfos,
          liveDate,
        );
        if (yesterdayData) {
          yesterdayDate = yesterdayData.date;
          yesterdayStocks = yesterdayData.stocks;
          await saveSnapshot(yesterdayDate, yesterdayStocks);
        }
      }
    }

    const yesterdayLow = yesterdayStocks
      .filter(
        (s) =>
          isRegularStock(s.name) &&
          s.tradingValue > 0 &&
          s.tradingValue <= YESTERDAY_THRESHOLD,
      )
      .sort((a, b) => b.tradingValue - a.tradingValue);

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
      suspectedStocks: [],
      updatedAt: new Date().toISOString(),
    };

    try {
      await redis.set(cacheKey, result, { ex: CACHE_TTL_OPEN });
    } catch {
      /* */
    }
    return NextResponse.json(result);
  }

  // ===== 장 마감 후 (+ 주말/장 시작 전): 네이버에서 전종목 조회 =====
  const cacheKey = `${CACHE_PREFIX}:${todayKST}:closed`;
  try {
    const cached = await redis.get<VolumeExplosionResponse>(cacheKey);
    if (cached) {
      // 거래일 장마감 후(15:30~)인데 캐시 데이터가 오늘이 아니면 → 장 시작 전에 만들어진 stale 캐시
      const isTradingDay = kstNow.getDay() !== 0 && kstNow.getDay() !== 6 && !isKoreanHoliday(kstNow);
      const hhmm = kstNow.getHours() * 100 + kstNow.getMinutes();
      if (isTradingDay && hhmm >= 1530 && cached.todayDate !== todayKST) {
        console.log(
          `[volume-explosion] 캐시 무효 (장마감 후 데이터 불일치): cached=${cached.todayDate}, today=${todayKST}`,
        );
        // stale 캐시 삭제 후 아래에서 새로 조회 (분석 캐시도 함께 삭제)
        await redis.del(cacheKey);
        await redis.del(`volume-analysis:${todayKST}`).catch(() => {});
      } else {
        console.log(`[volume-explosion] 캐시 히트 (장마감): ${cacheKey}`);
        return NextResponse.json(cached);
      }
    }
  } catch {
    /* miss */
  }

  console.log(`[volume-explosion] 네이버에서 전종목 조회 시작`);

  const [kospiResult, kosdaqResult] = await Promise.all([
    fetchAllStocks("KOSPI"),
    fetchAllStocks("KOSDAQ"),
  ]);

  const todayAll = [...kospiResult.stocks, ...kosdaqResult.stocks];
  const dataDate = kospiResult.dataDate || kosdaqResult.dataDate;

  if (todayAll.length === 0 || !dataDate) {
    return NextResponse.json(
      { error: "네이버 금융에서 데이터를 가져올 수 없습니다." },
      { status: 500 },
    );
  }

  // 스냅샷 저장 (실제 거래일 기준)
  await saveSnapshot(dataDate, todayAll);

  // 이전 거래일 스냅샷 찾기
  let prevSnap = await findPreviousSnapshot(dataDate);

  // 스냅샷 없으면 siseJson fallback
  if (!prevSnap) {
    console.log(
      `[volume-explosion] 장마감 - 이전 스냅샷 없음 → siseJson fallback`,
    );
    const stockInfos = todayAll.map((s) => ({
      code: s.code,
      name: s.name,
      market: s.market,
    }));
    const yesterdayData = await fetchYesterdayFromSiseJson(
      stockInfos,
      dataDate,
    );
    if (yesterdayData) {
      prevSnap = yesterdayData;
      await saveSnapshot(yesterdayData.date, yesterdayData.stocks);
    }
  }

  const yesterdayLow = prevSnap
    ? prevSnap.stocks
        .filter(
          (s) =>
            isRegularStock(s.name) &&
            s.tradingValue > 0 &&
            s.tradingValue <= YESTERDAY_THRESHOLD,
        )
        .sort((a, b) => b.tradingValue - a.tradingValue)
    : [];

  // 폭발 종목 탐지
  let explosionStocks: VolumeExplosionResponse["explosionStocks"] = [];
  if (prevSnap) {
    const lowCodes = new Set(yesterdayLow.map((s) => s.code));
    const prevMap = new Map(prevSnap.stocks.map((s) => [s.code, s]));

    // 기존 거래대금 기준 필터
    const rawCandidates = todayAll.filter(
      (s) => lowCodes.has(s.code) && s.tradingValue >= TODAY_THRESHOLD,
    );

    // 조건 1: 등락률 > 0 (하락 마감 종목 제외)
    const candidates = rawCandidates.filter((s) => s.changeRate > 0);
    console.log(
      `[volume-explosion] 필터 — 거래대금 기준: ${rawCandidates.length}개 → 등락률>0 필터 후: ${candidates.length}개` +
        (rawCandidates.length > candidates.length
          ? ` (제외: ${rawCandidates.filter((s) => s.changeRate <= 0).map((s) => `${s.name}(${s.changeRate}%)`).join(", ")})`
          : ""),
    );

    // 조건 2: 갭상승 10% 이상 + 음봉(종가 < 시가) 제외 — 시가 개별 API 호출
    const openPrices = await Promise.all(
      candidates.map(async (s) => ({
        code: s.code,
        openPrice: await fetchOpenPrice(s.code),
      })),
    );
    const openMap = new Map(openPrices.map((p) => [p.code, p.openPrice]));

    explosionStocks = candidates
      .filter((s) => {
        const op = openMap.get(s.code);
        if (!op) return true; // 시가 조회 실패 → 보수적으로 포함
        const prevClose = s.closePrice / (1 + s.changeRate / 100);
        const gapPct = ((op - prevClose) / prevClose) * 100;
        const isGapUpBearish = gapPct >= 10 && s.closePrice < op;
        if (isGapUpBearish) {
          console.log(
            `[volume-explosion] 갭상승+음봉 제외: ${s.name} (갭=${gapPct.toFixed(1)}%, 시가=${op}, 종가=${s.closePrice})`,
          );
        }
        return !isGapUpBearish;
      })
      .sort((a, b) => b.tradingValue - a.tradingValue)
      .map((s) => ({
        code: s.code,
        name: s.name,
        yesterdayValue: prevMap.get(s.code)?.tradingValue || 0,
        todayValue: s.tradingValue,
        closePrice: s.closePrice,
        changeRate: s.changeRate,
        market: s.market,
      }));
  }

  console.log(
    `[volume-explosion] 완료 — dataDate=${dataDate}, 어제=${prevSnap?.date || "없음"}, 총=${todayAll.length}종목, 폭발=${explosionStocks.length}개`,
  );

  // --- 오늘의 폭발 종목을 Redis에 저장 (내일 D+1 체크용) ---
  if (explosionStocks.length > 0) {
    const dailyKey = `${EXPLOSION_DAILY_PREFIX}:${dataDate}`;
    const dailyData = explosionStocks.map((s) => ({
      code: s.code,
      name: s.name,
      todayValue: s.todayValue,
      closePrice: s.closePrice,
      changeRate: s.changeRate,
      market: s.market,
    }));
    try {
      await redis.set(dailyKey, dailyData, { ex: EXPLOSION_DAILY_TTL });
      console.log(`[volume-explosion] 일별 폭발 저장: ${dailyKey}, ${dailyData.length}종목`);
    } catch {
      /* */
    }
  }

  // --- 세력진입 의심 종목 계산 (D+1 거래대금 ≤ D일의 1/3) ---
  let suspectedStocks: VolumeExplosionResponse["suspectedStocks"] = [];
  {
    const todayMap = new Map(todayAll.map((s) => [s.code, s]));

    // 이전 거래일의 폭발 종목 로드 (dataDate 기준 이전 10영업일 탐색)
    const dDate = new Date(
      parseInt(dataDate.slice(0, 4)),
      parseInt(dataDate.slice(4, 6)) - 1,
      parseInt(dataDate.slice(6, 8)),
    );
    dDate.setDate(dDate.getDate() - 1);
    const prevCandidates = getWeekdayCandidates(10, dDate);

    for (const prevDate of prevCandidates) {
      try {
        const prevExplosions = await redis.get<
          { code: string; name: string; todayValue: number; closePrice: number; changeRate: number; market: string }[]
        >(`${EXPLOSION_DAILY_PREFIX}:${prevDate}`);

        if (prevExplosions && prevExplosions.length > 0) {
          console.log(`[volume-explosion] D일 폭발 로드: ${prevDate}, ${prevExplosions.length}종목`);

          suspectedStocks = prevExplosions
            .filter((s) => {
              const todayStock = todayMap.get(s.code);
              if (!todayStock) return false;
              const ratio = todayStock.tradingValue / s.todayValue;
              const pass = ratio <= 1 / 3;
              if (pass) {
                console.log(
                  `[volume-explosion] 세력진입 의심: ${s.name} D=${formatBillion(s.todayValue)} → D+1=${formatBillion(todayStock.tradingValue)} (${(ratio * 100).toFixed(1)}%)`,
                );
              }
              return pass;
            })
            .map((s) => {
              const todayStock = todayMap.get(s.code)!;
              return {
                code: s.code,
                name: s.name,
                dDayValue: s.todayValue,
                dPlusOneValue: todayStock.tradingValue,
                dDayClosePrice: s.closePrice,
                dDayChangeRate: s.changeRate,
                market: s.market,
                dDate: prevDate,
              };
            })
            .sort((a, b) => b.dDayValue - a.dDayValue);

          console.log(
            `[volume-explosion] 세력진입 의심 종목: ${suspectedStocks.length}개 (D=${prevDate}, D+1=${dataDate})`,
          );
          break; // 가장 최근 거래일의 폭발 데이터만 사용
        }
      } catch {
        /* continue */
      }
    }
  }

  const result: VolumeExplosionResponse = {
    todayDate: dataDate,
    yesterdayDate: prevSnap?.date || "",
    marketOpen: false,
    yesterdayStocks: yesterdayLow.map((s) => ({
      code: s.code,
      name: s.name,
      value: s.tradingValue,
      market: s.market,
    })),
    explosionStocks,
    suspectedStocks,
    updatedAt: new Date().toISOString(),
  };

  try {
    // 거래일인데 네이버 데이터가 아직 오늘이 아니면(장 시작 전) → 짧은 TTL로 캐시
    const isTradingDay = kstNow.getDay() !== 0 && kstNow.getDay() !== 6 && !isKoreanHoliday(kstNow);
    const cacheTtl =
      isTradingDay && dataDate !== todayKST ? CACHE_TTL_OPEN : CACHE_TTL_CLOSED;
    await redis.set(cacheKey, result, { ex: cacheTtl });
    console.log(
      `[volume-explosion] 캐시 저장: ${cacheKey}, TTL=${cacheTtl}초 (dataDate=${dataDate}, todayKST=${todayKST})`,
    );
  } catch {
    /* */
  }

  return NextResponse.json(result);
}
