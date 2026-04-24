// ====================================================================
// 켄 피셔 페이지용 월별 시계열 데이터 생성 스크립트
// 출력: lib/data/ken-fisher-series.json
//
// 수집 대상:
//   - S&P 500 월별 종가 (1985.01 ~ 현재)            ← Shiller XLS + Yahoo 보강
//   - S&P 500 월별 trailing PE (1985.01 ~ Shiller 제공 범위)
//   - Nasdaq 100 월별 종가 (1985.10 ~ 현재)         ← Yahoo ^NDX
//   - 미국 10년물 국채 금리 월별 (1985.01 ~ 현재)  ← Shiller GS10 + Yahoo ^TNX
//
// Nasdaq 100 PE는 신뢰할 만한 무료 장기 월별 소스가 없어
// lib/data/ken-fisher-nasdaq-pe.ts 에 연간 상수로 별도 관리
// ====================================================================

import xlsx from "xlsx";
import YahooFinance from "yahoo-finance2";
import { writeFileSync } from "fs";
import { resolve } from "path";

const yahooFinance = new YahooFinance();
if (yahooFinance.suppressNotices) yahooFinance.suppressNotices(["yahooSurvey"]);

const SHILLER_PATH = "C:/tmp/kf/ie_data_new.xls";
const OUT_PATH = resolve("lib/data/ken-fisher-series.json");

function yearFracToYM(yf) {
  const year = Math.floor(yf);
  const month = Math.round((yf - year) * 100);
  return { year, month };
}

function ymToIso(year, month) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

// ---------- Shiller 파싱 ----------
function parseShiller() {
  const wb = xlsx.readFile(SHILLER_PATH);
  const rows = xlsx.utils.sheet_to_json(wb.Sheets["Data"], { header: 1, raw: true });
  const out = [];
  for (const r of rows) {
    if (!r || typeof r[0] !== "number") continue;
    if (r[0] < 1985.0) continue;
    const { year, month } = yearFracToYM(r[0]);
    const price = typeof r[1] === "number" ? r[1] : null;
    const earnings = typeof r[3] === "number" ? r[3] : null;
    const rate = typeof r[6] === "number" ? r[6] : null; // Rate GS10 — 10년물 금리(%)
    if (price === null && rate === null) continue;
    const pe = earnings && earnings > 0 && price ? price / earnings : null;
    out.push({
      date: ymToIso(year, month),
      price: price !== null ? Math.round(price * 100) / 100 : null,
      pe: pe !== null ? Math.round(pe * 100) / 100 : null,
      rate: rate !== null ? Math.round(rate * 100) / 100 : null,
    });
  }
  return out;
}

// ---------- Yahoo 월별 (prices) ----------
async function fetchMonthly(symbol, from) {
  const result = await yahooFinance.chart(symbol, {
    period1: from,
    period2: new Date(),
    interval: "1mo",
  });
  const quotes = result.quotes || [];
  return quotes
    .filter((q) => q.close != null && q.date)
    .map((q) => {
      const d = new Date(q.date);
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth() + 1;
      return {
        date: ymToIso(y, m),
        price: Math.round(q.close * 100) / 100,
      };
    });
}

