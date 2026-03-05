/**
 * 트레일링 스탑 전략 — 수수료 + 슬리피지 반영
 *
 * 전략: 트레일링 -3% + 절대손절 -7% + D+3 시가 매수
 * 비용: 매수/매도 각각 (수수료 + 슬리피지) 왕복 적용
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ANALYSIS_PATH = join(__dirname, "..", "data", "krx-history", "institutional-entry-analysis.json");
const KRX_PATH = join(__dirname, "..", "data", "krx-history", "krx-daily-all.json");

const TRAILING_PCT = -3;
const ABS_STOP = -7;

const SCENARIOS = [
  { name: "낙관적", fee: 0.015, slip: 0.1 },
  { name: "현실적", fee: 0.015, slip: 0.3 },
  { name: "보수적", fee: 0.015, slip: 0.5 },
];

console.log("=== 수수료 + 슬리피지 반영 시뮬레이션 ===\n");

const analysis = JSON.parse(readFileSync(ANALYSIS_PATH, "utf-8"));
const krxData = JSON.parse(readFileSync(KRX_PATH, "utf-8"));

const tvMap = new Map();
for (const stock of krxData.stocks) {
  for (const d of stock.daily) {
    tvMap.set(`${stock.code}:${d.date}`, d.tradingValue);
  }
}

// 필터
const filtered = analysis.events.filter((ev) => {
  if (ev.dDayChangeRate < 10 || ev.dDayChangeRate > 20) return false;
  if (ev.dDayTradingValue >= 500_000_000_000) return false;
  const d2 = ev.postExplosion.find((p) => p.day === 2);
  if (!d2 || d2.close <= 0) return false;
  if (!d2.date) return false;
  const d2tv = tvMap.get(`${ev.code}:${d2.date}`);
  if (!d2tv || d2tv < 30_000_000_000) return false;
  return true;
});

// 먼저 비용 없는 raw 수익률 계산
const rawReturns = [];

for (const ev of filtered) {
  const d3 = ev.postExplosion.find((p) => p.day === 3);
  if (!d3) continue;

  const buyBasePct = d3.open;
  if (buyBasePct <= -99) continue;
  const buyFactor = 1 + buyBasePct / 100;
  const absStopBasePct = (buyFactor * (1 + ABS_STOP / 100) - 1) * 100;

  let peakHighBasePct = d3.high;
  let exitReturnPct = null;
  let exitType = null;

  for (let day = 3; day <= 16; day++) {
    const dd = ev.postExplosion.find((p) => p.day === day);
    if (!dd) break;

    if (dd.low <= absStopBasePct) {
      exitReturnPct = ABS_STOP;
      exitType = "abs_stop";
      break;
    }

    if (day === 3) peakHighBasePct = dd.high;
    const peakFactor = 1 + peakHighBasePct / 100;
    const trailStopBasePct = (peakFactor * (1 + TRAILING_PCT / 100) - 1) * 100;

    if (dd.low <= trailStopBasePct) {
      const stopFactor = peakFactor * (1 + TRAILING_PCT / 100);
      exitReturnPct = (stopFactor / buyFactor - 1) * 100;
      exitType = "trailing";
      break;
    }

    if (day > 3 && dd.high > peakHighBasePct) {
      peakHighBasePct = dd.high;
    }
  }

  if (exitType === null) {
    const d16 = ev.postExplosion.find((p) => p.day === 16);
    if (d16) {
      exitReturnPct = ((1 + d16.close / 100) / buyFactor - 1) * 100;
      exitType = "forced";
    } else continue;
  }

  rawReturns.push(exitReturnPct);
}

console.log(`대상: ${rawReturns.length}건\n`);

// 비용 없는 원본
function calcStats(returns) {
  const n = returns.length;
  const wins = returns.filter((r) => r > 0);
  const losses = returns.filter((r) => r <= 0);
  const totalReturn = returns.reduce((s, r) => s + r, 0);
  const avgReturn = totalReturn / n;
  const avgWin = wins.length > 0 ? wins.reduce((s, r) => s + r, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, r) => s + r, 0) / losses.length : 0;
  const totalWin = wins.reduce((s, r) => s + r, 0);
  const totalLoss = Math.abs(losses.reduce((s, r) => s + r, 0));
  const pf = totalLoss > 0 ? totalWin / totalLoss : 999;
  return { n, wins: wins.length, losses: losses.length, totalReturn, avgReturn, avgWin, avgLoss, pf };
}

// 비용 적용: 매수 시 슬리피지+수수료로 실질 매수가 올라감, 매도 시 실질 매도가 내려감
// 실질 수익률 = (1 + rawReturn/100) * (1 - sellCost) / (1 + buyCost) - 1
// buyCost = fee + slip, sellCost = fee + slip (각각 %)

console.log("━".repeat(90));
console.log(
  "시나리오     | 수수료  | 슬리피지 | 왕복비용  | 총수익률    | 평균수익률 | 승률    | 손익비"
);
console.log("━".repeat(90));

// 원본 (비용 없음)
const raw = calcStats(rawReturns);
console.log(
  `비용 없음    |   -     |    -     |    -      | ${fmt(raw.totalReturn)}% | ${fmt(raw.avgReturn)}%  | ${(raw.wins / raw.n * 100).toFixed(1)}%  | ${raw.pf.toFixed(2)}`
);

for (const sc of SCENARIOS) {
  const buyCost = (sc.fee + sc.slip) / 100;
  const sellCost = (sc.fee + sc.slip) / 100;
  const roundTripPct = ((sc.fee + sc.slip) * 2).toFixed(3);

  const adjusted = rawReturns.map((r) => {
    const grossFactor = 1 + r / 100;
    const netFactor = grossFactor * (1 - sellCost) / (1 + buyCost);
    return (netFactor - 1) * 100;
  });

  const s = calcStats(adjusted);
  console.log(
    `${sc.name.padEnd(8)}     | ${sc.fee}%  |  ${sc.slip}%   | ${roundTripPct}%   | ${fmt(s.totalReturn)}% | ${fmt(s.avgReturn)}%  | ${(s.wins / s.n * 100).toFixed(1)}%  | ${s.pf.toFixed(2)}`
  );
}

console.log("━".repeat(90));

// 상세 비교
console.log("\n━━━ 상세 비교 ━━━\n");

for (const sc of SCENARIOS) {
  const buyCost = (sc.fee + sc.slip) / 100;
  const sellCost = (sc.fee + sc.slip) / 100;

  const adjusted = rawReturns.map((r) => {
    const grossFactor = 1 + r / 100;
    const netFactor = grossFactor * (1 - sellCost) / (1 + buyCost);
    return (netFactor - 1) * 100;
  });

  const s = calcStats(adjusted);

  console.log(`[${sc.name}] 수수료 ${sc.fee}% + 슬리피지 ${sc.slip}% (왕복 ${((sc.fee + sc.slip) * 2).toFixed(3)}%)`);
  console.log(`  승률: ${(s.wins / s.n * 100).toFixed(1)}% (${s.wins}승 / ${s.losses}패)`);
  console.log(`  총 수익률: ${fmt(s.totalReturn)}%`);
  console.log(`  평균 수익률: ${fmt(s.avgReturn)}%`);
  console.log(`  평균 이익: +${s.avgWin.toFixed(2)}% | 평균 손실: ${s.avgLoss.toFixed(2)}%`);
  console.log(`  손익비: ${s.pf.toFixed(2)}`);
  console.log(`  비용 차감액: ${fmt(raw.totalReturn - s.totalReturn)}% (건당 ${((raw.totalReturn - s.totalReturn) / s.n).toFixed(2)}%)`);
  console.log();
}

function fmt(v) {
  return (v >= 0 ? "+" : "") + v.toFixed(1);
}
