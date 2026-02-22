/**
 * 과열지수 vs KOSPI 통계 분석 스크립트
 * 데이터: 과열지수 + KOSPI 지수 (2001-01 ~ 현재)
 *
 * 분석 항목:
 * 1. 상관계수 분석
 * 2. 선행/후행(lead-lag) 분석
 * 3. 괴리(다이버전스) 감지
 * 4. 변곡점 분석
 * 5. 변화율/변동성 분석
 * 6. 추세 구간 분류
 * 7. 반복 패턴 탐지
 * 8. 예외/이상치
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import YahooFinance from "yahoo-finance2";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");
const DATA_DIR = join(ROOT_DIR, "data");
const DATA_START = "2001-01-02";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// ── Load .env.local ──

function loadEnv() {
  try {
    const raw = readFileSync(join(ROOT_DIR, ".env.local"), "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env.local not found, rely on existing env vars
  }
}
loadEnv();

// ── Data Loading: FreeSIS CSV ──

function loadFreesisCreditCSV() {
  const raw = readFileSync(join(DATA_DIR, "freesis-credit-balance.csv"), "utf-8");
  const lines = raw.trim().split("\n");
  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 4) continue;
    const [date, totalRaw] = cols;
    if (date < DATA_START) continue;
    map.set(date, Math.round(Number(totalRaw) / 100)); // 백만 → 억
  }
  return map;
}

function loadFreesisMarketCapCSV() {
  const raw = readFileSync(join(DATA_DIR, "freesis-market-cap.csv"), "utf-8");
  const lines = raw.trim().split("\n");
  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 3) continue;
    const [date, kospiRaw, kosdaqRaw] = cols;
    map.set(date, Number(kospiRaw) + Number(kosdaqRaw));
  }
  return map;
}

// ── Data Loading: 공공데이터포털 API (2021-11 ~ 현재) ──

function fmtDateApi(yyyymmdd) {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function toEok(val) {
  if (!val) return 0;
  const n = Number(String(val).replace(/,/g, ""));
  if (isNaN(n)) return 0;
  return Math.round(n / 100_000_000);
}

function toJoWon(val) {
  if (!val) return 0;
  const n = Number(String(val).replace(/,/g, ""));
  if (isNaN(n)) return 0;
  return Math.round(n / 1_000_000_000_000 * 10) / 10;
}

async function fetchApiCreditBalance() {
  const apiKey = process.env.DATA_GO_KR_API_KEY;
  if (!apiKey) {
    console.error("  [WARN] DATA_GO_KR_API_KEY not set, skipping API credit data");
    return [];
  }

  const url = new URL(
    "https://apis.data.go.kr/1160100/service/GetKofiaStatisticsInfoService/getGrantingOfCreditBalanceInfo"
  );
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("resultType", "json");
  url.searchParams.set("numOfRows", "1200");
  url.searchParams.set("beginBasDt", "20211101");

  console.error("  Fetching credit balance from data.go.kr API...");
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Credit API responded with ${res.status}`);

  const json = await res.json();
  const header = json.response?.header;
  if (header?.resultCode !== "00") {
    throw new Error(header?.resultMsg ?? "Unknown credit API error");
  }

  const items = json.response?.body?.items?.item ?? [];
  const result = items
    .filter((item) => item.basDt)
    .map((item) => ({
      date: fmtDateApi(item.basDt),
      totalLoan: toEok(item.crdTrFingWhl),
    }));

  console.error(`  Credit API: ${result.length} data points`);
  return result;
}

async function fetchApiMarketCap(idxNm) {
  const apiKey = process.env.DATA_GO_KR_API_KEY;
  if (!apiKey) return [];

  const url = new URL(
    "https://apis.data.go.kr/1160100/service/GetMarketIndexInfoService/getStockMarketIndex"
  );
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("resultType", "json");
  url.searchParams.set("numOfRows", "2000");
  url.searchParams.set("beginBasDt", "20200101");
  url.searchParams.set("idxNm", idxNm);

  console.error(`  Fetching ${idxNm} market cap from data.go.kr API...`);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Market cap API responded with ${res.status}`);

  const json = await res.json();
  const header = json.response?.header;
  if (header?.resultCode !== "00") {
    throw new Error(header?.resultMsg ?? "Unknown market cap API error");
  }

  const items = json.response?.body?.items?.item ?? [];
  const result = items
    .filter((item) => item.basDt && item.lstgMrktTotAmt)
    .map((item) => ({
      date: fmtDateApi(item.basDt),
      marketCapJo: toJoWon(item.lstgMrktTotAmt),
    }));

  console.error(`  ${idxNm} market cap API: ${result.length} data points`);
  return result;
}

// ── Merged Data (CSV + API, API overrides) ──

async function getMergedCreditMap() {
  const csvMap = loadFreesisCreditCSV();
  console.error(`  FreeSIS credit CSV: ${csvMap.size} data points`);

  try {
    const apiData = await fetchApiCreditBalance();
    for (const item of apiData) {
      csvMap.set(item.date, item.totalLoan); // API overrides
    }
  } catch (e) {
    console.error(`  [WARN] Credit API failed: ${e.message}`);
  }

  console.error(`  Merged credit: ${csvMap.size} data points`);
  return csvMap;
}

async function getMergedMarketCapMap() {
  const csvMap = loadFreesisMarketCapCSV();
  console.error(`  FreeSIS market cap CSV: ${csvMap.size} data points`);

  try {
    const [kospiCaps, kosdaqCaps] = await Promise.all([
      fetchApiMarketCap("코스피"),
      fetchApiMarketCap("코스닥"),
    ]);

    // API 데이터를 Map으로 (조원 → 억원)
    const apiKospiMap = new Map(kospiCaps.map((d) => [d.date, d.marketCapJo * 10000]));
    const apiKosdaqMap = new Map(kosdaqCaps.map((d) => [d.date, d.marketCapJo * 10000]));

    // API로 덮어쓰기 (두 시장 모두 있는 날만)
    for (const [date, kospiEok] of apiKospiMap) {
      if (apiKosdaqMap.has(date)) {
        csvMap.set(date, kospiEok + apiKosdaqMap.get(date));
      }
    }
  } catch (e) {
    console.error(`  [WARN] Market cap API failed: ${e.message}`);
  }

  console.error(`  Merged market cap: ${csvMap.size} data points`);
  return csvMap;
}

// ── KOSPI from Yahoo Finance ──

async function fetchKospi() {
  console.error("Fetching KOSPI data from Yahoo Finance...");
  const result = await yahooFinance.chart("^KS11", {
    period1: DATA_START,
    interval: "1d",
    return: "array",
  });
  const quotes = result.quotes;
  const map = new Map();
  for (const q of quotes) {
    if (q.close != null) {
      const dateStr = new Date(q.date).toISOString().split("T")[0];
      map.set(dateStr, q.close);
    }
  }
  console.error(`  KOSPI: ${map.size} data points loaded`);
  return map;
}

// ── Compute Overheat Index ──

function computeOverheatIndex(creditMap, marketCapMap) {
  const result = [];
  const dates = [...marketCapMap.keys()]
    .filter((d) => creditMap.has(d) && d >= DATA_START)
    .sort();

  for (const date of dates) {
    const mc = marketCapMap.get(date);
    const cr = creditMap.get(date);
    if (!mc || mc === 0) continue;
    result.push({
      date,
      overheat: Math.round((cr / mc) * 100 * 1000) / 1000,
    });
  }
  return result;
}

// ── Utility Functions ──

function pearson(x, y) {
  const n = x.length;
  if (n === 0) return 0;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i]; sy += y[i];
    sxx += x[i] * x[i]; syy += y[i] * y[i];
    sxy += x[i] * y[i];
  }
  const denom = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  return denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
}

function pctChange(arr) {
  const result = [];
  for (let i = 1; i < arr.length; i++) {
    result.push(arr[i - 1] === 0 ? 0 : (arr[i] - arr[i - 1]) / arr[i - 1]);
  }
  return result;
}

function rollingCorrelation(x, y, window) {
  const result = [];
  for (let i = window - 1; i < x.length; i++) {
    const xs = x.slice(i - window + 1, i + 1);
    const ys = y.slice(i - window + 1, i + 1);
    result.push(pearson(xs, ys));
  }
  return result;
}

function movingAverage(arr, window) {
  const result = [];
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= window) sum -= arr[i - window];
    result.push(i >= window - 1 ? sum / window : null);
  }
  return result;
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
}

function fmt(v, digits = 4) {
  return v.toFixed(digits);
}

function fmtPct(v, digits = 1) {
  return (v * 100).toFixed(digits) + "%";
}

// ── Main Analysis ──

async function main() {
  // Load data: CSV + API merged (API overrides CSV on overlap)
  const [creditMap, marketCapMap, kospiMap] = await Promise.all([
    getMergedCreditMap(),
    getMergedMarketCapMap(),
    fetchKospi(),
  ]);

  // Compute overheat index
  const overheatData = computeOverheatIndex(creditMap, marketCapMap);
  console.error(`Overheat index: ${overheatData.length} data points`);

  // Align dates: only dates present in both overheat and KOSPI
  const aligned = [];
  for (const item of overheatData) {
    if (kospiMap.has(item.date)) {
      aligned.push({
        date: item.date,
        overheat: item.overheat,
        kospi: kospiMap.get(item.date),
      });
    }
  }
  aligned.sort((a, b) => a.date.localeCompare(b.date));
  console.error(`Aligned data: ${aligned.length} data points`);
  console.error(`Period: ${aligned[0].date} ~ ${aligned[aligned.length - 1].date}`);

  const dates = aligned.map((d) => d.date);
  const overheat = aligned.map((d) => d.overheat);
  const kospi = aligned.map((d) => d.kospi);

  const overheatPctChange = pctChange(overheat);
  const kospiPctChange = pctChange(kospi);

  const results = {};

  // ═══════════════════════════════════════════════
  // 1. 상관계수 분석
  // ═══════════════════════════════════════════════
  console.error("\n=== 1. 상관계수 분석 ===");

  // 전체 기간 수준 상관
  const levelCorr = pearson(overheat, kospi);
  // 일별 변화율 상관
  const dailyChangeCorr = pearson(overheatPctChange, kospiPctChange);

  console.error(`  수준 상관: ${fmt(levelCorr)}`);
  console.error(`  일별 변화율 상관: ${fmt(dailyChangeCorr)}`);

  // 롤링 상관 (수준)
  const rolling60 = rollingCorrelation(overheat, kospi, 60);
  const rolling120 = rollingCorrelation(overheat, kospi, 120);
  const rolling250 = rollingCorrelation(overheat, kospi, 250);

  function rollingStats(arr, window, dates_) {
    const startIdx = window - 1;
    const relevantDates = dates_.slice(startIdx);
    let minVal = Infinity, maxVal = -Infinity;
    let minDate = "", maxDate = "";
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
      sum += arr[i];
      if (arr[i] < minVal) { minVal = arr[i]; minDate = relevantDates[i]; }
      if (arr[i] > maxVal) { maxVal = arr[i]; maxDate = relevantDates[i]; }
    }
    return {
      mean: fmt(sum / arr.length),
      min: fmt(minVal),
      minDate: minDate.slice(0, 7),
      max: fmt(maxVal),
      maxDate: maxDate.slice(0, 7),
    };
  }

  const r60 = rollingStats(rolling60, 60, dates);
  const r120 = rollingStats(rolling120, 120, dates);
  const r250 = rollingStats(rolling250, 250, dates);

  console.error(`  롤링 60일: 평균=${r60.mean}, 최소=${r60.min}(${r60.minDate}), 최대=${r60.max}(${r60.maxDate})`);
  console.error(`  롤링 120일: 평균=${r120.mean}, 최소=${r120.min}(${r120.minDate}), 최대=${r120.max}(${r120.maxDate})`);
  console.error(`  롤링 250일: 평균=${r250.mean}, 최소=${r250.min}(${r250.minDate}), 최대=${r250.max}(${r250.maxDate})`);

  // 구간별 상관
  const periods = [
    ["2001-01", "2003-12", "2001-2003 (IT버블 후)"],
    ["2004-01", "2007-12", "2004-2007 (상승장)"],
    ["2008-01", "2009-12", "2008-2009 (금융위기)"],
    ["2010-01", "2016-12", "2010-2016 (횡보)"],
    ["2017-01", "2019-12", "2017-2019 (변동)"],
    ["2020-01", "2021-12", "2020-2021 (코로나·동학)"],
    ["2022-01", "2026-12", "2022-현재"],
  ];

  console.error("\n  구간별 수준 상관:");
  const periodCorrs = [];
  for (const [start, end, label] of periods) {
    const filtered = aligned.filter((d) => d.date >= start && d.date <= end + "-31");
    if (filtered.length < 10) continue;
    const o = filtered.map((d) => d.overheat);
    const k = filtered.map((d) => d.kospi);
    const c = pearson(o, k);
    periodCorrs.push({ label, corr: fmt(c), count: filtered.length });
    console.error(`    ${label}: ${fmt(c)} (${filtered.length}일)`);
  }

  results["1_correlation"] = {
    levelCorr: fmt(levelCorr),
    dailyChangeCorr: fmt(dailyChangeCorr),
    rolling: { r60, r120, r250 },
    periodCorrs,
  };

  // ═══════════════════════════════════════════════
  // 2. 선행/후행 분석
  // ═══════════════════════════════════════════════
  console.error("\n=== 2. 선행/후행 분석 ===");

  // 일별 변화율 교차상관
  const lags = [-20, -10, -5, -3, -1, 0, 1, 2, 3, 5, 10, 20];
  console.error("  일별 변화율 교차상관:");
  const dailyCrossCorr = [];
  for (const lag of lags) {
    let x, y;
    if (lag >= 0) {
      // kospi change at t → overheat change at t+lag
      x = kospiPctChange.slice(0, kospiPctChange.length - lag);
      y = overheatPctChange.slice(lag);
    } else {
      // overheat change at t → kospi change at t+|lag|
      x = overheatPctChange.slice(0, overheatPctChange.length + lag);
      y = kospiPctChange.slice(-lag);
    }
    const minLen = Math.min(x.length, y.length);
    const c = pearson(x.slice(0, minLen), y.slice(0, minLen));
    dailyCrossCorr.push({ lag, corr: fmt(c) });
    console.error(`    lag=${lag}: ${fmt(c)}`);
  }

  // 30일 변화율 교차상관
  function windowedChange(arr, w) {
    const result = [];
    for (let i = w; i < arr.length; i++) {
      result.push(arr[i - w] === 0 ? 0 : (arr[i] - arr[i - w]) / arr[i - w]);
    }
    return result;
  }

  const overheat30 = windowedChange(overheat, 30);
  const kospi30 = windowedChange(kospi, 30);
  const crossLags30 = [-20, -10, -5, 0, 5, 10, 20];
  console.error("\n  30일 변화율 교차상관:");
  const monthly30CrossCorr = [];
  for (const lag of crossLags30) {
    let x, y;
    if (lag >= 0) {
      x = kospi30.slice(0, kospi30.length - lag);
      y = overheat30.slice(lag);
    } else {
      x = overheat30.slice(0, overheat30.length + lag);
      y = kospi30.slice(-lag);
    }
    const minLen = Math.min(x.length, y.length);
    const c = pearson(x.slice(0, minLen), y.slice(0, minLen));
    monthly30CrossCorr.push({ lag, corr: fmt(c) });
    console.error(`    lag=${lag}: ${fmt(c)}`);
  }

  // Granger-style: 과열지수 변화가 N일 후 KOSPI 변화를 예측하는지
  console.error("\n  과열지수 구간별 → KOSPI 성과 (향후 N일):");
  const overheatLevels = [
    { label: "안전 (<0.5%)", filter: (v) => v < 0.5 },
    { label: "관심 (0.5~0.75%)", filter: (v) => v >= 0.5 && v < 0.75 },
    { label: "주의 (0.75~0.85%)", filter: (v) => v >= 0.75 && v < 0.85 },
    { label: "위험 (≥0.85%)", filter: (v) => v >= 0.85 },
  ];
  const futureWindows = [5, 10, 20, 30, 60, 90];
  const levelPerformance = [];

  for (const level of overheatLevels) {
    const row = { label: level.label };
    for (const w of futureWindows) {
      let sumReturn = 0, count = 0, downCount = 0;
      for (let i = 0; i < aligned.length - w; i++) {
        if (level.filter(aligned[i].overheat)) {
          const futReturn = (aligned[i + w].kospi - aligned[i].kospi) / aligned[i].kospi;
          sumReturn += futReturn;
          count++;
          if (futReturn < 0) downCount++;
        }
      }
      if (count > 0) {
        row[`${w}d_avg`] = fmtPct(sumReturn / count);
        row[`${w}d_down`] = fmtPct(downCount / count, 1);
        row[`${w}d_n`] = count;
      }
    }
    levelPerformance.push(row);
    console.error(`    ${row.label}: 30일후 ${row["30d_avg"]}(하락${row["30d_down"]}), 90일후 ${row["90d_avg"]}(하락${row["90d_down"]}), n=${row["30d_n"]}`);
  }

  results["2_lead_lag"] = {
    dailyCrossCorr,
    monthly30CrossCorr,
    levelPerformance,
  };

  // ═══════════════════════════════════════════════
  // 3. 다이버전스 감지
  // ═══════════════════════════════════════════════
  console.error("\n=== 3. 다이버전스 감지 ===");

  // 60영업일 변화율 기준
  const W_DIV = 60;
  const divergences = [];
  for (let i = W_DIV; i < aligned.length; i++) {
    const ovChg = (overheat[i] - overheat[i - W_DIV]) / overheat[i - W_DIV];
    const kosChg = (kospi[i] - kospi[i - W_DIV]) / kospi[i - W_DIV];
    divergences.push({
      date: dates[i],
      overheatChg: ovChg,
      kospiChg: kosChg,
      gap: ovChg - kosChg,
    });
  }

  // 위험 구간: 과열지수↑ & KOSPI↓
  const dangerousDivs = divergences
    .filter((d) => d.overheatChg > 0 && d.kospiChg < 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 5);

  console.error("  위험 구간 (과열지수↑ & KOSPI↓):");
  for (const d of dangerousDivs) {
    console.error(`    ${d.date}: KOSPI ${fmtPct(d.kospiChg)}, 과열 ${fmtPct(d.overheatChg)}, 괴리 ${fmtPct(d.gap)}`);
  }

  // 회복 구간: 과열지수↓ & KOSPI↑
  const recoveryDivs = divergences
    .filter((d) => d.overheatChg < 0 && d.kospiChg > 0)
    .sort((a, b) => a.gap - b.gap)
    .slice(0, 5);

  console.error("\n  회복 구간 (과열지수↓ & KOSPI↑):");
  for (const d of recoveryDivs) {
    console.error(`    ${d.date}: KOSPI ${fmtPct(d.kospiChg)}, 과열 ${fmtPct(d.overheatChg)}, 괴리 ${fmtPct(d.gap)}`);
  }

  // 같은 방향이지만 크기 차이 극단
  const sameDirDivs = divergences
    .filter((d) => d.overheatChg > 0 && d.kospiChg > 0)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
    .slice(0, 5);

  console.error("\n  동방향 극단 괴리:");
  for (const d of sameDirDivs) {
    console.error(`    ${d.date}: KOSPI ${fmtPct(d.kospiChg)}, 과열 ${fmtPct(d.overheatChg)}, 괴리 ${fmtPct(d.gap)}`);
  }

  results["3_divergence"] = {
    dangerous: dangerousDivs.map((d) => ({
      date: d.date,
      kospi: fmtPct(d.kospiChg),
      overheat: fmtPct(d.overheatChg),
      gap: fmtPct(d.gap),
    })),
    recovery: recoveryDivs.map((d) => ({
      date: d.date,
      kospi: fmtPct(d.kospiChg),
      overheat: fmtPct(d.overheatChg),
      gap: fmtPct(d.gap),
    })),
    sameDir: sameDirDivs.map((d) => ({
      date: d.date,
      kospi: fmtPct(d.kospiChg),
      overheat: fmtPct(d.overheatChg),
      gap: fmtPct(d.gap),
    })),
  };

  // ═══════════════════════════════════════════════
  // 4. 변곡점 분석
  // ═══════════════════════════════════════════════
  console.error("\n=== 4. 변곡점 분석 ===");

  function findLocalExtrema(arr, window) {
    const highs = [];
    const lows = [];
    for (let i = window; i < arr.length - window; i++) {
      const slice = arr.slice(i - window, i + window + 1);
      const max = Math.max(...slice);
      const min = Math.min(...slice);
      if (arr[i] === max) highs.push(i);
      if (arr[i] === min) lows.push(i);
    }
    return { highs, lows };
  }

  const EX_WINDOW = 120;
  const kospiExtrema = findLocalExtrema(kospi, EX_WINDOW);
  const overheatExtrema = findLocalExtrema(overheat, EX_WINDOW);

  // 고점 시차: 가장 가까운 과열지수 고점 찾기
  function findNearestIdx(target, candidates, maxDist = 120) {
    let best = null;
    let bestDist = Infinity;
    for (const c of candidates) {
      const dist = c - target;
      if (Math.abs(dist) < bestDist && Math.abs(dist) <= maxDist) {
        bestDist = Math.abs(dist);
        best = dist;
      }
    }
    return best;
  }

  const highLags = [];
  for (const kh of kospiExtrema.highs) {
    const lag = findNearestIdx(kh, overheatExtrema.highs);
    if (lag !== null) highLags.push(lag);
  }

  const lowLags = [];
  for (const kl of kospiExtrema.lows) {
    const lag = findNearestIdx(kl, overheatExtrema.lows);
    if (lag !== null) lowLags.push(lag);
  }

  const avgHighLag = highLags.length > 0 ? mean(highLags) : 0;
  const avgLowLag = lowLags.length > 0 ? mean(lowLags) : 0;

  console.error(`  KOSPI 고점 → 과열지수 고점 평균 시차: ${avgHighLag.toFixed(1)}일 (${highLags.length}쌍)`);
  console.error(`  KOSPI 저점 → 과열지수 저점 평균 시차: ${avgLowLag.toFixed(1)}일 (${lowLags.length}쌍)`);

  // 주요 변곡점 사례
  console.error("\n  주요 고점 사례:");
  const highCases = [];
  for (const kh of kospiExtrema.highs) {
    let bestOh = null, bestDist = Infinity;
    for (const oh of overheatExtrema.highs) {
      if (Math.abs(oh - kh) < bestDist) {
        bestDist = Math.abs(oh - kh);
        bestOh = oh;
      }
    }
    if (bestOh !== null && bestDist <= 120) {
      highCases.push({
        kospiDate: dates[kh],
        overheatDate: dates[bestOh],
        lag: bestOh - kh,
        kospiVal: kospi[kh].toFixed(0),
        overheatVal: overheat[bestOh].toFixed(3),
      });
    }
  }
  for (const c of highCases.slice(0, 6)) {
    console.error(`    KOSPI 고점 ${c.kospiDate}(${c.kospiVal}), 과열 고점 ${c.overheatDate}(${c.overheatVal}%), 시차 ${c.lag}일`);
  }

  console.error("\n  주요 저점 사례:");
  const lowCases = [];
  for (const kl of kospiExtrema.lows) {
    let bestOh = null, bestDist = Infinity;
    for (const oh of overheatExtrema.lows) {
      if (Math.abs(oh - kl) < bestDist) {
        bestDist = Math.abs(oh - kl);
        bestOh = oh;
      }
    }
    if (bestOh !== null && bestDist <= 120) {
      lowCases.push({
        kospiDate: dates[kl],
        overheatDate: dates[bestOh],
        lag: bestOh - kl,
        kospiVal: kospi[kl].toFixed(0),
        overheatVal: overheat[bestOh].toFixed(3),
      });
    }
  }
  for (const c of lowCases.slice(0, 6)) {
    console.error(`    KOSPI 저점 ${c.kospiDate}(${c.kospiVal}), 과열 저점 ${c.overheatDate}(${c.overheatVal}%), 시차 ${c.lag}일`);
  }

  // 과열지수 고점/저점 이후 KOSPI 변화
  console.error("\n  과열지수 고점 이후 KOSPI 성과:");
  const ohHighPerf = [];
  for (const oh of overheatExtrema.highs) {
    const perfs = {};
    for (const w of [5, 10, 20, 30, 60, 90]) {
      if (oh + w < aligned.length) {
        perfs[`${w}d`] = (kospi[oh + w] - kospi[oh]) / kospi[oh];
      }
    }
    ohHighPerf.push({ date: dates[oh], val: overheat[oh].toFixed(3), ...perfs });
  }

  // Average performance after overheat peaks
  const ohHighAvg = {};
  for (const w of [5, 10, 20, 30, 60, 90]) {
    const vals = ohHighPerf.filter((p) => p[`${w}d`] !== undefined).map((p) => p[`${w}d`]);
    if (vals.length > 0) {
      ohHighAvg[`${w}d`] = { avg: fmtPct(mean(vals)), down: fmtPct(vals.filter((v) => v < 0).length / vals.length), n: vals.length };
    }
  }
  for (const [k, v] of Object.entries(ohHighAvg)) {
    console.error(`    ${k}: 평균 ${v.avg}, 하락확률 ${v.down}, n=${v.n}`);
  }

  console.error("\n  과열지수 저점 이후 KOSPI 성과:");
  const ohLowPerf = [];
  for (const ol of overheatExtrema.lows) {
    const perfs = {};
    for (const w of [5, 10, 20, 30, 60, 90]) {
      if (ol + w < aligned.length) {
        perfs[`${w}d`] = (kospi[ol + w] - kospi[ol]) / kospi[ol];
      }
    }
    ohLowPerf.push({ date: dates[ol], val: overheat[ol].toFixed(3), ...perfs });
  }

  const ohLowAvg = {};
  for (const w of [5, 10, 20, 30, 60, 90]) {
    const vals = ohLowPerf.filter((p) => p[`${w}d`] !== undefined).map((p) => p[`${w}d`]);
    if (vals.length > 0) {
      ohLowAvg[`${w}d`] = { avg: fmtPct(mean(vals)), up: fmtPct(vals.filter((v) => v > 0).length / vals.length), n: vals.length };
    }
  }
  for (const [k, v] of Object.entries(ohLowAvg)) {
    console.error(`    ${k}: 평균 ${v.avg}, 상승확률 ${v.up}, n=${v.n}`);
  }

  results["4_inflection"] = {
    avgHighLag: avgHighLag.toFixed(1),
    avgLowLag: avgLowLag.toFixed(1),
    highCases: highCases.slice(0, 6),
    lowCases: lowCases.slice(0, 6),
    ohHighAvg,
    ohLowAvg,
    ohHighPerf: ohHighPerf.map((p) => ({ date: p.date, val: p.val, "30d": p["30d"] ? fmtPct(p["30d"]) : "N/A", "90d": p["90d"] ? fmtPct(p["90d"]) : "N/A" })),
    ohLowPerf: ohLowPerf.map((p) => ({ date: p.date, val: p.val, "30d": p["30d"] ? fmtPct(p["30d"]) : "N/A", "90d": p["90d"] ? fmtPct(p["90d"]) : "N/A" })),
  };

  // ═══════════════════════════════════════════════
  // 5. 변화율/변동성 분석
  // ═══════════════════════════════════════════════
  console.error("\n=== 5. 변화율/변동성 분석 ===");

  // 일별 변화율 기초 통계
  const kospiStats = {
    mean: fmtPct(mean(kospiPctChange), 3),
    std: fmtPct(std(kospiPctChange), 2),
    max: fmtPct(Math.max(...kospiPctChange), 2),
    maxDate: dates[kospiPctChange.indexOf(Math.max(...kospiPctChange)) + 1],
    min: fmtPct(Math.min(...kospiPctChange), 2),
    minDate: dates[kospiPctChange.indexOf(Math.min(...kospiPctChange)) + 1],
  };

  const overheatStats = {
    mean: fmtPct(mean(overheatPctChange), 3),
    std: fmtPct(std(overheatPctChange), 2),
    max: fmtPct(Math.max(...overheatPctChange), 2),
    maxDate: dates[overheatPctChange.indexOf(Math.max(...overheatPctChange)) + 1],
    min: fmtPct(Math.min(...overheatPctChange), 2),
    minDate: dates[overheatPctChange.indexOf(Math.min(...overheatPctChange)) + 1],
  };

  console.error(`  KOSPI: 평균 ${kospiStats.mean}, 표준편차 ${kospiStats.std}, 최대 ${kospiStats.max}(${kospiStats.maxDate}), 최소 ${kospiStats.min}(${kospiStats.minDate})`);
  console.error(`  과열지수: 평균 ${overheatStats.mean}, 표준편차 ${overheatStats.std}, 최대 ${overheatStats.max}(${overheatStats.maxDate}), 최소 ${overheatStats.min}(${overheatStats.minDate})`);

  // 과열지수 극단 변화일 → KOSPI 반응
  const ovhTop5 = percentile(overheatPctChange, 0.95);
  const ovhBot5 = percentile(overheatPctChange, 0.05);

  console.error(`\n  과열지수 급등(상위 5%, >${fmtPct(ovhTop5)}) → KOSPI 반응:`);
  const ovhTopIdxs = [];
  for (let i = 0; i < overheatPctChange.length; i++) {
    if (overheatPctChange[i] >= ovhTop5) ovhTopIdxs.push(i);
  }

  const ovhTopReaction = {};
  for (const lag of [0, 1, 3, 5, 10]) {
    const vals = [];
    for (const idx of ovhTopIdxs) {
      const ki = idx + 1; // aligned with pctChange offset
      if (lag === 0) {
        vals.push(kospiPctChange[idx]);
      } else if (ki + lag < kospi.length) {
        vals.push((kospi[ki + lag] - kospi[ki]) / kospi[ki]);
      }
    }
    if (vals.length > 0) {
      ovhTopReaction[lag === 0 ? "같은 날" : `${lag}일 후`] = fmtPct(mean(vals));
    }
  }
  console.error(`    ${JSON.stringify(ovhTopReaction)}`);

  console.error(`\n  과열지수 급락(하위 5%, <${fmtPct(ovhBot5)}) → KOSPI 반응:`);
  const ovhBotIdxs = [];
  for (let i = 0; i < overheatPctChange.length; i++) {
    if (overheatPctChange[i] <= ovhBot5) ovhBotIdxs.push(i);
  }

  const ovhBotReaction = {};
  for (const lag of [0, 1, 3, 5, 10]) {
    const vals = [];
    for (const idx of ovhBotIdxs) {
      const ki = idx + 1;
      if (lag === 0) {
        vals.push(kospiPctChange[idx]);
      } else if (ki + lag < kospi.length) {
        vals.push((kospi[ki + lag] - kospi[ki]) / kospi[ki]);
      }
    }
    if (vals.length > 0) {
      ovhBotReaction[lag === 0 ? "같은 날" : `${lag}일 후`] = fmtPct(mean(vals));
    }
  }
  console.error(`    ${JSON.stringify(ovhBotReaction)}`);

  // KOSPI 극단 변화일 → 과열지수 반응
  const kTop5 = percentile(kospiPctChange, 0.95);
  const kBot5 = percentile(kospiPctChange, 0.05);

  console.error(`\n  KOSPI 급등(상위 5%) → 과열지수 반응:`);
  const kTopIdxs = [];
  for (let i = 0; i < kospiPctChange.length; i++) {
    if (kospiPctChange[i] >= kTop5) kTopIdxs.push(i);
  }

  const kTopOvhReaction = {};
  for (const lag of [0, 1, 3, 5, 10]) {
    const vals = [];
    for (const idx of kTopIdxs) {
      const oi = idx + 1;
      if (lag === 0) {
        vals.push(overheatPctChange[idx]);
      } else if (oi + lag < overheat.length) {
        vals.push((overheat[oi + lag] - overheat[oi]) / overheat[oi]);
      }
    }
    if (vals.length > 0) {
      kTopOvhReaction[lag === 0 ? "같은 날" : `${lag}일 후`] = fmtPct(mean(vals));
    }
  }
  console.error(`    ${JSON.stringify(kTopOvhReaction)}`);

  console.error(`\n  KOSPI 급락(하위 5%) → 과열지수 반응:`);
  const kBotIdxs = [];
  for (let i = 0; i < kospiPctChange.length; i++) {
    if (kospiPctChange[i] <= kBot5) kBotIdxs.push(i);
  }

  const kBotOvhReaction = {};
  for (const lag of [0, 1, 3, 5, 10]) {
    const vals = [];
    for (const idx of kBotIdxs) {
      const oi = idx + 1;
      if (lag === 0) {
        vals.push(overheatPctChange[idx]);
      } else if (oi + lag < overheat.length) {
        vals.push((overheat[oi + lag] - overheat[oi]) / overheat[oi]);
      }
    }
    if (vals.length > 0) {
      kBotOvhReaction[lag === 0 ? "같은 날" : `${lag}일 후`] = fmtPct(mean(vals));
    }
  }
  console.error(`    ${JSON.stringify(kBotOvhReaction)}`);

  // 롤링 변동성 (60일)
  function rollingStd(arr, window) {
    const result = [];
    for (let i = window - 1; i < arr.length; i++) {
      result.push(std(arr.slice(i - window + 1, i + 1)));
    }
    return result;
  }

  const kospiVol60 = rollingStd(kospiPctChange, 60);
  const overheatVol60 = rollingStd(overheatPctChange, 60);
  const volCorr = pearson(kospiVol60, overheatVol60);
  console.error(`\n  60일 롤링 변동성 상관: ${fmt(volCorr)}`);

  results["5_volatility"] = {
    kospiStats,
    overheatStats,
    ovhTopReaction,
    ovhBotReaction,
    kTopOvhReaction,
    kBotOvhReaction,
    volCorr: fmt(volCorr),
  };

  // ═══════════════════════════════════════════════
  // 6. 추세 구간 분류
  // ═══════════════════════════════════════════════
  console.error("\n=== 6. 추세 구간 분류 ===");

  const MA250 = 250;
  const kospiMA = movingAverage(kospi, MA250);
  const overheatMA = movingAverage(overheat, MA250);

  // Classify each day
  const trendDays = [];
  for (let i = MA250 - 1; i < aligned.length; i++) {
    const kAbove = kospi[i] > kospiMA[i];
    const oAbove = overheat[i] > overheatMA[i];
    let trend;
    if (kAbove && oAbove) trend = "동반상승";
    else if (!kAbove && !oAbove) trend = "동반하락";
    else if (kAbove && !oAbove) trend = "KOSPI↑ 과열↓";
    else trend = "KOSPI↓ 과열↑";

    trendDays.push({ date: dates[i], trend, kospiVal: kospi[i], overheatVal: overheat[i] });
  }

  // Group consecutive same-trend days into segments
  const segments = [];
  let segStart = 0;
  for (let i = 1; i <= trendDays.length; i++) {
    if (i === trendDays.length || trendDays[i].trend !== trendDays[segStart].trend) {
      const length = i - segStart;
      if (length >= 30) { // Only show segments >= 30 days
        const startDay = trendDays[segStart];
        const endDay = trendDays[i - 1];
        const kospiChg = (endDay.kospiVal - startDay.kospiVal) / startDay.kospiVal;
        const overheatChg = (endDay.overheatVal - startDay.overheatVal) / startDay.overheatVal;
        segments.push({
          start: startDay.date,
          end: endDay.date,
          days: length,
          trend: startDay.trend,
          kospiChg: fmtPct(kospiChg),
          overheatChg: fmtPct(overheatChg),
        });
      }
      segStart = i;
    }
  }

  console.error("  주요 추세 구간 (30일 이상):");
  for (const seg of segments) {
    console.error(`    ${seg.start} ~ ${seg.end} (${seg.days}일): ${seg.trend}, KOSPI ${seg.kospiChg}, 과열 ${seg.overheatChg}`);
  }

  // Trend distribution
  const trendCounts = {};
  for (const d of trendDays) {
    trendCounts[d.trend] = (trendCounts[d.trend] || 0) + 1;
  }
  const totalTrend = trendDays.length;
  console.error("\n  추세 분포:");
  for (const [trend, count] of Object.entries(trendCounts)) {
    console.error(`    ${trend}: ${count}일 (${fmtPct(count / totalTrend)})`);
  }

  results["6_trend"] = {
    segments: segments.slice(0, 15),
    distribution: Object.entries(trendCounts).map(([t, c]) => ({
      trend: t,
      days: c,
      pct: fmtPct(c / totalTrend),
    })),
  };

  // ═══════════════════════════════════════════════
  // 7. 반복 패턴 탐지
  // ═══════════════════════════════════════════════
  console.error("\n=== 7. 반복 패턴 탐지 ===");

  // 과열지수 급등(상위 10%) 후 KOSPI 성과
  const ovhTop10 = percentile(overheatPctChange, 0.90);
  const ovhBot10 = percentile(overheatPctChange, 0.10);

  console.error(`  과열지수 급등(상위 10%, >${fmtPct(ovhTop10)}) 후 KOSPI 성과:`);
  const ovhSurgePerf = {};
  const ovhSurgeIdxs = [];
  for (let i = 0; i < overheatPctChange.length; i++) {
    if (overheatPctChange[i] >= ovhTop10) ovhSurgeIdxs.push(i + 1);
  }

  for (const w of [5, 10, 20, 30, 60]) {
    const returns = [];
    for (const idx of ovhSurgeIdxs) {
      if (idx + w < kospi.length) {
        returns.push((kospi[idx + w] - kospi[idx]) / kospi[idx]);
      }
    }
    if (returns.length > 0) {
      ovhSurgePerf[`${w}d`] = {
        avg: fmtPct(mean(returns)),
        down: fmtPct(returns.filter((r) => r < 0).length / returns.length),
        n: returns.length,
      };
      console.error(`    ${w}일 후: 평균 ${ovhSurgePerf[`${w}d`].avg}, 하락 ${ovhSurgePerf[`${w}d`].down}, n=${returns.length}`);
    }
  }

  // 과열지수 급락(하위 10%) 후 KOSPI 성과
  console.error(`\n  과열지수 급락(하위 10%, <${fmtPct(ovhBot10)}) 후 KOSPI 성과:`);
  const ovhPlungePerf = {};
  const ovhPlungeIdxs = [];
  for (let i = 0; i < overheatPctChange.length; i++) {
    if (overheatPctChange[i] <= ovhBot10) ovhPlungeIdxs.push(i + 1);
  }

  for (const w of [5, 10, 20, 30, 60]) {
    const returns = [];
    for (const idx of ovhPlungeIdxs) {
      if (idx + w < kospi.length) {
        returns.push((kospi[idx + w] - kospi[idx]) / kospi[idx]);
      }
    }
    if (returns.length > 0) {
      ovhPlungePerf[`${w}d`] = {
        avg: fmtPct(mean(returns)),
        down: fmtPct(returns.filter((r) => r < 0).length / returns.length),
        n: returns.length,
      };
      console.error(`    ${w}일 후: 평균 ${ovhPlungePerf[`${w}d`].avg}, 하락 ${ovhPlungePerf[`${w}d`].down}, n=${returns.length}`);
    }
  }

  // 과열지수 연속 상승/하락
  let maxConsUp = 0, maxConsDown = 0;
  let curUp = 0, curDown = 0;
  let maxUpDate = "", maxDownDate = "";
  for (let i = 0; i < overheatPctChange.length; i++) {
    if (overheatPctChange[i] > 0) {
      curUp++;
      curDown = 0;
      if (curUp > maxConsUp) { maxConsUp = curUp; maxUpDate = dates[i + 1]; }
    } else if (overheatPctChange[i] < 0) {
      curDown++;
      curUp = 0;
      if (curDown > maxConsDown) { maxConsDown = curDown; maxDownDate = dates[i + 1]; }
    } else {
      curUp = 0;
      curDown = 0;
    }
  }
  console.error(`\n  과열지수 최장 연속 상승: ${maxConsUp}일 (${maxUpDate})`);
  console.error(`  과열지수 최장 연속 하락: ${maxConsDown}일 (${maxDownDate})`);

  // KOSPI 급락 후 N일 내 과열지수 하락 확률
  console.error("\n  KOSPI 급락 후 과열지수 하락 확률:");
  for (const w of [3, 5, 10]) {
    let totalCrash = 0, ovhDecline = 0;
    for (const idx of kBotIdxs) {
      const oi = idx + 1;
      if (oi + w < overheat.length) {
        totalCrash++;
        if (overheat[oi + w] < overheat[oi]) ovhDecline++;
      }
    }
    if (totalCrash > 0) {
      console.error(`    ${w}일 내: ${fmtPct(ovhDecline / totalCrash)} (${ovhDecline}/${totalCrash})`);
    }
  }

  // 과열지수가 위험 구간(0.85%) 진입 후 KOSPI 성과
  console.error("\n  과열지수 위험 구간(≥0.85%) 진입 후 KOSPI 성과:");
  const dangerEntries = [];
  for (let i = 1; i < aligned.length; i++) {
    if (overheat[i] >= 0.85 && overheat[i - 1] < 0.85) {
      dangerEntries.push(i);
    }
  }
  console.error(`    위험 구간 진입 횟수: ${dangerEntries.length}회`);
  const dangerPerf = {};
  for (const w of [5, 10, 20, 30, 60, 90]) {
    const returns = [];
    for (const idx of dangerEntries) {
      if (idx + w < kospi.length) {
        returns.push((kospi[idx + w] - kospi[idx]) / kospi[idx]);
      }
    }
    if (returns.length > 0) {
      dangerPerf[`${w}d`] = {
        avg: fmtPct(mean(returns)),
        down: fmtPct(returns.filter((r) => r < 0).length / returns.length),
        n: returns.length,
      };
      console.error(`    ${w}일 후: 평균 ${dangerPerf[`${w}d`].avg}, 하락확률 ${dangerPerf[`${w}d`].down}, n=${returns.length}`);
    }
  }

  // 과열지수 안전→관심 구간 전환 시 KOSPI 성과
  console.error("\n  과열지수 안전→관심 전환 후 KOSPI 성과:");
  const safeToInterest = [];
  for (let i = 1; i < aligned.length; i++) {
    if (overheat[i] >= 0.5 && overheat[i - 1] < 0.5) {
      safeToInterest.push(i);
    }
  }
  console.error(`    안전→관심 전환 횟수: ${safeToInterest.length}회`);
  const sti_perf = {};
  for (const w of [30, 60, 90]) {
    const returns = [];
    for (const idx of safeToInterest) {
      if (idx + w < kospi.length) {
        returns.push((kospi[idx + w] - kospi[idx]) / kospi[idx]);
      }
    }
    if (returns.length > 0) {
      sti_perf[`${w}d`] = {
        avg: fmtPct(mean(returns)),
        down: fmtPct(returns.filter((r) => r < 0).length / returns.length),
        n: returns.length,
      };
      console.error(`    ${w}일 후: 평균 ${sti_perf[`${w}d`].avg}, 하락확률 ${sti_perf[`${w}d`].down}, n=${returns.length}`);
    }
  }

  results["7_patterns"] = {
    ovhSurgePerf,
    ovhPlungePerf,
    maxConsUp: { days: maxConsUp, date: maxUpDate },
    maxConsDown: { days: maxConsDown, date: maxDownDate },
    dangerEntries: dangerEntries.length,
    dangerPerf,
    safeToInterest: safeToInterest.length,
    safeToInterestPerf: sti_perf,
  };

  // ═══════════════════════════════════════════════
  // 8. 예외/이상치
  // ═══════════════════════════════════════════════
  console.error("\n=== 8. 예외/이상치 ===");

  // 예외1: 과열지수↑ 급등 & KOSPI↓ 급락 (같은 날)
  console.error("  예외1: 과열지수 급등 + KOSPI 급락 (같은 날):");
  const simultaneous = [];
  for (let i = 0; i < overheatPctChange.length; i++) {
    if (overheatPctChange[i] >= ovhTop5 && kospiPctChange[i] <= kBot5) {
      simultaneous.push({
        date: dates[i + 1],
        ovhChg: fmtPct(overheatPctChange[i]),
        kospiChg: fmtPct(kospiPctChange[i]),
      });
    }
  }
  for (const s of simultaneous.slice(0, 5)) {
    console.error(`    ${s.date}: 과열 ${s.ovhChg}, KOSPI ${s.kospiChg}`);
  }
  console.error(`    총 ${simultaneous.length}건`);

  // 예외2: 과열지수↓ 급락 + KOSPI↑ 급등 (같은 날)
  console.error("\n  예외2: 과열지수 급락 + KOSPI 급등:");
  const reverseSimultaneous = [];
  for (let i = 0; i < overheatPctChange.length; i++) {
    if (overheatPctChange[i] <= ovhBot5 && kospiPctChange[i] >= kTop5) {
      reverseSimultaneous.push({
        date: dates[i + 1],
        ovhChg: fmtPct(overheatPctChange[i]),
        kospiChg: fmtPct(kospiPctChange[i]),
      });
    }
  }
  for (const s of reverseSimultaneous.slice(0, 5)) {
    console.error(`    ${s.date}: 과열 ${s.ovhChg}, KOSPI ${s.kospiChg}`);
  }
  console.error(`    총 ${reverseSimultaneous.length}건`);

  // 예외3: 과열지수 위험 구간에서 KOSPI 추가 상승
  console.error("\n  예외3: 과열지수 위험(≥0.85%)인데 KOSPI 30일 후 +5% 이상:");
  const dangerButUp = [];
  for (let i = 0; i < aligned.length - 30; i++) {
    if (overheat[i] >= 0.85) {
      const ret = (kospi[i + 30] - kospi[i]) / kospi[i];
      if (ret >= 0.05) {
        dangerButUp.push({
          date: dates[i],
          overheatVal: overheat[i].toFixed(3),
          kospiReturn: fmtPct(ret),
        });
      }
    }
  }
  // Deduplicate by month
  const uniqueMonths = new Set();
  const dedupDangerUp = [];
  for (const d of dangerButUp) {
    const month = d.date.slice(0, 7);
    if (!uniqueMonths.has(month)) {
      uniqueMonths.add(month);
      dedupDangerUp.push(d);
    }
  }
  for (const d of dedupDangerUp.slice(0, 5)) {
    console.error(`    ${d.date}: 과열 ${d.overheatVal}%, 30일 후 KOSPI ${d.kospiReturn}`);
  }
  console.error(`    총 ${dedupDangerUp.length}개월`);

  // 예외4: 과열지수 안전인데 KOSPI 30일 후 -5% 이상 하락
  console.error("\n  예외4: 과열지수 안전(<0.5%)인데 KOSPI 30일 후 -5% 이상 하락:");
  const safeButDown = [];
  for (let i = 0; i < aligned.length - 30; i++) {
    if (overheat[i] < 0.5) {
      const ret = (kospi[i + 30] - kospi[i]) / kospi[i];
      if (ret <= -0.05) {
        safeButDown.push({
          date: dates[i],
          overheatVal: overheat[i].toFixed(3),
          kospiReturn: fmtPct(ret),
        });
      }
    }
  }
  const uniqueMonths2 = new Set();
  const dedupSafeDown = [];
  for (const d of safeButDown) {
    const month = d.date.slice(0, 7);
    if (!uniqueMonths2.has(month)) {
      uniqueMonths2.add(month);
      dedupSafeDown.push(d);
    }
  }
  for (const d of dedupSafeDown.slice(0, 5)) {
    console.error(`    ${d.date}: 과열 ${d.overheatVal}%, 30일 후 KOSPI ${d.kospiReturn}`);
  }
  console.error(`    총 ${dedupSafeDown.length}개월`);

  // 극단 이상치 (상하위 1%)
  console.error("\n  과열지수 일별 변화 극단 이상치:");
  const extremeChanges = [];
  for (let i = 0; i < overheatPctChange.length; i++) {
    extremeChanges.push({
      date: dates[i + 1],
      ovhChg: overheatPctChange[i],
      kospiChg: kospiPctChange[i],
      overheatVal: overheat[i + 1],
    });
  }
  extremeChanges.sort((a, b) => b.ovhChg - a.ovhChg);
  console.error("  Top 5 상승:");
  for (const e of extremeChanges.slice(0, 5)) {
    console.error(`    ${e.date}: 과열 ${fmtPct(e.ovhChg)}, KOSPI ${fmtPct(e.kospiChg)}, 과열수준 ${e.overheatVal.toFixed(3)}%`);
  }
  console.error("  Top 5 하락:");
  for (const e of extremeChanges.slice(-5).reverse()) {
    console.error(`    ${e.date}: 과열 ${fmtPct(e.ovhChg)}, KOSPI ${fmtPct(e.kospiChg)}, 과열수준 ${e.overheatVal.toFixed(3)}%`);
  }

  results["8_outliers"] = {
    simultaneous: simultaneous.slice(0, 5),
    reverseSimultaneous: reverseSimultaneous.slice(0, 5),
    dangerButUp: dedupDangerUp.slice(0, 5),
    safeButDown: dedupSafeDown.slice(0, 5),
    topChanges: extremeChanges.slice(0, 5).map((e) => ({
      date: e.date,
      ovhChg: fmtPct(e.ovhChg),
      kospiChg: fmtPct(e.kospiChg),
      level: e.overheatVal.toFixed(3),
    })),
    bottomChanges: extremeChanges.slice(-5).reverse().map((e) => ({
      date: e.date,
      ovhChg: fmtPct(e.ovhChg),
      kospiChg: fmtPct(e.kospiChg),
      level: e.overheatVal.toFixed(3),
    })),
  };

  // Output summary
  console.error("\n=== 분석 완료 ===");
  console.error(`총 데이터: ${aligned.length}영업일 (${aligned[0].date} ~ ${aligned[aligned.length - 1].date})`);

  // Print full results as JSON to stdout
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
