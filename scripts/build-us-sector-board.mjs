/**
 * 미국 섹터 보드 빌더 (S&P500 · GICS): 위키 명단·GICS + 야후 시세 조인
 *   → GICS 11섹터별 시총 내림차순 → Redis(us-sector-board:data) 저장.
 *
 * 사용: node scripts/build-us-sector-board.mjs
 * ⚠️ 로직은 lib/us-sector-board.ts(cron용)와 쌍둥이 — 한쪽 수정 시 반드시 함께 반영.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Redis } from "@upstash/redis";
import YahooFinance from "yahoo-finance2";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
function loadEnv(name) {
  for (const f of [".env.vercel.local", ".env.local", ".env"]) {
    try {
      const m = fs.readFileSync(path.join(REPO, f), "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
      if (m) return m[1].trim().replace(/^["']|["']$/g, "").replace(/\r/g, "");
    } catch {}
  }
  return null;
}
const redis = new Redis({ url: loadEnv("UPSTASH_REDIS_REST_URL"), token: loadEnv("UPSTASH_REDIS_REST_TOKEN") });
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });
const CACHE_KEY = "us-sector-board:data";

const GICS_KO = {
  "Information Technology": "정보기술",
  "Health Care": "헬스케어",
  "Financials": "금융",
  "Consumer Discretionary": "경기소비재",
  "Communication Services": "커뮤니케이션서비스",
  "Industrials": "산업재",
  "Consumer Staples": "필수소비재",
  "Energy": "에너지",
  "Utilities": "유틸리티",
  "Real Estate": "부동산",
  "Materials": "소재",
};

// ── 위키 S&P500 파싱 ──
async function fetchSP500() {
  const html = await (await fetch("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; tocktock/1.0)" },
    signal: AbortSignal.timeout(15000),
  })).text();
  const s = html.indexOf('id="constituents"');
  const tbl = html.slice(s, html.indexOf("</table>", s));
  const rows = tbl.split("<tr>").slice(2);
  const out = [];
  for (const r of rows) {
    const cells = [...r.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) =>
      m[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\n/g, " ").trim()
    );
    if (cells.length >= 4 && /^[A-Z.]{1,6}$/.test(cells[0])) {
      out.push({ ticker: cells[0], yahoo: cells[0].replace(/\./g, "-"), name: cells[1], gicsSector: cells[2] });
    }
  }
  if (out.length < 450) throw new Error(`위키 파싱 행 부족(${out.length}) — 포맷 변경 의심, 중단`);
  return out;
}

// ── 야후 시세 배치 (청크) ──
async function fetchQuotes(yahooTickers) {
  const CHUNK = 75;
  const map = new Map();
  for (let i = 0; i < yahooTickers.length; i += CHUNK) {
    const chunk = yahooTickers.slice(i, i + CHUNK);
    let arr = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try { const r = await yf.quote(chunk, {}, { validateResult: false }); arr = Array.isArray(r) ? r : [r]; break; }
      catch (e) { if (attempt === 2) console.warn(`  청크 ${i} 실패:`, e.message); else await new Promise((s) => setTimeout(s, 1500)); }
    }
    for (const q of arr || []) if (q?.symbol) map.set(q.symbol, q);
  }
  return map;
}

async function main() {
  console.log("1) 위키 S&P500 파싱...");
  const list = await fetchSP500();
  console.log(`   종목 ${list.length} (점티커→대시 변환 예: ${list.filter((x) => x.ticker.includes(".")).map((x) => x.ticker + "→" + x.yahoo).join(", ") || "없음"})`);

  console.log("2) 야후 시세 배치 조회...");
  const qmap = await fetchQuotes(list.map((x) => x.yahoo));
  console.log(`   시세 응답 ${qmap.size}종목`);

  console.log("3) 조인 + GICS 섹터 묶기...");
  const bySector = new Map(); // sector → stocks[]
  let joined = 0, skipped = 0;
  for (const it of list) {
    const q = qmap.get(it.yahoo);
    if (!q || !Number.isFinite(q.marketCap) || !Number.isFinite(q.regularMarketVolume)) { skipped++; continue; }
    joined++;
    const price = Number(q.regularMarketPrice) || 0;
    const volume = Number(q.regularMarketVolume) || 0;
    const entry = {
      ticker: it.ticker, name: it.name,
      marketCap: Number(q.marketCap),
      price, changeRate: Number(q.regularMarketChangePercent) || 0,
      tradingValue: Math.round(price * volume), // 근사(현재가×거래량)
      volume,
    };
    if (!bySector.has(it.gicsSector)) bySector.set(it.gicsSector, []);
    bySector.get(it.gicsSector).push(entry);
  }

  const 섹터 = [];
  for (const [sec, stocks] of bySector) {
    stocks.sort((a, b) => b.marketCap - a.marketCap);
    섹터.push({ name: sec, nameKo: GICS_KO[sec] || sec, count: stocks.length, stocks });
  }
  섹터.sort((a, b) => b.stocks.reduce((s, x) => s + x.marketCap, 0) - a.stocks.reduce((s, x) => s + x.marketCap, 0));

  const blob = {
    updatedAt: new Date().toISOString(),
    source: "wikipedia S&P500 + yahoo-finance2",
    units: { currency: "USD", marketCap: "USD", price: "USD", tradingValue: "USD", volume: "주", changeRate: "%" },
    totalQuotes: qmap.size, joined, 섹터,
  };
  await redis.set(CACHE_KEY, blob);
  console.log(`4) Redis 저장 → ${CACHE_KEY} (${(Buffer.byteLength(JSON.stringify(blob)) / 1024).toFixed(0)}KB)`);
  console.log(`   조인 ${joined} / 스킵(결측) ${skipped} / 섹터 ${섹터.length}`);

  // 검증 샘플
  console.log("\n섹터별 종목수:", 섹터.map((s) => `${s.nameKo} ${s.count}`).join(", "));
  const it2 = 섹터.find((s) => s.name === "Information Technology");
  console.log("정보기술 top3:", it2.stocks.slice(0, 3).map((s) => `${s.name}(${s.ticker}) $${(s.marketCap / 1e9).toFixed(0)}B ${s.changeRate.toFixed(2)}%`).join(" / "));
  // 점티커 확인
  const brk = 섹터.flatMap((s) => s.stocks).find((s) => s.ticker === "BRK.B");
  console.log("BRK.B 조인:", brk ? `OK $${(brk.marketCap / 1e9).toFixed(0)}B` : "❌ 없음(점티커 변환 확인)");
}
main().then(() => process.exit(0)).catch((e) => { console.error("실패:", e.message); process.exit(1); });
