/**
 * 일회성 백필: 정유 섹터 5년 히스토리 지수 생성 → Redis sector-history:정유
 *
 * 사용: node scripts/backfill-sector-history.mjs
 * - sector-board:data 의 에너지>정유 stocks에서 종목코드·market 추출
 * - yahoo-finance2 v3 로 5년 일봉(수정주가) 수집
 * - 종목별 일별 수익률 → 그날 데이터 있는 종목만 단순평균 → 섹터 일별 등락률(%)
 * - 첫날 ret=0, index=100. index_t = index_(t-1) × (1 + ret_t/100)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Redis } from "@upstash/redis";
import YahooFinance from "yahoo-finance2";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");

const PARENT = "에너지";
const SECTOR = "정유";

function loadEnv(name) {
  for (const f of [".env.vercel.local", ".env.local", ".env"]) {
    try {
      const m = fs
        .readFileSync(path.join(REPO, f), "utf8")
        .match(new RegExp(`^${name}=(.*)$`, "m"));
      if (m) return m[1].trim().replace(/^["']|["']$/g, "").replace(/\r/g, "");
    } catch {}
  }
  return null;
}

const redis = new Redis({
  url: loadEnv("UPSTASH_REDIS_REST_URL"),
  token: loadEnv("UPSTASH_REDIS_REST_TOKEN"),
});
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

/* Date → KST 기준 YYYY-MM-DD */
const kstFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const kstDate = (d) => kstFmt.format(d);
const round4 = (n) => Math.round(n * 1e4) / 1e4;

function yahooTicker(code, market) {
  const suffix = String(market).toUpperCase().includes("KOSDAQ") ? ".KQ" : ".KS";
  return `${code}${suffix}`;
}

async function main() {
  // 1) sector-board:data 에서 정유 종목
  const raw = await redis.get("sector-board:data");
  const board = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!board || !Array.isArray(board.대분류)) throw new Error("sector-board:data 없음");
  const major = board.대분류.find((m) => m.name === PARENT);
  const sub = major && major.소분류.find((s) => s.name === SECTOR);
  if (!sub) throw new Error(`${PARENT}>${SECTOR} 없음`);
  const stocks = sub.stocks || [];
  console.log(`대상 대분류: ${PARENT} / 소분류: ${SECTOR} / 종목 수: ${stocks.length}`);

  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - 5);

  // 2) 종목별 일별 수익률(%) 수집: Map ticker → Map(date → retPct)
  const perStock = [];
  for (const st of stocks) {
    const ticker = yahooTicker(st.code, st.market);
    try {
      const res = await yf.chart(ticker, { period1, interval: "1d" });
      const quotes = (res.quotes ?? [])
        .filter((q) => q && q.date)
        .map((q) => ({ date: kstDate(new Date(q.date)), px: q.adjclose ?? q.close }))
        .filter((q) => Number.isFinite(q.px) && q.px > 0);
      // 날짜 오름차순, 중복 날짜 마지막값
      const byDate = new Map();
      for (const q of quotes) byDate.set(q.date, q.px);
      const dates = [...byDate.keys()].sort();
      const retMap = new Map();
      for (let i = 1; i < dates.length; i++) {
        const p0 = byDate.get(dates[i - 1]);
        const p1 = byDate.get(dates[i]);
        retMap.set(dates[i], (p1 / p0 - 1) * 100);
      }
      perStock.push({ code: st.code, name: st.name, ticker, bars: dates.length, retMap });
      console.log(`  ✓ ${st.code} ${st.name} (${ticker}) 봉 ${dates.length}개`);
    } catch (e) {
      console.warn(`  ⚠ ${st.code} ${st.name} (${ticker}) fetch 실패 — 건너뜀: ${e.message}`);
    }
  }

  if (perStock.length === 0) throw new Error("수집된 종목 없음");

  // 3) 날짜 union → 그날 데이터 있는 종목만 단순평균
  const dateSet = new Set();
  for (const s of perStock) for (const d of s.retMap.keys()) dateSet.add(d);
  const allDates = [...dateSet].sort();

  const points = [];
  let idx = 100;
  for (let i = 0; i < allDates.length; i++) {
    const d = allDates[i];
    let ret;
    if (i === 0) {
      ret = 0;
    } else {
      const rets = [];
      for (const s of perStock) if (s.retMap.has(d)) rets.push(s.retMap.get(d));
      ret = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
    }
    idx = i === 0 ? 100 : idx * (1 + ret / 100);
    points.push({ date: d, ret: round4(ret), index: round4(idx) });
  }

  const history = {
    sector: SECTOR,
    parent: PARENT,
    method: "simple-average",
    baseDate: points[0]?.date ?? "",
    updatedAt: new Date().toISOString(),
    points,
  };

  await redis.set(`sector-history:${SECTOR}`, history);

  // 4) 출력
  const final = points[points.length - 1];
  console.log("\n===== 백필 결과 =====");
  console.log(`수집 성공 종목: ${perStock.length} / ${stocks.length}`);
  console.log(`총 거래일 수: ${points.length}`);
  console.log(`시작일: ${history.baseDate}  종료일: ${final?.date}`);
  console.log(`최종 지수값: ${final?.index}`);
  console.log(`5년 누적수익률: ${round4((final?.index / 100 - 1) * 100)}%`);
  console.log(`Redis 저장: sector-history:${SECTOR}`);
}

main().catch((e) => {
  console.error("백필 실패:", e);
  process.exit(1);
});
