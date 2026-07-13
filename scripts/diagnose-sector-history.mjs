/**
 * 일회성 진단(읽기 전용): 정유 섹터 히스토리 지수 데이터 건전성 검사.
 * v2: ±30% 초과 이상치마다 앞뒤 5거래일 원본(raw close / adjclose / volume / 날짜간격) 출력.
 * - Redis/파일에 아무것도 쓰지 않음. 콘솔 출력만.
 * 사용: node scripts/diagnose-sector-history.mjs
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
const r2 = (n) => Math.round(n * 100) / 100;
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const yahooTicker = (code, market) => `${code}${String(market).toUpperCase().includes("KOSDAQ") ? ".KQ" : ".KS"}`;

async function main() {
  const raw = await redis.get("sector-board:data");
  const board = typeof raw === "string" ? JSON.parse(raw) : raw;
  const sub = board?.대분류?.find((m) => m.name === PARENT)?.소분류?.find((s) => s.name === SECTOR);
  if (!sub) throw new Error(`${PARENT}>${SECTOR} 없음`);
  const stocks = sub.stocks || [];

  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - 5);

  const perStock = new Map(); // code → { name, rows:[{date,rawClose,adjClose,volume}] }
  const reports = [];
  const outliers = []; // {code,name,date,idx,retPct}

  for (const st of stocks) {
    const ticker = yahooTicker(st.code, st.market);
    try {
      const res = await yf.chart(ticker, { period1, interval: "1d" });
      const byDate = new Map();
      for (const q of res.quotes ?? []) {
        if (!q || !q.date) continue;
        const px = q.adjclose ?? q.close;
        if (!Number.isFinite(px) || px <= 0) continue;
        byDate.set(kstDate(new Date(q.date)), { rawClose: q.close ?? null, adjClose: px, volume: q.volume ?? null });
      }
      const dates = [...byDate.keys()].sort();
      if (dates.length < 2) { console.warn(`  ⚠ ${st.code} ${st.name} 봉 부족 — 건너뜀`); continue; }
      const rows = dates.map((d) => ({ date: d, ...byDate.get(d) }));
      perStock.set(st.code, { name: st.name, rows });

      let maxRet = -Infinity, maxDate = "", minRet = Infinity, minDate = "";
      for (let i = 1; i < rows.length; i++) {
        const ret = (rows[i].adjClose / rows[i - 1].adjClose - 1) * 100;
        if (ret > maxRet) { maxRet = ret; maxDate = rows[i].date; }
        if (ret < minRet) { minRet = ret; minDate = rows[i].date; }
        if (Math.abs(ret) > LIMIT_PCT) outliers.push({ code: st.code, name: st.name, date: rows[i].date, idx: i, retPct: ret });
      }
      const cumRet = (rows[rows.length - 1].adjClose / rows[0].adjClose - 1) * 100;
      reports.push({ code: st.code, name: st.name, firstDate: rows[0].date, firstPx: rows[0].adjClose, lastDate: rows[rows.length - 1].date, lastPx: rows[rows.length - 1].adjClose, cumRet, bars: rows.length, maxRet, maxDate, minRet, minDate });
    } catch (e) { console.warn(`  ⚠ ${st.code} ${st.name} fetch 실패 — 건너뜀: ${e.message}`); }
  }

  // ── 2. 종목별 리포트 ──
  console.log("\n================ 종목별 리포트 ================");
  console.log(pad("코드", 8) + pad("종목명", 16) + pad("첫종가(일자)", 24) + pad("끝종가(일자)", 24) + padL("5년누적%", 10) + padL("봉", 6) + padL("최대일변동%(일자)", 22) + padL("최소일변동%(일자)", 22));
  for (const r of reports) console.log(pad(r.code, 8) + pad(r.name, 16) + pad(`${r2(r.firstPx)} (${r.firstDate})`, 24) + pad(`${r2(r.lastPx)} (${r.lastDate})`, 24) + padL(r2(r.cumRet), 10) + padL(r.bars, 6) + padL(`${r2(r.maxRet)} (${r.maxDate})`, 22) + padL(`${r2(r.minRet)} (${r.minDate})`, 22));

  // ── 3. 이상치 + 앞뒤 5거래일 원본 ──
  console.log("\n================ ⚠️ 이상치 (|일별 수익률| > 30%) + 앞뒤 5거래일 원본 ================");
  if (outliers.length === 0) {
    console.log("이상치 0건 — 가격제한폭 위반 없음");
  } else {
    console.log(`가격제한폭(±30%) 위반: ${outliers.length}건\n`);
    for (const o of outliers) {
      const rows = perStock.get(o.code).rows;
      const lo = Math.max(0, o.idx - 5), hi = Math.min(rows.length - 1, o.idx + 5);
      console.log(`── ${o.code} ${o.name} · ${o.date} · 일변동 ${r2(o.retPct)}% ──`);
      console.log("  " + pad("날짜", 13) + padL("간격(일)", 9) + padL("raw close", 14) + padL("adjclose", 14) + padL("volume", 14));
      for (let i = lo; i <= hi; i++) {
        const gap = i > lo ? daysBetween(rows[i - 1].date, rows[i].date) : 0;
        const mark = i === o.idx ? " ★" : "";
        console.log("  " + pad(rows[i].date, 13) + padL(gap || "-", 9) + padL(rows[i].rawClose ?? "-", 14) + padL(r2(rows[i].adjClose), 14) + padL(rows[i].volume ?? "-", 14) + mark);
      }
      console.log("");
    }
    const suspects = [...new Set(outliers.map((o) => `${o.code} ${o.name}`))];
    console.log(`의심 종목: ${suspects.length}개 — ${suspects.join(", ")}`);
  }

  // ── 4. 지수 기여도 ──
  console.log("\n================ 지수 기여도 분석 ================");
  const sorted = [...reports].sort((a, b) => b.cumRet - a.cumRet);
  for (const r of sorted) console.log("  " + pad(r.name, 16) + padL(r2(r.cumRet) + "%", 12));
  const avgBuyHold = reports.reduce((s, r) => s + r.cumRet, 0) / (reports.length || 1);
  const rawHist = await redis.get(`sector-history:${SECTOR}`);
  const hist = typeof rawHist === "string" ? JSON.parse(rawHist) : rawHist;
  const lastIdx = hist?.points?.[hist.points.length - 1];
  const idxRet = lastIdx ? (lastIdx.index / 100 - 1) * 100 : null;
  console.log(`\n(가) 11종목 buy&hold 누적 단순평균 : ${r2(avgBuyHold)}%`);
  console.log(`(나) 저장 지수(daily-rebalance) 최종 : ${lastIdx ? r2(idxRet) + "% (지수 " + lastIdx.index + ", " + lastIdx.date + ")" : "없음"}`);
  if (idxRet !== null && Math.abs(avgBuyHold - idxRet) >= 20) console.log(`⚠️ 경고: 두 값 차이 ${r2(Math.abs(avgBuyHold - idxRet))}%p — 20%p 이상.`);
  else if (idxRet !== null) console.log(`두 값 차이 ${r2(Math.abs(avgBuyHold - idxRet))}%p — 정상 범위(<20%p).`);
  console.log("\n(읽기 전용 진단 — Redis/파일 미변경)");
}

main().catch((e) => { console.error("진단 실패:", e); process.exit(1); });
