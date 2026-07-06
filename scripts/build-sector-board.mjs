/**
 * 섹터 보드 빌더: 네이버 전종목 시세(시총·등락률·거래대금) → results.json 분류와 조인
 *   → 60개 섹터(소분류)별로 묶어 시총 내림차순 정렬 → Redis 저장.
 *
 * 사용: node scripts/build-sector-board.mjs
 * Redis 키: sector-board:data
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Redis } from "@upstash/redis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");

// ── 환경변수 로드 (.env.vercel.local) ──
function loadEnv(name) {
  for (const f of [".env.vercel.local", ".env.local", ".env"]) {
    try {
      const m = fs.readFileSync(path.join(REPO, f), "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
      if (m) return m[1].trim().replace(/^["']|["']$/g, "").replace(/\r/g, "");
    } catch {}
  }
  return null;
}
const redis = new Redis({
  url: loadEnv("UPSTASH_REDIS_REST_URL"),
  token: loadEnv("UPSTASH_REDIS_REST_TOKEN"),
});
const CACHE_KEY = "sector-board:data";

const NAVER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "ko-KR,ko;q=0.9",
};

// ── 1) 네이버 전종목 시세 수집 ──
async function fetchMarket(market) {
  const PAGE = 100;
  const out = [];
  const first = await (await fetch(`https://m.stock.naver.com/api/stocks/marketValue/${market}?page=1&pageSize=${PAGE}`, { headers: NAVER_HEADERS, signal: AbortSignal.timeout(10000) })).json();
  const totalPages = Math.ceil((first.totalCount ?? 0) / PAGE);
  const collect = (stocks) => {
    for (const s of stocks ?? []) {
      if (!s.itemCode || !s.stockName) continue;
      const cap = Number(s.marketValueRaw ?? "0");
      out.push({
        code: s.itemCode,
        name: s.stockName,
        marketCap: Number.isFinite(cap) ? cap : 0,             // 원
        price: Number(s.closePriceRaw ?? "0"),                  // 원
        changeRate: Number(s.fluctuationsRatio ?? "0"),         // %
        tradingValue: Number(s.accumulatedTradingValueRaw ?? "0"), // 원
        market,
        tradeStopped: s.tradeStopType?.name === "STOP",
      });
    }
  };
  collect(first.stocks);
  for (let p = 2; p <= totalPages; p += 5) {
    const batch = [];
    for (let q = p; q < p + 5 && q <= totalPages; q++) {
      batch.push(
        fetch(`https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${q}&pageSize=${PAGE}`, { headers: NAVER_HEADERS, signal: AbortSignal.timeout(10000) })
          .then((r) => (r.ok ? r.json() : { stocks: [] }))
          .then((j) => j.stocks ?? [])
          .catch(() => [])
      );
    }
    for (const stocks of await Promise.all(batch)) collect(stocks);
  }
  return out;
}

// ── 섹터 평균 등락 계산 (시총가중 + 단순평균) ──
// 시총가중 = Σ(changeRate×marketCap)/Σ(marketCap), 시총 없는 종목 제외
// 단순평균 = Σ(changeRate)/유효종목수, changeRate 없는 종목 제외
function sectorAverages(stocks) {
  let wSum = 0, capSum = 0, rSum = 0, n = 0;
  for (const s of stocks) {
    const r = Number(s.changeRate);
    if (!Number.isFinite(r)) continue;
    n++; rSum += r;
    const cap = Number(s.marketCap);
    if (Number.isFinite(cap) && cap > 0) { wSum += r * cap; capSum += cap; }
  }
  return {
    avgWeighted: capSum > 0 ? wSum / capSum : 0,
    avgSimple: n > 0 ? rSum / n : 0,
    avgCount: n,
  };
}

async function main() {
  console.log("1) 네이버 전종목 시세 수집...");
  const [kospi, kosdaq] = await Promise.all([fetchMarket("KOSPI"), fetchMarket("KOSDAQ")]);
  const quotes = [...kospi, ...kosdaq];
  const quoteByCode = new Map(quotes.map((q) => [q.code, q]));
  console.log(`   수집: KOSPI ${kospi.length} + KOSDAQ ${kosdaq.length} = ${quotes.length}종목`);

  console.log("2) 분류 결과 조인...");
  const results = JSON.parse(fs.readFileSync(path.join(REPO, "data/sectors/classification/results.json"), "utf8"));
  const sectors = JSON.parse(fs.readFileSync(path.join(REPO, "data/sectors/sectors.json"), "utf8"));

  // 칸 → 종목 시세 리스트
  const cellMap = new Map(); // 소분류명 → [stockWithQuote]
  for (const maj of sectors.대분류) for (const min of maj.소분류) cellMap.set(min.name, []);
  let joined = 0, noQuote = 0;
  for (const r of results) {
    if (!Array.isArray(r.칸) || r.칸.length === 0) continue;
    const q = quoteByCode.get(r.code);
    if (!q) { noQuote++; continue; } // 상장폐지 등 시세 없음
    joined++;
    const entry = { code: r.code, name: r.name, marketCap: q.marketCap, price: q.price, changeRate: q.changeRate, tradingValue: q.tradingValue, market: q.market };
    for (const c of r.칸) if (cellMap.has(c)) cellMap.get(c).push(entry);
  }
  console.log(`   조인 성공 ${joined} / 시세없음(상폐 등) ${noQuote}`);

  console.log("3) 섹터별 묶기 + 시총 내림차순 정렬...");
  const board = { 대분류: [] };
  let totalEntries = 0;
  for (const maj of sectors.대분류) {
    const subs = [];
    for (const min of maj.소분류) {
      const list = cellMap.get(min.name);
      list.sort((a, b) => b.marketCap - a.marketCap);
      totalEntries += list.length;
      const { avgWeighted, avgSimple, avgCount } = sectorAverages(list);
      subs.push({ name: min.name, count: list.length, avgWeighted, avgSimple, avgCount, stocks: list });
    }
    board.대분류.push({ name: maj.name, 소분류: subs });
  }

  const blob = {
    updatedAt: new Date().toISOString(),
    source: "naver marketValue API",
    units: { marketCap: "원", price: "원", tradingValue: "원", changeRate: "%" },
    totalQuotes: quotes.length,
    joined,
    totalEntries,
    ...board,
  };

  console.log("4) Redis 저장 →", CACHE_KEY);
  await redis.set(CACHE_KEY, blob);
  const sizeKB = (Buffer.byteLength(JSON.stringify(blob)) / 1024).toFixed(0);
  console.log(`   저장 완료 (${sizeKB}KB, 연인원 ${totalEntries})`);

  // 검증 샘플
  const it = board.대분류.find((m) => m.name === "IT");
  const semi = it.소분류.find((s) => s.name === "반도체-메모리");
  console.log("\n검증 — IT>반도체-메모리 시총순 top3:");
  semi.stocks.slice(0, 3).forEach((s) => console.log(`   ${s.name}(${s.code}) 시총 ${(s.marketCap / 1e12).toFixed(1)}조 등락 ${s.changeRate}% 거래대금 ${(s.tradingValue / 1e8).toFixed(0)}억`));
  console.log(`   → 반도체-메모리 시총가중 ${semi.avgWeighted.toFixed(2)}% / 단순평균 ${semi.avgSimple.toFixed(2)}% (계산종목 ${semi.avgCount})`);
  // 평균 붙은 섹터 수 + 샘플 몇 개
  const allSubs = board.대분류.flatMap((m) => m.소분류);
  const withAvg = allSubs.filter((s) => s.avgCount > 0);
  console.log(`\n평균 계산된 섹터: ${withAvg.length}/${allSubs.length}`);
  for (const nm of ["반도체-메모리", "제약-전문의약품", "건설-건축·주택", "의료기기-미용·피부"]) {
    const s = allSubs.find((x) => x.name === nm);
    if (s) console.log(`   ${nm}: 시총가중 ${s.avgWeighted.toFixed(2)}% / 단순 ${s.avgSimple.toFixed(2)}% (${s.avgCount}종목)`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error("실패:", e); process.exit(1); });
