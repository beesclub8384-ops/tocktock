/**
 * 트레일링 스탑 매매 전략 시뮬레이션
 *
 * 182건 필터링 케이스에서:
 * - 진입: D+3 시가 매수
 * - 매도 조건 (먼저 충족되는 것):
 *   1. 트레일링 스탑: 보유 중 최고 고가 대비 X% 하락 시
 *   2. 절대 손절: 매수가 대비 -7% 도달 시
 *   3. 최대 보유기간 도달 시 종가로 강제 청산
 *
 * 트레일링 스탑 폭: -3%, -5%, -7%
 * 최대 보유기간: 7일, 10일, 13일
 * → 9가지 조합
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ANALYSIS_PATH = join(__dirname, "..", "data", "krx-history", "institutional-entry-analysis.json");
const KRX_PATH = join(__dirname, "..", "data", "krx-history", "krx-daily-all.json");

const TRAILING_STOPS = [-3, -5, -7];
const MAX_HOLD_DAYS = [7, 10, 13];
const ABS_STOP = -7; // 절대 손절 -7%

console.log("=== 트레일링 스탑 매매 전략 시뮬레이션 ===\n");

console.log("[1/3] 데이터 로딩...");
const analysis = JSON.parse(readFileSync(ANALYSIS_PATH, "utf-8"));
const krxData = JSON.parse(readFileSync(KRX_PATH, "utf-8"));

// 종목별 일별 거래대금 맵
const tvMap = new Map();
for (const stock of krxData.stocks) {
  for (const d of stock.daily) {
    tvMap.set(`${stock.code}:${d.date}`, d.tradingValue);
  }
}

// 필터: 182건
console.log("[2/3] 필터 적용 중...");
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
console.log(`  전체: ${analysis.totalCases}건 → 필터 후: ${filtered.length}건\n`);

// 시뮬레이션
console.log("[3/3] 전략 시뮬레이션 중...\n");

const allResults = [];

for (const trailingPct of TRAILING_STOPS) {
  for (const maxDays of MAX_HOLD_DAYS) {
    const trades = [];

    for (const ev of filtered) {
      const d3 = ev.postExplosion.find((p) => p.day === 3);
      if (!d3) continue;

      const buyBasePct = d3.open; // D+1 종가 대비 매수가(%)
      if (buyBasePct <= -99) continue;

      const buyFactor = 1 + buyBasePct / 100; // 매수가 / D+1종가

      // 절대 손절선 (D+1종가 대비 %)
      const absStopBasePct = (buyFactor * (1 + ABS_STOP / 100) - 1) * 100;

      // D+3 당일부터 최대 보유기간까지 순회
      // maxDays=7이면 D+3~D+9 (7거래일 보유), 강제청산은 D+3+(maxDays-1) = D+2+maxDays
      const lastDay = 2 + maxDays; // D+2+maxDays = 최대 보유 마지막 날
      // D+3 = day3, 보유 7일이면 day3~day9

      let peakHighBasePct = d3.high; // 보유 중 최고 고가 (D+1종가 대비 %)
      let exitReturnPct = null;
      let exitType = null;
      let exitDay = null;

      for (let day = 3; day <= Math.min(lastDay, 16); day++) {
        const dd = ev.postExplosion.find((p) => p.day === day);
        if (!dd) break;

        // 1. 절대 손절 체크 (저가 기준)
        if (dd.low <= absStopBasePct) {
          exitReturnPct = ABS_STOP;
          exitType = "abs_stop";
          exitDay = day;
          break;
        }

        // 2. 트레일링 스탑 체크
        // 현재까지 최고 고가 대비 trailingPct% 하락 지점
        // 단, D+3 당일은 매수 직후이므로 고가 갱신 후 체크
        if (day === 3) {
          peakHighBasePct = dd.high;
        }

        const peakFactor = 1 + peakHighBasePct / 100;
        const trailStopBasePct = (peakFactor * (1 + trailingPct / 100) - 1) * 100;

        if (dd.low <= trailStopBasePct) {
          // 트레일링 스탑 발동 — 매도가는 트레일링 스탑 가격
          // 수익률 = (stopPrice / buyPrice - 1) * 100
          const stopFactor = peakFactor * (1 + trailingPct / 100);
          exitReturnPct = (stopFactor / buyFactor - 1) * 100;
          exitType = "trailing";
          exitDay = day;
          break;
        }

        // 고가 갱신 (다음 날 체크를 위해)
        if (day > 3 && dd.high > peakHighBasePct) {
          peakHighBasePct = dd.high;
        }
      }

      // 미체결 → 강제청산
      if (exitType === null) {
        const forceDay = Math.min(lastDay, 16);
        const dd = ev.postExplosion.find((p) => p.day === forceDay);
        if (dd) {
          exitReturnPct = ((1 + dd.close / 100) / buyFactor - 1) * 100;
          exitType = "forced";
          exitDay = forceDay;
        } else {
          // 데이터 부족 — 마지막 가용 데이터로 청산
          const lastAvail = ev.postExplosion.filter((p) => p.day >= 3).pop();
          if (lastAvail) {
            exitReturnPct = ((1 + lastAvail.close / 100) / buyFactor - 1) * 100;
            exitType = "forced";
            exitDay = lastAvail.day;
          } else {
            continue;
          }
        }
      }

      trades.push({ exitReturnPct, exitType, exitDay });
    }

    // 통계
    const n = trades.length;
    const wins = trades.filter((t) => t.exitReturnPct > 0);
    const losses = trades.filter((t) => t.exitReturnPct <= 0);
    const winRate = (wins.length / n * 100).toFixed(1);

    const totalReturn = trades.reduce((s, t) => s + t.exitReturnPct, 0);
    const avgReturn = (totalReturn / n).toFixed(2);
    const avgWin = wins.length > 0
      ? (wins.reduce((s, t) => s + t.exitReturnPct, 0) / wins.length).toFixed(2)
      : "0.00";
    const avgLoss = losses.length > 0
      ? (losses.reduce((s, t) => s + t.exitReturnPct, 0) / losses.length).toFixed(2)
      : "0.00";

    const totalWin = wins.reduce((s, t) => s + t.exitReturnPct, 0);
    const totalLoss = Math.abs(losses.reduce((s, t) => s + t.exitReturnPct, 0));
    const profitFactor = totalLoss > 0 ? (totalWin / totalLoss).toFixed(2) : "INF";

    const trailingHits = trades.filter((t) => t.exitType === "trailing").length;
    const absStopHits = trades.filter((t) => t.exitType === "abs_stop").length;
    const forcedHits = trades.filter((t) => t.exitType === "forced").length;

    allResults.push({
      trailingPct,
      maxDays,
      n,
      winRate: +winRate,
      totalReturn: +totalReturn.toFixed(2),
      avgReturn: +avgReturn,
      avgWin: +avgWin,
      avgLoss: +avgLoss,
      profitFactor: profitFactor === "INF" ? 999 : +profitFactor,
      profitFactorStr: profitFactor,
      trailingHits,
      absStopHits,
      forcedHits,
      wins: wins.length,
      losses: losses.length,
    });
  }
}

// 결과 출력
console.log("=" .repeat(120));
console.log(
  "트레일링 | 최대보유 | 대상 | 승률     | 총수익률    | 평균수익률 | 평균이익  | 평균손실   | 손익비 | 트레일 | 절대손절 | 강제청산"
);
console.log("=" .repeat(120));

for (const r of allResults) {
  const trail = `${r.trailingPct}%`.padStart(5);
  const hold = `${r.maxDays}일`.padStart(4);
  const cnt = String(r.n).padStart(4);
  const wr = `${r.winRate}%`.padStart(6);
  const tr = `${r.totalReturn >= 0 ? "+" : ""}${r.totalReturn.toFixed(1)}%`.padStart(9);
  const ar = `${r.avgReturn >= 0 ? "+" : ""}${r.avgReturn.toFixed(2)}%`.padStart(8);
  const aw = `+${r.avgWin}%`.padStart(8);
  const al = `${r.avgLoss}%`.padStart(8);
  const pf = r.profitFactorStr.padStart(5);

  console.log(
    `  ${trail}  |  ${hold}   | ${cnt} | ${wr}   | ${tr}   | ${ar}   | ${aw}  | ${al}   | ${pf}  |  ${String(r.trailingHits).padStart(3)}   |   ${String(r.absStopHits).padStart(3)}    |   ${String(r.forcedHits).padStart(3)}`
  );
}

console.log("=" .repeat(120));

// 베스트 3 추천
console.log("\n--- 추천 TOP 3 (손익비 기준) ---\n");
const ranked = [...allResults].sort((a, b) => {
  // 1차: 손익비, 2차: 총수익률, 3차: 승률
  if (b.profitFactor !== a.profitFactor) return b.profitFactor - a.profitFactor;
  if (b.totalReturn !== a.totalReturn) return b.totalReturn - a.totalReturn;
  return b.winRate - a.winRate;
});

for (let i = 0; i < 3; i++) {
  const r = ranked[i];
  console.log(`#${i + 1}: 트레일링 ${r.trailingPct}% / 최대보유 ${r.maxDays}일`);
  console.log(`    승률 ${r.winRate}% | 총수익률 ${r.totalReturn >= 0 ? "+" : ""}${r.totalReturn.toFixed(1)}% | 평균 ${r.avgReturn >= 0 ? "+" : ""}${r.avgReturn.toFixed(2)}% | 손익비 ${r.profitFactorStr}`);
  console.log(`    평균이익 +${r.avgWin}% | 평균손실 ${r.avgLoss}% | (${r.wins}승 ${r.losses}패)`);
  console.log();
}

// 추가: 총수익률 기준 베스트 3
console.log("--- 추천 TOP 3 (총수익률 기준) ---\n");
const rankedByReturn = [...allResults].sort((a, b) => b.totalReturn - a.totalReturn);

for (let i = 0; i < 3; i++) {
  const r = rankedByReturn[i];
  console.log(`#${i + 1}: 트레일링 ${r.trailingPct}% / 최대보유 ${r.maxDays}일`);
  console.log(`    승률 ${r.winRate}% | 총수익률 ${r.totalReturn >= 0 ? "+" : ""}${r.totalReturn.toFixed(1)}% | 평균 ${r.avgReturn >= 0 ? "+" : ""}${r.avgReturn.toFixed(2)}% | 손익비 ${r.profitFactorStr}`);
  console.log(`    평균이익 +${r.avgWin}% | 평균손실 ${r.avgLoss}% | (${r.wins}승 ${r.losses}패)`);
  console.log();
}
