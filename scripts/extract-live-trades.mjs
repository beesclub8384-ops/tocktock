/**
 * 라이브 가상매매 데이터 추출
 *
 * Redis(virtual-trading:state)에서 실제 매매 기록을 읽어 다음을 출력:
 *  - BUY/SELL 거래 분리, 매수-매도 쌍 FIFO 매칭, 수익률 계산
 *  - 보유 중 포지션
 *  - 요약 통계 (승률, 평균 이익/손실, 손익비)
 *
 * 결과는 data/live-trades-export.json에 저장 (이 파일은 .gitignore 처리됨).
 */

import dotenv from "dotenv";
import { Redis } from "@upstash/redis";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

dotenv.config({ path: ".env.vercel.local" });

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!REDIS_URL || !REDIS_TOKEN) {
  console.error(
    "[error] UPSTASH_REDIS_REST_URL 또는 UPSTASH_REDIS_REST_TOKEN 환경변수가 .env.vercel.local에 없습니다."
  );
  process.exit(1);
}

const redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });

/** YYYYMMDD → YYYY-MM-DD */
function fmtDate(d) {
  if (!d || typeof d !== "string" || d.length !== 8) return d ?? "(?)";
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

/** 두 YYYYMMDD 사이 일수 차이 (단순 일수, 거래일 아님) */
function daysBetween(a, b) {
  if (!a || !b || a.length !== 8 || b.length !== 8) return null;
  const aDate = new Date(`${a.slice(0, 4)}-${a.slice(4, 6)}-${a.slice(6, 8)}`);
  const bDate = new Date(`${b.slice(0, 4)}-${b.slice(4, 6)}-${b.slice(6, 8)}`);
  return Math.round((bDate - aDate) / 86400000);
}

const fmtKRW = (n) => Number(n ?? 0).toLocaleString("ko-KR") + "원";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "..", "data", "live-trades-export.json");

const state = await redis.get("virtual-trading:state");
if (!state) {
  console.error("[error] Redis 키 'virtual-trading:state'에 데이터가 없습니다.");
  process.exit(1);
}

const trades = Array.isArray(state.trades) ? [...state.trades] : [];
const positions = Array.isArray(state.positions) ? state.positions : [];

// 시간순 정렬 (date asc)
trades.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

const buys = trades.filter((t) => t.type === "BUY");
const sells = trades.filter((t) => t.type === "SELL");

// FIFO 매칭: 같은 code의 BUY 큐에 SELL이 들어오면 가장 오래된 BUY와 페어
const buyQueueByCode = new Map();
const completedPairs = [];
for (const t of trades) {
  if (t.type === "BUY") {
    const q = buyQueueByCode.get(t.code) ?? [];
    q.push(t);
    buyQueueByCode.set(t.code, q);
  } else if (t.type === "SELL") {
    const q = buyQueueByCode.get(t.code) ?? [];
    const buy = q.shift();
    if (!buy) {
      // 매칭되는 매수 없음 (이론상 발생 X) — 그래도 기록
      completedPairs.push({
        code: t.code,
        name: t.name,
        market: t.market,
        unmatchedSell: true,
        sellDate: t.date,
        sellPrice: t.price,
        quantity: t.quantity,
        sellAmount: t.amount,
        reason: t.reason ?? "",
      });
      continue;
    }
    const buyAmount = buy.price * buy.quantity;
    const sellAmount = t.price * t.quantity;
    const pnl = sellAmount - buyAmount;
    const pnlRate = ((t.price - buy.price) / buy.price) * 100;
    completedPairs.push({
      code: t.code,
      name: t.name,
      market: buy.market ?? t.market,
      buyDate: buy.date,
      buyPrice: buy.price,
      quantity: buy.quantity,
      buyAmount,
      sellDate: t.date,
      sellPrice: t.price,
      sellAmount,
      holdingDays: daysBetween(buy.date, t.date),
      pnl,
      pnlRate,
      reason: t.reason ?? "",
    });
  }
}

// 매칭되지 않은 BUY (= 현재 보유 중과 정합)
const openBuys = [];
for (const [, q] of buyQueueByCode) {
  for (const b of q) openBuys.push(b);
}

// 데이터 시작/종료일
const allDates = trades.map((t) => t.date).filter(Boolean).sort();
const dataStart = allDates[0] ?? null;
const dataEnd = allDates[allDates.length - 1] ?? null;

// ── 콘솔 출력 ──
console.log("=== 라이브 가상매매 데이터 추출 ===\n");

console.log("[전체 통계]");
console.log(`- 총 매수 건수: ${buys.length}건`);
console.log(`- 총 매도 건수: ${sells.length}건`);
console.log(`- 현재 보유: ${positions.length}종목`);
console.log(`- 초기 자본: ${fmtKRW(state.initialCapital)}`);
console.log(`- 현재 현금: ${fmtKRW(state.cash)}`);
console.log(`- 데이터 시작일: ${fmtDate(dataStart)}`);
console.log(`- 데이터 종료일: ${fmtDate(dataEnd)}`);
console.log();