// ---------- Yahoo ^TNX 일별 → 월별 리샘플 (월 마지막 거래일 종가) ----------
async function fetchTnxMonthly(from) {
  const result = await yahooFinance.chart("^TNX", {
    period1: from,
    period2: new Date(),
    interval: "1d",
  });
  const quotes = (result.quotes || []).filter((q) => q.close != null && q.date);
  // Group by YYYY-MM and take last trading day close
  const byMonth = new Map();
  for (const q of quotes) {
    const d = new Date(q.date);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const cur = byMonth.get(key);
    const ts = d.getTime();
    if (!cur || ts > cur.ts) {
      byMonth.set(key, { ts, close: q.close });
    }
  }
  return Array.from(byMonth.entries())
    .map(([key, { close }]) => ({
      date: `${key}-01`,
      rate: Math.round(close * 100) / 100,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- 병합 헬퍼 ----------
function mergeByDate(base, extension, field) {
  const map = new Map(base.map((x) => [x.date, x]));
  for (const ext of extension) {
    const existing = map.get(ext.date);
    if (!existing) {
      map.set(ext.date, { date: ext.date, [field]: ext[field] });
    } else if (existing[field] == null) {
      map.set(ext.date, { ...existing, [field]: ext[field] });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function main() {
  console.log("1. Parsing Shiller XLS...");
  const shiller = parseShiller();
  const shillerWithPrice = shiller.filter((r) => r.price !== null);
  const shillerWithPe = shiller.filter((r) => r.pe !== null);
  const shillerWithRate = shiller.filter((r) => r.rate !== null);
  console.log(`   Price: ${shillerWithPrice.length} rows, last: ${shillerWithPrice[shillerWithPrice.length - 1].date}`);
  console.log(`   PE:    ${shillerWithPe.length} rows, last: ${shillerWithPe[shillerWithPe.length - 1].date}`);
  console.log(`   Rate:  ${shillerWithRate.length} rows, last: ${shillerWithRate[shillerWithRate.length - 1].date}`);

  console.log("2. Fetching Yahoo ^GSPC monthly (for price gap)...");
  const gspcRecent = await fetchMonthly("^GSPC", new Date("2024-07-01"));
  console.log(`   ${gspcRecent.length} rows, last: ${gspcRecent[gspcRecent.length - 1]?.date}`);

  console.log("3. Fetching Yahoo ^NDX monthly (Nasdaq 100, from 1985)...");
  const ndx = await fetchMonthly("^NDX", new Date("1985-01-01"));
  console.log(`   ${ndx.length} rows, first: ${ndx[0]?.date}, last: ${ndx[ndx.length - 1]?.date}`);

  console.log("4. Fetching Yahoo ^TNX daily→monthly (for rate gap)...");
  const tnxRecent = await fetchTnxMonthly(new Date("2024-07-01"));
  console.log(`   ${tnxRecent.length} rows, last: ${tnxRecent[tnxRecent.length - 1]?.date}`);

  // Build series
  const sp500Price = mergeByDate(
    shiller.filter((r) => r.price !== null).map(({ date, price }) => ({ date, price })),
    gspcRecent,
    "price"
  );

  const sp500Pe = shiller
    .filter((r) => r.pe !== null)
    .map(({ date, pe }) => ({ date, value: pe }));

  const longTermRate = mergeByDate(
    shiller.filter((r) => r.rate !== null).map(({ date, rate }) => ({ date, rate })),
    tnxRecent,
    "rate"
  );

  const out = {
    generatedAt: new Date().toISOString(),
    sources: {
      sp500: "Robert J. Shiller (ie_data.xls, shillerdata.com) + Yahoo Finance ^GSPC",
      nasdaq100: "Yahoo Finance ^NDX",
      longTermRate: "Robert J. Shiller (GS10 column, ie_data.xls) + Yahoo Finance ^TNX",
    },
    sp500Price,
    sp500Pe,
    nasdaq100Price: ndx.map(({ date, price }) => ({ date, price })),
    longTermRate, // [{ date, rate }]
  };

  writeFileSync(OUT_PATH, JSON.stringify(out));
  console.log(`\nWrote ${OUT_PATH}`);
  console.log(`  sp500Price:     ${sp500Price.length} rows (${sp500Price[0].date} ~ ${sp500Price[sp500Price.length - 1].date})`);
  console.log(`  sp500Pe:        ${sp500Pe.length} rows (${sp500Pe[0].date} ~ ${sp500Pe[sp500Pe.length - 1].date})`);
  console.log(`  nasdaq100Price: ${ndx.length} rows (${ndx[0]?.date} ~ ${ndx[ndx.length - 1]?.date})`);
  console.log(`  longTermRate:   ${longTermRate.length} rows (${longTermRate[0].date} ~ ${longTermRate[longTermRate.length - 1].date})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
