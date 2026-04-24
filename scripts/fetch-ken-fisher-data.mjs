// ====================================================================
// 켄 피셔 페이지용 월별 시계열 데이터 생성 스크립트
// 출력: lib/data/ken-fisher-series.json
//
// 수집 대상:
//   - S&P 500 월별 종가 (1985.01 ~ 현재)  ← Shiller XLS + Yahoo 보강
//   - S&P 500 월별 trailing PE (1985.01 ~ Shiller 제공 범위)
//   - Nasdaq 100 월별 종가 (1985.10 ~ 현재)  ← Yahoo ^NDX
//
// Nasdaq 100 PE는 신뢰할 만한 무료 장기 월별 소스가 없어
// 페이지에서 별도 상수로 분기/반기 데이터 표시 예정 (본 스크립트는 생성하지 않음)
// ====================================================================

import xlsx from "xlsx";
import YahooFinance from "yahoo-finance2";
import { writeFileSync } from "fs";
import { resolve } from "path";

const yahooFinance = new YahooFinance();
if (yahooFinance.suppressNotices) yahooFinance.suppressNotices(["yahooSurvey"]);

const SHILLER_PATH = "C:/tmp/kf/ie_data_new.xls";
const OUT_PATH = resolve("lib/data/ken-fisher-series.json");

// ---------- Shiller 파싱 ----------
function yearFracToYM(yf) {
  const year = Math.floor(yf);
  const month = Math.round((yf - year) * 100);
  return { year, month };
}

function ymToIso(year, month) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

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
    if (price === null) continue;
    const pe = earnings && earnings > 0 ? price / earnings : null;
    out.push({
      date: ymToIso(year, month),
      price: Math.round(price * 100) / 100,
      pe: pe !== null ? Math.round(pe * 100) / 100 : null,
    });
  }
  return out;
}

// ---------- Yahoo 월별 ----------
async function fetchMonthly(symbol, from) {
  // yahoo-finance2 monthly historical
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

// ---------- 병합: Shiller로 초기 구간, Yahoo로 최근 구간 보강 ----------
function mergeByDate(base, extension) {
  const map = new Map(base.map((x) => [x.date, x]));
  for (const ext of extension) {
    if (!map.has(ext.date)) {
      map.set(ext.date, ext);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function main() {
  console.log("1. Parsing Shiller XLS...");
  const shiller = parseShiller();
  console.log(`   ${shiller.length} rows, ${shiller[0].date} ~ ${shiller[shiller.length - 1].date}`);
  const spWithPe = shiller.filter((r) => r.pe !== null);
  console.log(`   PE rows: ${spWithPe.length}, last PE date: ${spWithPe[spWithPe.length - 1].date}`);

  console.log("2. Fetching Yahoo ^GSPC monthly (for recent gap)...");
  const gspcRecent = await fetchMonthly("^GSPC", new Date("2024-07-01"));
  console.log(`   ${gspcRecent.length} rows, last: ${gspcRecent[gspcRecent.length - 1].date}`);

  // Build sp500 series: Shiller price (1985-now-ish) + Yahoo price for missing months
  const sp500PriceBase = shiller.map(({ date, price }) => ({ date, price }));
  const sp500Price = mergeByDate(sp500PriceBase, gspcRecent);
  const sp500Pe = shiller
    .filter((r) => r.pe !== null)
    .map(({ date, pe }) => ({ date, value: pe }));
  // Add latest month sp500Pe by approx via latest GSPC price / latest Shiller earnings
  // Skip — just use Shiller's coverage. Page will label range.

  console.log("3. Fetching Yahoo ^NDX monthly (Nasdaq 100, from 1985)...");
  const ndx = await fetchMonthly("^NDX", new Date("1985-01-01"));
  console.log(`   ${ndx.length} rows, first: ${ndx[0]?.date}, last: ${ndx[ndx.length - 1]?.date}`);

  const out = {
    generatedAt: new Date().toISOString(),
    sources: {
      sp500: "Robert J. Shiller (ie_data.xls, shillerdata.com) + Yahoo Finance ^GSPC",
      nasdaq100: "Yahoo Finance ^NDX",
    },
    sp500Price, // [{ date: 'YYYY-MM-01', price }]
    sp500Pe, // [{ date, value }]
    nasdaq100Price: ndx.map(({ date, price }) => ({ date, price })), // [{ date, price }]
  };

  writeFileSync(OUT_PATH, JSON.stringify(out));
  console.log(`\nWrote ${OUT_PATH}`);
  console.log(`  sp500Price:     ${sp500Price.length} rows (${sp500Price[0].date} ~ ${sp500Price[sp500Price.length - 1].date})`);
  console.log(`  sp500Pe:        ${sp500Pe.length} rows (${sp500Pe[0].date} ~ ${sp500Pe[sp500Pe.length - 1].date})`);
  console.log(`  nasdaq100Price: ${ndx.length} rows (${ndx[0]?.date} ~ ${ndx[ndx.length - 1]?.date})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
