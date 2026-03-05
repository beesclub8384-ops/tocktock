/**
 * 세력진입 의심 패턴 백테스트
 *
 * krx-daily-all.json (전종목 3년치 일봉)에서 패턴을 탐지합니다.
 * 네이버 API 호출 없이 로컬 데이터만 사용합니다.
 *
 * 패턴 조건:
 * 1. D-1 거래대금 ≤ 300억
 * 2. D일 거래대금 ≥ 950억 & 등락률 > 0 (갭상승10%+음봉 제외)
 * 3. D+1 거래대금 ≤ D일의 1/3
 * → D+1 종가 = 0% 기준, D+2~D+16 OHLC 등락률(%) 추적
 *
 * 입력: data/krx-history/krx-daily-all.json
 * 출력: data/krx-history/institutional-entry-analysis.json
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INPUT_PATH = join(__dirname, "..", "data", "krx-history", "krx-daily-all.json");
const OUTPUT_PATH = join(__dirname, "..", "data", "krx-history", "institutional-entry-analysis.json");

const YESTERDAY_THRESHOLD = 30_000_000_000; // 300억
const TODAY_THRESHOLD = 95_000_000_000; // 950억
const TRACKING_DAYS = 15; // D+2 ~ D+16

// --- 메인 ---
const startTime = Date.now();
console.log("=== 세력진입 의심 패턴 백테스트 시작 ===\n");

console.log("[1/4] krx-daily-all.json 로딩...");
const raw = readFileSync(INPUT_PATH, "utf-8");
const krxData = JSON.parse(raw);
console.log(`  ${krxData.totalStocks}종목, ${krxData.dateRange.start}~${krxData.dateRange.end}\n`);

console.log("[2/4] 패턴 탐지 중...");
const events = [];
let scanned = 0;

for (const stock of krxData.stocks) {
  const { code, name, market, daily } = stock;
  if (!daily || daily.length < 20) continue;
  scanned++;

  for (let idx = 1; idx < daily.length - 1; idx++) {
    const dMinus1 = daily[idx - 1];
    const dDay = daily[idx];
    const dPlus1 = daily[idx + 1];

    // D-1 거래대금 ≤ 300억
    if (dMinus1.tradingValue > YESTERDAY_THRESHOLD) continue;
    // D 거래대금 ≥ 950억
    if (dDay.tradingValue < TODAY_THRESHOLD) continue;
    // D일 등락률 > 0
    if (dMinus1.close <= 0) continue;
    const dChangeRate = ((dDay.close - dMinus1.close) / dMinus1.close) * 100;
    if (dChangeRate <= 0) continue;
    // 갭상승(10%+) + 음봉 제외
    const gapPct = ((dDay.open - dMinus1.close) / dMinus1.close) * 100;
    if (gapPct >= 10 && dDay.close < dDay.open) continue;
    // D+1 거래대금 ≤ D일의 1/3
    if (dPlus1.tradingValue > dDay.tradingValue / 3) continue;

    // D+1 종가가 기준점
    const basePrice = dPlus1.close;
    if (basePrice <= 0) continue;

    // postExplosion: D+1(day=1) ~ D+16(day=16)
    const maxDayIdx = Math.min(idx + 1 + 16, daily.length);
    if (maxDayIdx - (idx + 1) < 16) continue; // 16일 미만이면 스킵

    const postExplosion = [];
    for (let t = idx + 1; t < maxDayIdx; t++) {
      const d = daily[t];
      const dayNum = t - idx;
      postExplosion.push({
        day: dayNum,
        date: d.date,
        open: +((d.open / basePrice - 1) * 100).toFixed(2),
        high: +((d.high / basePrice - 1) * 100).toFixed(2),
        low: +((d.low / basePrice - 1) * 100).toFixed(2),
        close: +((d.close / basePrice - 1) * 100).toFixed(2),
      });
    }

    events.push({
      code,
      name,
      market,
      dDate: dDay.date,
      dDayTradingValue: dDay.tradingValue,
      dDayChangeRate: +dChangeRate.toFixed(2),
      dPlusOneClose: basePrice,
      dPlusOneTradingValue: dPlus1.tradingValue,
      dropRatio: +((dPlus1.tradingValue / dDay.tradingValue) * 100).toFixed(1),
      postExplosion,
    });
  }
}

console.log(`  스캔: ${scanned}종목 → 발견: ${events.length}건\n`);

// 통계 계산 (D+2 ~ D+16)
console.log("[3/4] 통계 계산 중...");
const stats = { mean: [], median: [] };

for (let dayNum = 2; dayNum <= 16; dayNum++) {
  const opens = [], highs = [], lows = [], closes = [];

  for (const ev of events) {
    const d = ev.postExplosion.find((p) => p.day === dayNum);
    if (d) {
      opens.push(d.open);
      highs.push(d.high);
      lows.push(d.low);
      closes.push(d.close);
    }
  }

  if (opens.length === 0) continue;

  opens.sort((a, b) => a - b);
  highs.sort((a, b) => a - b);
  lows.sort((a, b) => a - b);
  closes.sort((a, b) => a - b);

  const avg = (arr) => +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2);
  const med = (arr) => {
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 !== 0 ? arr[mid] : +((arr[mid - 1] + arr[mid]) / 2).toFixed(2);
  };

  stats.mean.push({ day: dayNum, open: avg(opens), high: avg(highs), low: avg(lows), close: avg(closes) });
  stats.median.push({ day: dayNum, open: med(opens), high: med(highs), low: med(lows), close: med(closes) });
}

// JSON 저장
console.log("[4/4] JSON 저장 중...");
const output = {
  generated: new Date().toISOString().slice(0, 10),
  description: "세력진입 의심 패턴(거래대금 폭발 후 D+1 1/3 이하 급감) 후 15거래일 OHLC 추적",
  baseDescription: "D+1 종가(day=1) = 0%. D+2~D+16의 시가/고가/저가/종가를 D+1 종가 대비 등락률(%)로 표시. postExplosion[0]은 day=1(D+1)로 기준점.",
  totalCases: events.length,
  trackingDays: TRACKING_DAYS,
  dateRange: krxData.dateRange,
  stats,
  events,
};

writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\n=== 완료 ===`);
console.log(`  파일: ${OUTPUT_PATH}`);
console.log(`  이벤트: ${events.length}건`);
console.log(`  기간: ${krxData.dateRange.start} ~ ${krxData.dateRange.end}`);
console.log(`  소요: ${elapsed}s`);
