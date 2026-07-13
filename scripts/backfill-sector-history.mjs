/**
 * 일회성 백필 v2: 정유 섹터 5년 히스토리 지수 재구축 → Redis sector-history:정유
 *
 * v2 규칙:
 *  (1) 우선주 제외 — 종목코드 끝자리 != '0'
 *  (2) 거래정지 구간 제외 — adjclose가 5거래일 이상 연속 동일한 구간 + 재개 첫 거래일
 *  (3) ±30% 초과 일별수익률 제외 (클리핑 아님, 그 종목·그날만 평균에서 제거)
 *  (4) 섹터 일별 등락률 = 살아있는 종목들만의 단순평균. 살아있는 종목 <2면 ret=0 + 경고
 *
 * 사용: node scripts/backfill-sector-history.mjs
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
const LIMIT_PCT = 30;
const HALT_MIN = 5; // 5거래일 이상 연속 동일가 → 거래정지 추정

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

const kstFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
const kstDate = (d) => kstFmt.format(d);
const kstTimeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
const kstHourFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", hour12: false });
const kstHour = (d) => { const n = parseInt(kstHourFmt.format(d), 10); return n === 24 ? 0 : n; };
const round4 = (n) => Math.round(n * 1e4) / 1e4;
const yahooTicker = (code, market) => `${code}${String(market).toUpperCase().includes("KOSDAQ") ? ".KQ" : ".KS"}`;

async function main() {
  const raw = await redis.get("sector-board:data");
  const board = typeof raw === "string" ? JSON.parse(raw) : raw;
  const sub = board?.대분류?.find((m) => m.name === PARENT)?.소분류?.find((s) => s.name === SECTOR);
  if (!sub) throw new Error(`${PARENT}>${SECTOR} 없음`);
  const allStocks = sub.stocks || [];

  // (1) 우선주 제외
  const preferred = allStocks.filter((s) => s.code[5] !== "0");
  const common = allStocks.filter((s) => s.code[5] === "0");
  console.log(`최초 종목 수: ${allStocks.length}`);
  console.log(`우선주 제외: ${preferred.length}개`);
  for (const s of preferred) console.log(`  - ${s.code} ${s.name} (사유: 우선주, 끝자리 ${s.code[5]})`);
  console.log(`지수 대상(보통주): ${common.length}개 — ${common.map((s) => s.name).join(", ")}`);

  // 미완성 봉 제외: KST 16:00 이전이면 오늘 봉은 장 마감(15:30) 전이라 미완성 → 제외 (cron 가드 B와 동일 기준)
  const now = new Date();
  const todayKST = kstDate(now);
  const excludeToday = kstHour(now) < 16;
  console.log(`현재 KST ${kstTimeFmt.format(now)} → 오늘(${todayKST}) 봉 ${excludeToday ? "제외함 (장 마감 전, 미완성)" : "포함함 (종가 확정)"}`);

  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - 5);

  const excludeCounts = { halt: 0, limit: 0 };
  const haltRanges = []; // {name, from, to, excludedDays}
  const limitExcluded = []; // {name, date, ret}
  const perStock = [];

  for (const st of common) {
    const ticker = yahooTicker(st.code, st.market);
    try {
      const res = await yf.chart(ticker, { period1, interval: "1d" });
      const byDate = new Map();
      for (const q of res.quotes ?? []) {
        if (!q || !q.date) continue;
        const px = q.adjclose ?? q.close;
        if (!Number.isFinite(px) || px <= 0) continue;
        const d = kstDate(new Date(q.date));
        if (excludeToday && d === todayKST) continue; // 오늘 미완성 봉 제외
        byDate.set(d, px);
      }
      const dates = [...byDate.keys()].sort();
      if (dates.length < 2) { console.warn(`  ⚠ ${st.code} ${st.name} 봉 부족 — 건너뜀`); continue; }
      const px = dates.map((d) => byDate.get(d));

      const excluded = new Set();

      // (2) 거래정지 구간: 동일가 5거래일 이상 연속 → 구간 + 재개일 제외
      let i = 0;
      while (i < dates.length) {
        let j = i;
        while (j + 1 < dates.length && px[j + 1] === px[i]) j++;
        const runLen = j - i + 1;
        if (runLen >= HALT_MIN) {
          for (let k = i; k <= j; k++) excluded.add(dates[k]);
          let reopenDays = 0;
          if (j + 1 < dates.length) { excluded.add(dates[j + 1]); reopenDays = 1; }
          const excludedDays = runLen + reopenDays;
          excludeCounts.halt += excludedDays;
          haltRanges.push({ name: st.name, from: dates[i], to: dates[j], reopen: j + 1 < dates.length ? dates[j + 1] : "-", excludedDays });
        }
        i = j + 1;
      }

      // 일별 수익률(%) + (3) ±30% 초과 제외
      const retMap = new Map();
      for (let k = 1; k < dates.length; k++) {
        const ret = (px[k] / px[k - 1] - 1) * 100;
        if (Math.abs(ret) > LIMIT_PCT) {
          excluded.add(dates[k]);
          excludeCounts.limit++;
          limitExcluded.push({ name: st.name, date: dates[k], ret: round4(ret) });
          continue; // ±30% 초과일은 retMap에 넣지 않음(평균에서 제외)
        }
        retMap.set(dates[k], ret);
      }
      // 거래정지/재개로 제외된 날짜의 수익률도 제거
      for (const d of excluded) retMap.delete(d);

      perStock.push({ code: st.code, name: st.name, bars: dates.length, retMap });
      console.log(`  ✓ ${st.code} ${st.name} (${ticker}) 봉 ${dates.length}, 유효수익률 ${retMap.size}일`);
    } catch (e) { console.warn(`  ⚠ ${st.code} ${st.name} fetch 실패 — 건너뜀: ${e.message}`); }
  }
  if (perStock.length === 0) throw new Error("수집된 종목 없음");

  // (4) 날짜 union → 살아있는 종목 단순평균
  const dateSet = new Set();
  for (const s of perStock) for (const d of s.retMap.keys()) dateSet.add(d);
  const allDates = [...dateSet].sort();

  let thinDays = 0;
  const points = [];
  let idx = 100;
  for (let n = 0; n < allDates.length; n++) {
    const d = allDates[n];
    let ret;
    if (n === 0) {
      ret = 0;
    } else {
      const rets = [];
      for (const s of perStock) if (s.retMap.has(d)) rets.push(s.retMap.get(d));
      if (rets.length < 2) { ret = 0; thinDays++; console.warn(`  ⚠ ${d}: 살아있는 종목 ${rets.length}개(<2) → ret=0`); }
      else ret = rets.reduce((a, b) => a + b, 0) / rets.length;
    }
    idx = n === 0 ? 100 : idx * (1 + ret / 100);
    points.push({ date: d, ret: round4(ret), index: round4(idx) });
  }

  const history = {
    sector: SECTOR,
    parent: PARENT,
    method: "simple-average-v2(우선주제외/거래정지제외/±30%초과제외)",
    baseDate: points[0]?.date ?? "",
    updatedAt: new Date().toISOString(),
    constituents: perStock.length,
    points,
  };
  await redis.set(`sector-history:${SECTOR}`, history);

  // (5) 최종 출력
  console.log("\n================ 제외 내역 ================");
  console.log(`거래정지 추정 구간: ${haltRanges.length}건 (제외 ${excludeCounts.halt} 종목·날짜)`);
  for (const h of haltRanges) console.log(`  ${h.name}: ${h.from}~${h.to} 재개 ${h.reopen} (제외 ${h.excludedDays}일)`);
  console.log(`±30% 초과 제외: ${excludeCounts.limit}건`);
  for (const l of limitExcluded) console.log(`  ${l.name} ${l.date} 원래수익률 ${l.ret}% → 제외됨`);
  console.log(`총 제외 (종목×날짜): ${excludeCounts.halt + excludeCounts.limit}건 | 살아있는종목<2 날: ${thinDays}일`);

  const final = points[points.length - 1];
  const v2Ret = round4((final.index / 100 - 1) * 100);
  console.log("\n================ v2 백필 결과 ================");
  console.log(`총 거래일 수: ${points.length}`);
  console.log(`시작일: ${history.baseDate}  종료일: ${final.date}`);
  console.log(`최종 지수값: ${final.index}`);
  console.log(`5년 누적수익률: ${v2Ret}%`);
  console.log("\n--- v1 vs v2 ---");
  console.log(`v1: 지수 98.6068 / -1.39%  (우선주 포함, 이상치 미제거)`);
  console.log(`v2: 지수 ${final.index} / ${v2Ret}%  (우선주/거래정지/±30% 제외)`);
  console.log(`Redis 저장: sector-history:${SECTOR} (method=${history.method})`);
}

main().catch((e) => { console.error("백필 실패:", e); process.exit(1); });
