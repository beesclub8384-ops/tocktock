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

// GICS 세부산업 → 산업그룹(25) 매핑 (data/us-gics-mapping.json)
const GICS = JSON.parse(fs.readFileSync(path.join(REPO, "data/us-gics-mapping.json"), "utf8"));
const SUB2GROUP = GICS.subIndustryToGroup;
const GROUP_KO = GICS.groups;
// 미국 종목 한글명 (data/us-stock-names-ko.json, 네이버 1회 수집분). 없으면 영문 폴백.
const NAMES_KO = JSON.parse(fs.readFileSync(path.join(REPO, "data/us-stock-names-ko.json"), "utf8"));

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
      out.push({ ticker: cells[0], yahoo: cells[0].replace(/\./g, "-"), name: cells[1], gicsSector: cells[2], subIndustry: cells[3] });
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

  console.log("3) 조인 + GICS 산업그룹(25) 묶기...");
  const byGroup = new Map(); // 산업그룹 → stocks[]
  let joined = 0, skipped = 0;
  const unmapped = new Set();
  for (const it of list) {
    const q = qmap.get(it.yahoo);
    if (!q || !Number.isFinite(q.marketCap) || !Number.isFinite(q.regularMarketVolume)) { skipped++; continue; }
    let group = SUB2GROUP[it.subIndustry];
    if (!group) { unmapped.add(it.subIndustry); group = "기타"; } // 검증상 0이어야 함
    joined++;
    const price = Number(q.regularMarketPrice) || 0;
    const volume = Number(q.regularMarketVolume) || 0;
    const entry = {
      ticker: it.ticker, name: it.name, nameKo: NAMES_KO[it.ticker] || it.name, // 한글명(없으면 영문 폴백)
      marketCap: Number(q.marketCap),
      price, changeRate: Number(q.regularMarketChangePercent) || 0,
      tradingValue: Math.round(price * volume), // 근사(현재가×거래량)
      volume,
    };
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(entry);
  }

  const 산업그룹 = [];
  for (const [g, stocks] of byGroup) {
    stocks.sort((a, b) => b.marketCap - a.marketCap);
    산업그룹.push({ name: g, nameKo: GROUP_KO[g] || g, count: stocks.length, stocks });
  }
  산업그룹.sort((a, b) => b.stocks.reduce((s, x) => s + x.marketCap, 0) - a.stocks.reduce((s, x) => s + x.marketCap, 0));

  const blob = {
    updatedAt: new Date().toISOString(),
    source: "wikipedia S&P500 + yahoo-finance2 · GICS 산업그룹(25)",
    units: { currency: "USD", marketCap: "USD", price: "USD", tradingValue: "USD", volume: "주", changeRate: "%" },
    totalQuotes: qmap.size, joined, 산업그룹,
  };
  await redis.set(CACHE_KEY, blob);
  console.log(`4) Redis 저장 → ${CACHE_KEY} (${(Buffer.byteLength(JSON.stringify(blob)) / 1024).toFixed(0)}KB)`);
  console.log(`   조인 ${joined} / 스킵(결측) ${skipped} / 산업그룹 ${산업그룹.length}`);

  // 검증
  console.log("\n매핑 안 된 세부산업:", unmapped.size, unmapped.size ? "❌ " + [...unmapped].join(", ") : "✅ 0개");
  const single = 산업그룹.filter((s) => s.count === 1).length;
  console.log("산업그룹별 종목수:", 산업그룹.map((s) => `${s.nameKo} ${s.count}`).join(", "));
  console.log("1종목 그룹:", single, "| 그룹당 평균:", (joined / 산업그룹.length).toFixed(1));
  const flat = 산업그룹.flatMap((s) => s.stocks.map((x) => ({ ...x, g: s.name })));
  for (const [tk, exp] of [["AAPL", "Technology Hardware & Equipment"], ["NVDA", "Semiconductors & Semiconductor Equipment"], ["JPM", "Banks"]]) {
    const f = flat.find((x) => x.ticker === tk);
    console.log(`  ${tk} → ${f?.g} ${f?.g === exp ? "✅" : "❌(기대 " + exp + ")"}`);
  }
  const brk = flat.find((x) => x.ticker === "BRK.B");
  console.log("  BRK.B 조인:", brk ? `OK → ${brk.g}` : "❌ 없음");
}
main().then(() => process.exit(0)).catch((e) => { console.error("실패:", e.message); process.exit(1); });