console.log("[매수-매도 완료된 거래 목록]");
if (completedPairs.length === 0) {
  console.log("(없음)");
} else {
  completedPairs.forEach((p, i) => {
    if (p.unmatchedSell) {
      console.log(
        `#${i + 1} ${p.name} (${p.code}) — 매수 매칭 실패 (SELL only)`
      );
      console.log(
        `   매도: ${fmtDate(p.sellDate)}  ${fmtKRW(p.sellPrice)} × ${p.quantity}주 = ${fmtKRW(p.sellAmount)}`
      );
      if (p.reason) console.log(`   사유: ${p.reason}`);
      return;
    }
    const sign = p.pnlRate >= 0 ? "+" : "";
    console.log(`#${i + 1} ${p.name} (${p.code})`);
    console.log(
      `   매수: ${fmtDate(p.buyDate)}  ${fmtKRW(p.buyPrice)} × ${p.quantity}주 = ${fmtKRW(p.buyAmount)}`
    );
    console.log(
      `   매도: ${fmtDate(p.sellDate)}  ${fmtKRW(p.sellPrice)} × ${p.quantity}주 = ${fmtKRW(p.sellAmount)}`
    );
    console.log(
      `   보유: ${p.holdingDays ?? "?"}일, 수익률 ${sign}${p.pnlRate.toFixed(2)}%, 손익 ${sign}${fmtKRW(p.pnl)}, 사유: ${p.reason || "(없음)"}`
    );
  });
}
console.log();

console.log("[현재 보유 중]");
if (positions.length === 0) {
  console.log("(없음)");
} else {
  positions.forEach((pos, i) => {
    console.log(`#${i + 1} ${pos.name} (${pos.code})`);
    console.log(
      `   매수: ${fmtDate(pos.buyDate)}  ${fmtKRW(pos.buyPrice)} × ${pos.quantity}주 = ${fmtKRW(pos.buyPrice * pos.quantity)}`
    );
    console.log(
      `   현재 미실현 (highestHigh ${fmtKRW(pos.highestHigh)}, trailingStop ${fmtKRW(pos.trailingStopPrice)}, absoluteStop ${fmtKRW(pos.absoluteStopPrice)})`
    );
  });
}
console.log();

// 요약 통계 (완결 거래만)
const validPairs = completedPairs.filter((p) => !p.unmatchedSell);
const wins = validPairs.filter((p) => p.pnlRate > 0);
const losses = validPairs.filter((p) => p.pnlRate <= 0);
const totalRet = validPairs.reduce((s, p) => s + p.pnlRate, 0);
const avgRet = validPairs.length > 0 ? totalRet / validPairs.length : 0;
const totalWin = wins.reduce((s, p) => s + p.pnlRate, 0);
const totalLoss = Math.abs(losses.reduce((s, p) => s + p.pnlRate, 0));
const avgWin = wins.length > 0 ? totalWin / wins.length : 0;
const avgLoss = losses.length > 0 ? -(totalLoss / losses.length) : 0;
const profitFactor = totalLoss > 0 ? totalWin / totalLoss : null;
const winRate =
  validPairs.length > 0 ? (wins.length / validPairs.length) * 100 : 0;

console.log("[요약 통계]");
console.log(
  `- 완결된 거래 ${validPairs.length}건 평균 수익률: ${avgRet >= 0 ? "+" : ""}${avgRet.toFixed(2)}%`
);
console.log(
  `- 승률: ${wins.length}/${validPairs.length}건 (${winRate.toFixed(1)}%)`
);
console.log(`- 평균 이익(수익 거래): +${avgWin.toFixed(2)}%`);
console.log(`- 평균 손실(손실 거래): ${avgLoss.toFixed(2)}%`);
console.log(
  `- 손익비: ${profitFactor === null ? "INF (무손실)" : profitFactor.toFixed(2)}`
);

// JSON 저장
mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(
  OUTPUT_PATH,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      summary: {
        totalBuys: buys.length,
        totalSells: sells.length,
        openPositions: positions.length,
        initialCapital: state.initialCapital,
        cash: state.cash,
        dataStart,
        dataEnd,
        completedTrades: validPairs.length,
        winCount: wins.length,
        lossCount: losses.length,
        winRate,
        avgReturnPct: avgRet,
        avgWinPct: avgWin,
        avgLossPct: avgLoss,
        profitFactor,
      },
      completedPairs,
      openPositions: positions,
      openBuys,
    },
    null,
    2
  )
);
console.log(`\n[저장] ${OUTPUT_PATH} (.gitignore 처리됨)`);
