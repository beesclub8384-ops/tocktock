/**
 * 세력진입 의심 패턴 — 성공/실패 그룹 비교 분석
 *
 * 성공: D+2~D+16 중 종가가 한 번이라도 +5% 이상
 * 실패: 한 번도 +5% 못 찍음
 *
 * 입력: institutional-entry-analysis.json + krx-daily-all.json (D일 OHLC용)
 * 출력: success-vs-fail-comparison.json
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data", "krx-history");
const ANALYSIS_PATH = join(DATA_DIR, "institutional-entry-analysis.json");
const KRX_DAILY_PATH = join(DATA_DIR, "krx-daily-all.json");
const OUTPUT_PATH = join(DATA_DIR, "success-vs-fail-comparison.json");

const SUCCESS_THRESHOLD = 5; // +5%

// --- 통계 헬퍼 ---
function calcStats(arr) {
  if (arr.length === 0) return { count: 0, mean: 0, median: 0, std: 0, min: 0, max: 0, q25: 0, q75: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const median = n % 2 !== 0 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const q25 = sorted[Math.floor(n * 0.25)];
  const q75 = sorted[Math.floor(n * 0.75)];
  return {
    count: n,
    mean: +mean.toFixed(2),
    median: +median.toFixed(2),
    std: +std.toFixed(2),
    min: +sorted[0].toFixed(2),
    max: +sorted[n - 1].toFixed(2),
    q25: +q25.toFixed(2),
    q75: +q75.toFixed(2),
  };
}

function fmtBillion(val) {
  const eok = Math.round(val / 1e8);
  return eok >= 10000 ? (eok / 10000).toFixed(1) + "조" : eok.toLocaleString() + "억";
}

// --- 메인 ---
console.log("=== 성공/실패 그룹 비교 분석 ===\n");

// 1. 데이터 로딩
console.log("[1/4] 데이터 로딩...");
const analysis = JSON.parse(readFileSync(ANALYSIS_PATH, "utf-8"));
const krxDaily = JSON.parse(readFileSync(KRX_DAILY_PATH, "utf-8"));
console.log(`  이벤트: ${analysis.events.length}건`);
console.log(`  일봉 데이터: ${krxDaily.totalStocks}종목\n`);

// krx-daily-all에서 종목별 날짜 인덱스 구축
const dailyMap = new Map(); // code → Map<date, dayData>
for (const stock of krxDaily.stocks) {
  const dateMap = new Map();
  for (const d of stock.daily) {
    dateMap.set(d.date, d);
  }
  dailyMap.set(stock.code, dateMap);
}

// 2. 그룹 분류 + 특성 수집
console.log("[2/4] 그룹 분류 중...");

const success = [];
const fail = [];

for (const ev of analysis.events) {
  // D+2~D+16 종가 중 +5% 이상이 한 번이라도 있는지
  const trackingDays = ev.postExplosion.filter((d) => d.day >= 2 && d.day <= 16);
  const maxClose = Math.max(...trackingDays.map((d) => d.close));
  const isSuccess = maxClose >= SUCCESS_THRESHOLD;

  // krx-daily-all에서 D일, D-1일, D+1일 raw OHLC 가져오기
  const stockDailyMap = dailyMap.get(ev.code);
  const dDayRaw = stockDailyMap?.get(ev.dDate);

  // D+1 날짜는 postExplosion day=1
  const dPlus1Entry = ev.postExplosion.find((d) => d.day === 1);
  const dPlus1Date = dPlus1Entry?.date;
  const dPlus1Raw = dPlus1Date ? stockDailyMap?.get(dPlus1Date) : null;

  // D-1 날짜 찾기 (krx daily에서 D일 이전 거래일)
  let dMinus1Raw = null;
  if (stockDailyMap && dDayRaw) {
    const allDates = [...stockDailyMap.keys()].sort();
    const dIdx = allDates.indexOf(ev.dDate);
    if (dIdx > 0) {
      dMinus1Raw = stockDailyMap.get(allDates[dIdx - 1]);
    }
  }

  // D일 고가-저가 폭 (변동성, 전일 종가 대비 %)
  let dDayRange = 0;
  let dDayRangeAbs = 0;
  let dDayHighFromPrevClose = 0;
  let dDayLowFromPrevClose = 0;
  if (dDayRaw && dMinus1Raw && dMinus1Raw.close > 0) {
    const prevClose = dMinus1Raw.close;
    dDayRange = +((dDayRaw.high - dDayRaw.low) / prevClose * 100).toFixed(2);
    dDayRangeAbs = dDayRaw.high - dDayRaw.low;
    dDayHighFromPrevClose = +((dDayRaw.high / prevClose - 1) * 100).toFixed(2);
    dDayLowFromPrevClose = +((dDayRaw.low / prevClose - 1) * 100).toFixed(2);
  }

  // D일 시가 갭 (전일 종가 대비)
  let dDayGap = 0;
  if (dDayRaw && dMinus1Raw && dMinus1Raw.close > 0) {
    dDayGap = +((dDayRaw.open / dMinus1Raw.close - 1) * 100).toFixed(2);
  }

  // D일 상체/하체 비율 (양봉 기준: 윗꼬리 / 몸통)
  let dDayUpperWick = 0;
  let dDayLowerWick = 0;
  let dDayBodyRatio = 0;
  if (dDayRaw && dDayRaw.high > dDayRaw.low) {
    const body = Math.abs(dDayRaw.close - dDayRaw.open);
    const range = dDayRaw.high - dDayRaw.low;
    const upperWick = dDayRaw.high - Math.max(dDayRaw.close, dDayRaw.open);
    const lowerWick = Math.min(dDayRaw.close, dDayRaw.open) - dDayRaw.low;
    dDayUpperWick = +(upperWick / range * 100).toFixed(1);
    dDayLowerWick = +(lowerWick / range * 100).toFixed(1);
    dDayBodyRatio = +(body / range * 100).toFixed(1);
  }

  // D+1일 등락률 (D일 종가 대비)
  let dPlus1ChangeRate = 0;
  if (dDayRaw && dPlus1Raw && dDayRaw.close > 0) {
    dPlus1ChangeRate = +((dPlus1Raw.close / dDayRaw.close - 1) * 100).toFixed(2);
  }

  // D+1일 고가-저가 변동폭 (D일 종가 대비 %)
  let dPlus1Range = 0;
  if (dPlus1Raw && dDayRaw && dDayRaw.close > 0) {
    dPlus1Range = +((dPlus1Raw.high - dPlus1Raw.low) / dDayRaw.close * 100).toFixed(2);
  }

  // D+1 시가 갭 (D일 종가 대비)
  let dPlus1Gap = 0;
  if (dPlus1Raw && dDayRaw && dDayRaw.close > 0) {
    dPlus1Gap = +((dPlus1Raw.open / dDayRaw.close - 1) * 100).toFixed(2);
  }

  // D+2~D+16 통계
  const maxHigh = Math.max(...trackingDays.map((d) => d.high));
  const minLow = Math.min(...trackingDays.map((d) => d.low));
  const d16Close = trackingDays.find((d) => d.day === 16)?.close ?? 0;

  // 최고 종가 도달일
  const maxCloseDay = trackingDays.reduce((best, d) => d.close > best.close ? d : best, trackingDays[0]);

  const record = {
    code: ev.code,
    name: ev.name,
    market: ev.market,
    dDate: ev.dDate,
    // D일 특성
    dDayTradingValue: ev.dDayTradingValue,
    dDayTradingValueBillion: +(ev.dDayTradingValue / 1e8).toFixed(0), // 억 단위
    dDayChangeRate: ev.dDayChangeRate,
    dDayGap,
    dDayRange,
    dDayHighFromPrevClose,
    dDayLowFromPrevClose,
    dDayUpperWick,
    dDayLowerWick,
    dDayBodyRatio,
    // D+1일 특성
    dPlusOneTradingValue: ev.dPlusOneTradingValue,
    dPlusOneTradingValueBillion: +(ev.dPlusOneTradingValue / 1e8).toFixed(0),
    dPlus1ChangeRate,
    dPlus1Gap,
    dPlus1Range,
    dropRatio: ev.dropRatio,
    // 결과
    maxClose,
    maxCloseDay: maxCloseDay.day,
    maxHigh,
    minLow,
    d16Close,
    isSuccess,
  };

  if (isSuccess) {
    success.push(record);
  } else {
    fail.push(record);
  }
}

console.log(`  성공 그룹: ${success.length}건 (${(success.length / analysis.events.length * 100).toFixed(1)}%)`);
console.log(`  실패 그룹: ${fail.length}건 (${(fail.length / analysis.events.length * 100).toFixed(1)}%)\n`);

// 3. 비교 통계 계산
console.log("[3/4] 비교 통계 계산 중...");

const metrics = [
  { key: "dDayTradingValueBillion", label: "D일 거래대금(억)", unit: "억" },
  { key: "dDayChangeRate", label: "D일 등락률(%)", unit: "%" },
  { key: "dDayGap", label: "D일 시가갭(%)", unit: "%" },
  { key: "dDayRange", label: "D일 고가-저가 변동폭(%)", unit: "%" },
  { key: "dDayHighFromPrevClose", label: "D일 고가(전일종가대비%)", unit: "%" },
  { key: "dDayLowFromPrevClose", label: "D일 저가(전일종가대비%)", unit: "%" },
  { key: "dDayUpperWick", label: "D일 윗꼬리 비율(%)", unit: "%" },
  { key: "dDayLowerWick", label: "D일 아랫꼬리 비율(%)", unit: "%" },
  { key: "dDayBodyRatio", label: "D일 몸통 비율(%)", unit: "%" },
  { key: "dPlusOneTradingValueBillion", label: "D+1일 거래대금(억)", unit: "억" },
  { key: "dPlus1ChangeRate", label: "D+1일 등락률(%)", unit: "%" },
  { key: "dPlus1Gap", label: "D+1일 시가갭(%)", unit: "%" },
  { key: "dPlus1Range", label: "D+1일 변동폭(%)", unit: "%" },
  { key: "dropRatio", label: "D+1/D 거래대금 비율(%)", unit: "%" },
  { key: "maxClose", label: "D+2~16 최고종가(%)", unit: "%" },
  { key: "maxCloseDay", label: "최고종가 도달일(D+N)", unit: "일" },
  { key: "maxHigh", label: "D+2~16 최고가(%)", unit: "%" },
  { key: "minLow", label: "D+2~16 최저가(%)", unit: "%" },
  { key: "d16Close", label: "D+16 종가(%)", unit: "%" },
];

const comparison = {};

for (const m of metrics) {
  const sVals = success.map((r) => r[m.key]);
  const fVals = fail.map((r) => r[m.key]);
  const sStats = calcStats(sVals);
  const fStats = calcStats(fVals);
  const diff = +(sStats.mean - fStats.mean).toFixed(2);

  comparison[m.key] = {
    label: m.label,
    unit: m.unit,
    success: sStats,
    fail: fStats,
    diff,
  };
}

// 마켓 분포
const successKospi = success.filter((r) => r.market === "KOSPI").length;
const failKospi = fail.filter((r) => r.market === "KOSPI").length;
comparison["marketDistribution"] = {
  label: "시장 분포",
  success: { KOSPI: successKospi, KOSDAQ: success.length - successKospi, kospiRatio: +(successKospi / success.length * 100).toFixed(1) },
  fail: { KOSPI: failKospi, KOSDAQ: fail.length - failKospi, kospiRatio: +(failKospi / fail.length * 100).toFixed(1) },
};

// 성공 그룹 내 D일 등락률 분포
const changeRateBuckets = [
  { label: "0~5%", min: 0, max: 5 },
  { label: "5~10%", min: 5, max: 10 },
  { label: "10~15%", min: 10, max: 15 },
  { label: "15~20%", min: 15, max: 20 },
  { label: "20~30%", min: 20, max: 30 },
];
comparison["dDayChangeRateDistribution"] = {
  label: "D일 등락률 분포별 성공률",
  buckets: changeRateBuckets.map((b) => {
    const sCount = success.filter((r) => r.dDayChangeRate >= b.min && r.dDayChangeRate < b.max).length;
    const fCount = fail.filter((r) => r.dDayChangeRate >= b.min && r.dDayChangeRate < b.max).length;
    const total = sCount + fCount;
    return {
      range: b.label,
      success: sCount,
      fail: fCount,
      total,
      successRate: total > 0 ? +((sCount / total) * 100).toFixed(1) : 0,
    };
  }),
};

// D일 거래대금 크기별 성공률
const tvBuckets = [
  { label: "950~1500억", min: 950, max: 1500 },
  { label: "1500~3000억", min: 1500, max: 3000 },
  { label: "3000~5000억", min: 3000, max: 5000 },
  { label: "5000억~1조", min: 5000, max: 10000 },
  { label: "1조+", min: 10000, max: Infinity },
];
comparison["dDayTradingValueDistribution"] = {
  label: "D일 거래대금 크기별 성공률",
  buckets: tvBuckets.map((b) => {
    const sCount = success.filter((r) => r.dDayTradingValueBillion >= b.min && r.dDayTradingValueBillion < b.max).length;
    const fCount = fail.filter((r) => r.dDayTradingValueBillion >= b.min && r.dDayTradingValueBillion < b.max).length;
    const total = sCount + fCount;
    return {
      range: b.label,
      success: sCount,
      fail: fCount,
      total,
      successRate: total > 0 ? +((sCount / total) * 100).toFixed(1) : 0,
    };
  }),
};

// 4. 저장 + 콘솔 출력
console.log("[4/4] 저장 중...\n");

const output = {
  generated: new Date().toISOString().slice(0, 10),
  description: "세력진입 의심 패턴 성공/실패 그룹 비교 (성공=D+2~16 종가 +5% 이상 1회↑)",
  totalEvents: analysis.events.length,
  successCount: success.length,
  failCount: fail.length,
  successRate: +((success.length / analysis.events.length) * 100).toFixed(1),
  comparison,
  successEvents: success,
  failEvents: fail,
};

writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");

// --- 콘솔 요약 출력 ---
console.log("╔══════════════════════════════════════════════════════════════════════╗");
console.log("║           세력진입 의심 패턴 — 성공 vs 실패 그룹 비교              ║");
console.log("╠══════════════════════════════════════════════════════════════════════╣");
console.log(`║  전체: ${analysis.events.length}건  |  성공: ${success.length}건 (${output.successRate}%)  |  실패: ${fail.length}건 (${(100 - output.successRate).toFixed(1)}%)  ║`);
console.log(`║  성공 기준: D+2~D+16 종가가 한 번이라도 D+1 종가 대비 +${SUCCESS_THRESHOLD}% 이상   ║`);
console.log("╚══════════════════════════════════════════════════════════════════════╝\n");

const printRow = (label, sVal, fVal, diffVal, unit = "") => {
  const s = typeof sVal === "number" ? sVal.toFixed(1) : sVal;
  const f = typeof fVal === "number" ? fVal.toFixed(1) : fVal;
  const d = typeof diffVal === "number" ? (diffVal > 0 ? "+" + diffVal.toFixed(1) : diffVal.toFixed(1)) : diffVal;
  console.log(`  ${label.padEnd(30)} ${String(s + unit).padStart(12)}  ${String(f + unit).padStart(12)}  ${String(d + unit).padStart(10)}`);
};

console.log("  ─── D일(폭발일) 특성 ───────────────────────────────────────────────");
console.log(`  ${"항목".padEnd(30)} ${"성공 평균".padStart(12)}  ${"실패 평균".padStart(12)}  ${"차이".padStart(10)}`);
console.log("  " + "─".repeat(70));

const dDayMetrics = ["dDayTradingValueBillion", "dDayChangeRate", "dDayGap", "dDayRange", "dDayHighFromPrevClose", "dDayLowFromPrevClose", "dDayUpperWick", "dDayBodyRatio"];
for (const key of dDayMetrics) {
  const c = comparison[key];
  if (c) printRow(c.label, c.success.mean, c.fail.mean, c.diff, c.unit === "억" ? "억" : "%");
}

console.log("\n  ─── D+1일(급감일) 특성 ─────────────────────────────────────────────");
console.log(`  ${"항목".padEnd(30)} ${"성공 평균".padStart(12)}  ${"실패 평균".padStart(12)}  ${"차이".padStart(10)}`);
console.log("  " + "─".repeat(70));

const dPlus1Metrics = ["dPlusOneTradingValueBillion", "dPlus1ChangeRate", "dPlus1Gap", "dPlus1Range", "dropRatio"];
for (const key of dPlus1Metrics) {
  const c = comparison[key];
  if (c) printRow(c.label, c.success.mean, c.fail.mean, c.diff, c.unit === "억" ? "억" : "%");
}

console.log("\n  ─── D+2~D+16 결과 ──────────────────────────────────────────────────");
console.log(`  ${"항목".padEnd(30)} ${"성공 평균".padStart(12)}  ${"실패 평균".padStart(12)}  ${"차이".padStart(10)}`);
console.log("  " + "─".repeat(70));

const resultMetrics = ["maxClose", "maxCloseDay", "maxHigh", "minLow", "d16Close"];
for (const key of resultMetrics) {
  const c = comparison[key];
  if (c) printRow(c.label, c.success.mean, c.fail.mean, c.diff, c.unit === "일" ? "일" : "%");
}

console.log("\n  ─── 시장 분포 ──────────────────────────────────────────────────────");
const md = comparison.marketDistribution;
console.log(`  성공: KOSPI ${md.success.KOSPI}건(${md.success.kospiRatio}%) / KOSDAQ ${md.success.KOSDAQ}건`);
console.log(`  실패: KOSPI ${md.fail.KOSPI}건(${md.fail.kospiRatio}%) / KOSDAQ ${md.fail.KOSDAQ}건`);

console.log("\n  ─── D일 등락률 구간별 성공률 ────────────────────────────────────────");
console.log(`  ${"구간".padEnd(15)} ${"성공".padStart(6)}  ${"실패".padStart(6)}  ${"합계".padStart(6)}  ${"성공률".padStart(8)}`);
for (const b of comparison.dDayChangeRateDistribution.buckets) {
  console.log(`  ${b.range.padEnd(15)} ${String(b.success).padStart(6)}  ${String(b.fail).padStart(6)}  ${String(b.total).padStart(6)}  ${String(b.successRate + "%").padStart(8)}`);
}

console.log("\n  ─── D일 거래대금 구간별 성공률 ──────────────────────────────────────");
console.log(`  ${"구간".padEnd(15)} ${"성공".padStart(6)}  ${"실패".padStart(6)}  ${"합계".padStart(6)}  ${"성공률".padStart(8)}`);
for (const b of comparison.dDayTradingValueDistribution.buckets) {
  console.log(`  ${b.range.padEnd(15)} ${String(b.success).padStart(6)}  ${String(b.fail).padStart(6)}  ${String(b.total).padStart(6)}  ${String(b.successRate + "%").padStart(8)}`);
}

console.log(`\n  파일 저장: ${OUTPUT_PATH}`);
console.log("  완료!\n");
