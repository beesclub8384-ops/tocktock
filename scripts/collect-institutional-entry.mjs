/**
 * 세력진입 의심 패턴 후 15거래일 OHLC 추적 데이터 수집
 *
 * 로직:
 * 1. 전종목 siseJson에서 최근 ~4개월 일봉 데이터 수집
 * 2. 거래대금 폭발 (전일 300억 이하 → 당일 950억 이상, 등락률 > 0) 탐지
 * 3. 폭발 다음날(D+1) 거래대금이 D일의 1/3 이하 → 세력진입 의심
 * 4. D+1 종가 기준으로 D+2 ~ D+16의 OHLC를 등락률(%)로 변환
 * 5. JSON 저장
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "..", "data", "krx-history", "institutional-entry-analysis.json");

const NAVER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

const YESTERDAY_THRESHOLD = 30_000_000_000; // 300억
const TODAY_THRESHOLD = 95_000_000_000; // 950억
const MARKET_CAP_MIN = 50_000_000_000; // 500억
const MARKET_CAP_MAX = 2_000_000_000_000; // 2조
const TRACKING_DAYS = 15; // D+2 ~ D+16

const ETF_BRAND_RE =
  /^(KODEX|TIGER|KBSTAR|ACE|ARIRANG|HANARO|SOL|KOSEF|KINDEX|TIMEFOLIO|PLUS|FOCUS|WOORI|BNK|RISE|KIWOOM|KoAct|WON|HK|1Q|TIME|DAISHIN\d+|UNICORN|TRUSTON|VITA)/;

function isRegularStock(name) {
  if (/ETF|ETN/i.test(name)) return false;
  if (ETF_BRAND_RE.test(name)) return false;
  if (name.includes("리츠") || /REIT/i.test(name)) return false;
  if (/스팩/.test(name)) return false;
  if (/채권|선물|인버스|레버리지/.test(name)) return false;
  if (/^(맥쿼리|KB발해)인프라/.test(name)) return false;
  if (/우[A-C]?$/.test(name)) return false;
  return true;
}

function parseNum(s) {
  return Number(String(s).replace(/,/g, "")) || 0;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- 네이버 전종목 조회 ---
async function fetchNaverPage(market, page, pageSize) {
  const url = `https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${page}&pageSize=${pageSize}`;
  try {
    const res = await fetch(url, { headers: NAVER_HEADERS, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchAllStockCodes(market) {
  const PAGE_SIZE = 100;
  const first = await fetchNaverPage(market, 1, PAGE_SIZE);
  if (!first?.stocks?.length) return [];

  const stocks = first.stocks.map((s) => ({
    code: s.itemCode,
    name: s.stockName,
    marketCap: parseNum(s.marketValue) * 1_000_000,
    market,
  }));

  const totalPages = Math.ceil(first.totalCount / PAGE_SIZE);
  const BATCH = 5;
  for (let i = 2; i <= totalPages; i += BATCH) {
    const promises = [];
    for (let j = i; j < i + BATCH && j <= totalPages; j++) {
      promises.push(fetchNaverPage(market, j, PAGE_SIZE));
    }
    const results = await Promise.all(promises);
    for (const r of results) {
      if (r?.stocks) {
        stocks.push(
          ...r.stocks.map((s) => ({
            code: s.itemCode,
            name: s.stockName,
            marketCap: parseNum(s.marketValue) * 1_000_000,
            market,
          }))
        );
      }
    }
  }
  return stocks;
}

// --- siseJson 일봉 히스토리 조회 ---
// 컬럼: [날짜, 시가, 고가, 저가, 종가, 거래량, 거래대금(원)]
// 실제로 거래대금 컬럼이 없는 경우 종가*거래량으로 근사
async function fetchSiseJson(code, startDate, endDate) {
  const url = `https://api.finance.naver.com/siseJson.naver?symbol=${code}&requestType=1&startTime=${startDate}&endTime=${endDate}&timeframe=day`;
  try {
    const res = await fetch(url, { headers: NAVER_HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const text = await res.text();
    const parsed = JSON.parse(text.trim().replace(/'/g, '"'));
    if (!Array.isArray(parsed) || parsed.length < 2) return [];
    return parsed.slice(1).map((row) => ({
      date: String(row[0]).trim(),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      tradingValue: Number(row[5]) > 0 && Number(row[4]) > 0
        ? Math.round(Number(row[4]) * Number(row[5]))
        : 0,
    }));
  } catch {
    return [];
  }
}

// --- 메인 ---
async function main() {
  console.log("=== 세력진입 의심 패턴 데이터 수집 시작 ===");

  // 1. 전종목 코드 수집
  console.log("[1/5] 전종목 코드 수집 중...");
  const [kospiStocks, kosdaqStocks] = await Promise.all([
    fetchAllStockCodes("KOSPI"),
    fetchAllStockCodes("KOSDAQ"),
  ]);
  const allStocks = [...kospiStocks, ...kosdaqStocks].filter(
    (s) => isRegularStock(s.name) && s.marketCap > MARKET_CAP_MIN && s.marketCap <= MARKET_CAP_MAX
  );
  console.log(`  전체: ${kospiStocks.length + kosdaqStocks.length}종목 → 필터 후: ${allStocks.length}종목`);

  // 2. siseJson으로 ~4개월 일봉 수집
  const now = new Date();
  const kstNow = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 9 * 3600000);
  const endDate = `${kstNow.getFullYear()}${String(kstNow.getMonth() + 1).padStart(2, "0")}${String(kstNow.getDate()).padStart(2, "0")}`;
  const startD = new Date(kstNow);
  startD.setDate(startD.getDate() - 120); // ~4개월
  const startDate = `${startD.getFullYear()}${String(startD.getMonth() + 1).padStart(2, "0")}${String(startD.getDate()).padStart(2, "0")}`;

  console.log(`[2/5] siseJson 수집: ${startDate} ~ ${endDate} (${allStocks.length}종목)`);

  const stockHistoryMap = new Map();
  const BATCH = 30;

  for (let i = 0; i < allStocks.length; i += BATCH) {
    const batch = allStocks.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (s) => ({
        code: s.code,
        history: await fetchSiseJson(s.code, startDate, endDate),
      }))
    );
    for (const r of results) {
      if (r.history.length >= 5) {
        stockHistoryMap.set(r.code, r.history);
      }
    }
    if (i + BATCH < allStocks.length) await sleep(150);
    if ((i / BATCH) % 20 === 0) {
      console.log(`  진행: ${Math.min(i + BATCH, allStocks.length)}/${allStocks.length}`);
    }
  }
  console.log(`  완료: ${stockHistoryMap.size}종목 히스토리 수집`);

  // 3. 세력진입 의심 패턴 탐지
  console.log("[3/5] 세력진입 의심 패턴 탐지 중...");
  const stockInfoMap = new Map(allStocks.map((s) => [s.code, s]));
  const cases = [];

  for (const [code, history] of stockHistoryMap) {
    const info = stockInfoMap.get(code);
    if (!info) continue;

    for (let idx = 1; idx < history.length - TRACKING_DAYS - 1; idx++) {
      const dMinus1 = history[idx - 1]; // D-1
      const dDay = history[idx]; // D (폭발일)
      const dPlus1 = history[idx + 1]; // D+1

      // D-1 거래대금 <= 300억
      if (dMinus1.tradingValue > YESTERDAY_THRESHOLD) continue;
      // D 거래대금 >= 950억
      if (dDay.tradingValue < TODAY_THRESHOLD) continue;
      // D일 등락률 > 0
      if (dMinus1.close <= 0) continue;
      const dChangeRate = ((dDay.close - dMinus1.close) / dMinus1.close) * 100;
      if (dChangeRate <= 0) continue;
      // 갭상승(10%+) + 음봉 제외
      const gapPct = ((dDay.open - dMinus1.close) / dMinus1.close) * 100;
      if (gapPct >= 10 && dDay.close < dDay.open) continue;
      // D+1 거래대금 <= D일의 1/3
      if (dPlus1.tradingValue > dDay.tradingValue / 3) continue;

      // 패턴 확인! D+1 종가를 기준점(0%)으로 추적
      const basePrice = dPlus1.close;
      if (basePrice <= 0) continue;

      const tracking = [];
      let hasAllDays = true;
      for (let t = 0; t < TRACKING_DAYS; t++) {
        const dayIdx = idx + 2 + t; // D+2, D+3, ... D+16
        if (dayIdx >= history.length) {
          hasAllDays = false;
          break;
        }
        const d = history[dayIdx];
        tracking.push({
          day: t + 2, // D+2 ~ D+16
          date: d.date,
          open: +((d.open / basePrice - 1) * 100).toFixed(2),
          high: +((d.high / basePrice - 1) * 100).toFixed(2),
          low: +((d.low / basePrice - 1) * 100).toFixed(2),
          close: +((d.close / basePrice - 1) * 100).toFixed(2),
        });
      }

      if (!hasAllDays || tracking.length < TRACKING_DAYS) continue;

      cases.push({
        code,
        name: info.name,
        market: info.market,
        dDate: dDay.date,
        dDayTradingValue: dDay.tradingValue,
        dDayChangeRate: +dChangeRate.toFixed(2),
        dPlusOneClose: basePrice,
        dPlusOneTradingValue: dPlus1.tradingValue,
        dropRatio: +((dPlus1.tradingValue / dDay.tradingValue) * 100).toFixed(1),
        tracking,
      });
    }
  }

  console.log(`  발견: ${cases.length}건`);

  // 4. 평균/중앙값 계산
  console.log("[4/5] 통계 계산 중...");
  const stats = { mean: [], median: [] };

  for (let t = 0; t < TRACKING_DAYS; t++) {
    const day = t + 2;
    const opens = cases.map((c) => c.tracking[t].open).sort((a, b) => a - b);
    const highs = cases.map((c) => c.tracking[t].high).sort((a, b) => a - b);
    const lows = cases.map((c) => c.tracking[t].low).sort((a, b) => a - b);
    const closes = cases.map((c) => c.tracking[t].close).sort((a, b) => a - b);

    const avg = (arr) => +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2);
    const med = (arr) => {
      const mid = Math.floor(arr.length / 2);
      return arr.length % 2 !== 0 ? arr[mid] : +((arr[mid - 1] + arr[mid]) / 2).toFixed(2);
    };

    stats.mean.push({ day, open: avg(opens), high: avg(highs), low: avg(lows), close: avg(closes) });
    stats.median.push({ day, open: med(opens), high: med(highs), low: med(lows), close: med(closes) });
  }

  // 5. JSON 저장
  console.log("[5/5] JSON 저장 중...");
  const output = {
    generated: new Date().toISOString().slice(0, 10),
    description: "세력진입 의심 패턴(거래대금 폭발 후 D+1 1/3 이하 급감) 후 15거래일 OHLC 추적",
    baseDescription: "D+1 종가 = 0%. D+2~D+16 시가/고가/저가/종가를 D+1 종가 대비 등락률(%)로 표시",
    totalCases: cases.length,
    trackingDays: TRACKING_DAYS,
    dateRange: { start: startDate, end: endDate },
    stats,
    cases,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\n=== 완료: ${OUTPUT_PATH} ===`);
  console.log(`  총 ${cases.length}건, ${startDate}~${endDate}`);
}

main().catch(console.error);
