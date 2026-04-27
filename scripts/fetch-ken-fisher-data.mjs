// ====================================================================
// 켄 피셔 페이지용 월별 시계열 데이터 생성 스크립트
// 출력: lib/data/ken-fisher-series.json
//
// 수집 대상:
//   - S&P 500 월별 종가 (1985.01 ~ 현재)            ← Shiller XLS + Yahoo 보강
//   - S&P 500 월별 trailing PE (1985.01 ~ 현재)     ← multpl.com (fallback: 기존 JSON)
//   - Nasdaq 100 월별 종가 (1985.10 ~ 현재)         ← Yahoo ^NDX
//   - 미국 10년물 국채 금리 월별 (1985.01 ~ 현재)  ← Shiller GS10 + Yahoo ^TNX
//
// PE 출처 변경(2026-04): Shiller XLS의 EPS는 보고 지연으로 1년 이상 멈춰 있음.
// multpl.com은 1871-01 ~ 현재까지 매월 + 일별 최신값을 제공하며 Shiller와
// 평균 차이 0.009%로 사실상 동일 데이터.
//
// Nasdaq 100 PE는 신뢰할 만한 무료 장기 월별 소스가 없어
// lib/data/ken-fisher-nasdaq-pe.ts 에 연간 상수로 별도 관리
// ====================================================================

import xlsx from "xlsx";
import YahooFinance from "yahoo-finance2";
import { writeFileSync, readFileSync } from "fs";
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

// ---------- multpl.com PE 스크래핑 ----------
// 반환: [{ date: 'YYYY-MM-01', value: number }, ...]
// 일별 최신값(첫 행)도 동일한 월의 day=1로 정규화하여 가장 최근 월에 반영
const MONTH_TO_NUM = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

// "Jun 1, 2024" / "Apr 24, 2026" → { y, m, day } (타임존 영향 없음)
function parseMultplDate(s) {
  const m = s.match(/^([A-Za-z]+)\s+(\d+),\s+(\d+)$/);
  if (!m) return null;
  const month = MONTH_TO_NUM[m[1].slice(0, 3)];
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (!month || !day || !year) return null;
  return { y: year, m: month, day };
}

async function fetchMultplPe() {
  const url = "https://www.multpl.com/s-p-500-pe-ratio/table/by-month";
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (TockTock data refresh)" },
  });
  if (!res.ok) throw new Error(`multpl HTTP ${res.status}`);
  const html = await res.text();
  const tableMatch =
    html.match(/<table[^>]*id=["']datatable["'][\s\S]*?<\/table>/i) ||
    html.match(/<table[\s\S]*?<\/table>/);
  if (!tableMatch) throw new Error("multpl: table not found in HTML");
  const rows = [...tableMatch[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
  if (rows.length < 100) throw new Error(`multpl: too few rows (${rows.length})`);

  // 월별 최신값 우선: 같은 월 안에 일별값(day>1)과 월값(day=1)이 섞여 있으면 day가 큰 쪽 사용
  const byMonth = new Map();
  for (const r of rows.slice(1)) {
    const cells = [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(
      (c) =>
        c[1]
          .replace(/<[^>]+>/g, "")
          .replace(/&#x2002;/g, "")
          .replace(/†/g, "")
          .trim(),
    );
    if (cells.length !== 2) continue;
    const parsed = parseMultplDate(cells[0]);
    if (!parsed) continue;
    const value = parseFloat(cells[1]);
    if (!isFinite(value) || value <= 0) continue;
    const { y, m, day } = parsed;
    const key = `${y}-${String(m).padStart(2, "0")}-01`;
    const existing = byMonth.get(key);
    if (!existing || day > existing.day) byMonth.set(key, { day, value });
  }

  const out = [];
  for (const [date, { value }] of byMonth) {
    if (date < "1985-01-01") continue;
    out.push({ date, value: Math.round(value * 100) / 100 });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  if (out.length < 400) throw new Error(`multpl: parsed only ${out.length} rows (expected 490+)`);
  return out;
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
  console.log("1. Parsing Shiller XLS (price + rate)...");
  const shiller = parseShiller();
  const shillerWithPrice = shiller.filter((r) => r.price !== null);
  const shillerWithRate = shiller.filter((r) => r.rate !== null);
  console.log(`   Price: ${shillerWithPrice.length} rows, last: ${shillerWithPrice[shillerWithPrice.length - 1].date}`);
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

  // 5. multpl.com PE — 실패 시 기존 JSON의 sp500Pe 유지
  console.log("5. Fetching multpl.com PE (with Shiller-JSON fallback)...");
  let sp500Pe = null;
  let peSource = "multpl.com";
  try {
    sp500Pe = await fetchMultplPe();
    console.log(`   ${sp500Pe.length} rows, ${sp500Pe[0].date} ~ ${sp500Pe[sp500Pe.length - 1].date}`);
  } catch (e) {
    console.warn(`   ⚠️  multpl 스크래핑 실패: ${e.message}`);
    try {
      const existing = JSON.parse(readFileSync(OUT_PATH, "utf8"));
      if (Array.isArray(existing?.sp500Pe) && existing.sp500Pe.length > 0) {
        sp500Pe = existing.sp500Pe;
        peSource = "기존 JSON (Shiller, fallback)";
        console.warn(`   ↩  기존 sp500Pe 유지: ${sp500Pe.length} rows, last: ${sp500Pe[sp500Pe.length - 1].date}`);
      } else {
        throw new Error("기존 JSON에도 sp500Pe 없음");
      }
    } catch (fallbackErr) {
      throw new Error(`multpl 실패 + fallback도 실패: ${fallbackErr.message}`);
    }
  }

  // Build series
  const sp500Price = mergeByDate(
    shiller.filter((r) => r.price !== null).map(({ date, price }) => ({ date, price })),
    gspcRecent,
    "price"
  );

  const longTermRate = mergeByDate(
    shiller.filter((r) => r.rate !== null).map(({ date, rate }) => ({ date, rate })),
    tnxRecent,
    "rate"
  );

  const out = {
    generatedAt: new Date().toISOString(),
    sources: {
      sp500: "Robert J. Shiller (ie_data.xls, shillerdata.com) + Yahoo Finance ^GSPC",
      sp500Pe: peSource,
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
  console.log(`  sp500Pe:        ${sp500Pe.length} rows (${sp500Pe[0].date} ~ ${sp500Pe[sp500Pe.length - 1].date}) [${peSource}]`);
  console.log(`  nasdaq100Price: ${ndx.length} rows (${ndx[0]?.date} ~ ${ndx[ndx.length - 1]?.date})`);
  console.log(`  longTermRate:   ${longTermRate.length} rows (${longTermRate[0].date} ~ ${longTermRate[longTermRate.length - 1].date})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
