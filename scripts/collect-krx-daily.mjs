/**
 * KRX 전종목 3년치 일봉 데이터 수집
 *
 * 네이버 금융 siseJson API에서 전종목(KOSPI+KOSDAQ) 일봉을 수집하여
 * data/krx-history/krx-daily-all.json에 저장합니다.
 *
 * - 중간에 끊겨도 이어서 수집 가능 (임시 파일 기반 체크포인트)
 * - API 부하 방지용 딜레이 내장
 *
 * 사용: npm run collect-data
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data", "krx-history");
const OUTPUT_PATH = join(DATA_DIR, "krx-daily-all.json");
const CHECKPOINT_PATH = join(DATA_DIR, ".collect-checkpoint.json");

const NAVER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

// --- ETF/스팩 등 제외 필터 ---
const ETF_BRAND_RE =
  /^(KODEX|TIGER|KBSTAR|ACE|ARIRANG|HANARO|SOL|KOSEF|KINDEX|TIMEFOLIO|PLUS|FOCUS|WOORI|BNK|RISE|KIWOOM|KoAct|WON|HK|1Q|TIME|DAISHIN\d+|UNICORN|TRUSTON|VITA|에셋플러스|마이다스|더제이|파워|마이티|히어로)\s/;

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

function getKSTNow() {
  const now = new Date();
  return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 9 * 3600000);
}

function fmtDate(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

// --- 체크포인트 관리 ---
function loadCheckpoint() {
  if (!existsSync(CHECKPOINT_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CHECKPOINT_PATH, "utf-8"));
  } catch {
    return null;
  }
}

function saveCheckpoint(data) {
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(data), "utf-8");
}

function clearCheckpoint() {
  try {
    if (existsSync(CHECKPOINT_PATH)) unlinkSync(CHECKPOINT_PATH);
  } catch {}
}

// --- 네이버 전종목 코드 수집 ---
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

  const stocks = first.stocks
    .filter((s) => isRegularStock(s.stockName))
    .map((s) => ({ code: s.itemCode, name: s.stockName, market }));

  const totalPages = Math.ceil(first.totalCount / PAGE_SIZE);
  for (let i = 2; i <= totalPages; i += 5) {
    const promises = [];
    for (let j = i; j < i + 5 && j <= totalPages; j++) {
      promises.push(fetchNaverPage(market, j, PAGE_SIZE));
    }
    const results = await Promise.all(promises);
    for (const r of results) {
      if (r?.stocks) {
        stocks.push(
          ...r.stocks
            .filter((s) => isRegularStock(s.stockName))
            .map((s) => ({ code: s.itemCode, name: s.stockName, market }))
        );
      }
    }
  }
  return stocks;
}

// --- siseJson 일봉 히스토리 ---
// 컬럼: [날짜, 시가, 고가, 저가, 종가, 거래량]
async function fetchSiseJson(code, startDate, endDate, retries = 3) {
  const url = `https://api.finance.naver.com/siseJson.naver?symbol=${code}&requestType=1&startTime=${startDate}&endTime=${endDate}&timeframe=day`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: NAVER_HEADERS, signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        if (attempt < retries) { await sleep(1000 * (attempt + 1)); continue; }
        return [];
      }
      const text = await res.text();
      const parsed = JSON.parse(text.trim().replace(/'/g, '"'));
      if (!Array.isArray(parsed) || parsed.length < 2) return [];

      return parsed.slice(1).map((row) => {
        const open = Number(row[1]);
        const high = Number(row[2]);
        const low = Number(row[3]);
        const close = Number(row[4]);
        const volume = Number(row[5]);
        // 거래대금: 종가 × 거래량 (근사치, siseJson에 별도 거래대금 컬럼 없음)
        const tradingValue = close > 0 && volume > 0 ? Math.round(close * volume) : 0;
        // 등락률은 전일 종가 대비로 나중에 계산 (여기서는 raw 저장)
        return {
          date: String(row[0]).trim(),
          open,
          high,
          low,
          close,
          volume,
          tradingValue,
        };
      });
    } catch (err) {
      if (attempt < retries) {
        await sleep(1000 * (attempt + 1));
      }
    }
  }
  return [];
}

// --- 메인 ---
async function main() {
  const totalStart = Date.now();
  console.log("=== KRX 전종목 일봉 데이터 수집 시작 ===\n");

  // 디렉토리 생성
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  // 날짜 범위: 3년
  const kstNow = getKSTNow();
  const endDate = fmtDate(kstNow);
  const startD = new Date(kstNow);
  startD.setFullYear(startD.getFullYear() - 3);
  const startDate = fmtDate(startD);

  console.log(`  기간: ${startDate} ~ ${endDate} (약 729거래일)`);

  // 체크포인트 확인
  const checkpoint = loadCheckpoint();
  let allStocks = [];
  let collectedMap = new Map(); // code → dailyData[]
  let startIdx = 0;

  if (checkpoint && checkpoint.startDate === startDate && checkpoint.endDate === endDate) {
    console.log(`\n  체크포인트 발견: ${checkpoint.completed}/${checkpoint.total}종목 수집됨. 이어서 수집합니다.\n`);
    allStocks = checkpoint.stocks;
    // 기존 수집 데이터 로드
    if (existsSync(OUTPUT_PATH)) {
      try {
        const existing = JSON.parse(readFileSync(OUTPUT_PATH, "utf-8"));
        if (existing.stocks) {
          for (const s of existing.stocks) {
            collectedMap.set(s.code, s.daily);
          }
        }
      } catch {}
    }
    startIdx = checkpoint.completed;
  } else {
    // 1. 전종목 코드 수집
    console.log("\n[1/3] 전종목 코드 수집 중...");
    const [kospiStocks, kosdaqStocks] = await Promise.all([
      fetchAllStockCodes("KOSPI"),
      fetchAllStockCodes("KOSDAQ"),
    ]);
    allStocks = [...kospiStocks, ...kosdaqStocks];
    console.log(`  KOSPI: ${kospiStocks.length}종목, KOSDAQ: ${kosdaqStocks.length}종목 → 합계: ${allStocks.length}종목`);
  }

  // 2. siseJson 일봉 수집
  const total = allStocks.length;
  const BATCH = 25;
  const DELAY_MS = 200; // 배치간 딜레이

  console.log(`\n[2/3] siseJson 수집: ${startDate} ~ ${endDate} (${total}종목, 시작=${startIdx})`);
  const estMinutes = Math.ceil((total - startIdx) / BATCH * (DELAY_MS + 300) / 60000);
  console.log(`  예상 소요: ~${estMinutes}분\n`);

  for (let i = startIdx; i < total; i += BATCH) {
    const batch = allStocks.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (s) => {
        const daily = await fetchSiseJson(s.code, startDate, endDate);
        return { code: s.code, daily };
      })
    );

    for (const r of results) {
      if (r.daily.length > 0) {
        // 등락률 계산
        for (let j = 0; j < r.daily.length; j++) {
          if (j === 0) {
            r.daily[j].changeRate = 0;
          } else {
            const prevClose = r.daily[j - 1].close;
            r.daily[j].changeRate =
              prevClose > 0
                ? +((r.daily[j].close / prevClose - 1) * 100).toFixed(2)
                : 0;
          }
        }
        collectedMap.set(r.code, r.daily);
      }
    }

    const progress = Math.min(i + BATCH, total);
    const elapsed = ((Date.now() - totalStart) / 1000).toFixed(0);
    const collected = collectedMap.size;

    // 진행 상황 출력 (매 100종목마다 + 완료시)
    if (progress % 100 < BATCH || progress === total) {
      console.log(`  ${progress}/${total} (${collected}종목 수집, ${elapsed}s)`);
    }

    // 체크포인트 저장 (매 500종목마다 — 중간 JSON 저장은 완료 시에만)
    if (progress % 500 < BATCH || progress === total) {
      saveCheckpoint({ startDate, endDate, stocks: allStocks, total, completed: progress });
    }

    if (i + BATCH < total) await sleep(DELAY_MS);
  }

  // 3. 최종 JSON 저장
  console.log("\n[3/3] 최종 JSON 저장 중...");
  const finalOutput = buildOutput(allStocks, collectedMap, startDate, endDate, true);
  writeFileSync(OUTPUT_PATH, JSON.stringify(finalOutput, null, 0), "utf-8");

  // 체크포인트 삭제
  clearCheckpoint();

  const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
  const fileSizeMB = (Buffer.byteLength(JSON.stringify(finalOutput)) / 1024 / 1024).toFixed(1);

  // 날짜 통계
  const allDates = new Set();
  for (const s of finalOutput.stocks) {
    for (const d of s.daily) allDates.add(d.date);
  }

  console.log(`\n=== 완료 ===`);
  console.log(`  파일: ${OUTPUT_PATH}`);
  console.log(`  크기: ${fileSizeMB}MB`);
  console.log(`  종목: ${finalOutput.stocks.length}종목`);
  console.log(`  거래일: ${allDates.size}일`);
  console.log(`  기간: ${startDate} ~ ${endDate}`);
  console.log(`  소요: ${totalElapsed}s`);
}

function buildOutput(allStocks, collectedMap, startDate, endDate, isFinal) {
  const stockInfoMap = new Map(allStocks.map((s) => [s.code, s]));
  const stocks = [];

  for (const [code, daily] of collectedMap) {
    const info = stockInfoMap.get(code);
    if (!info) continue;
    stocks.push({
      code,
      name: info.name,
      market: info.market,
      daily,
    });
  }

  return {
    generated: new Date().toISOString().slice(0, 10),
    description: "KRX 전종목(KOSPI+KOSDAQ) 3년치 일봉 데이터",
    dateRange: { start: startDate, end: endDate },
    totalStocks: stocks.length,
    complete: isFinal,
    stocks,
  };
}

main().catch((err) => {
  console.error("치명적 오류:", err);
  process.exit(1);
});
