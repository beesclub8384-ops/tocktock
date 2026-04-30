/**
 * 보수적 가정 트레일링 스탑 백테스트 (institutional-entry-analysis.json 신규 형식 대응)
 *
 * 4가지 보정을 단계적으로 누적 적용:
 *  - 단계 0: 보정 없음 (원본 로직 — 절대가 기반)
 *  - 단계 1: + 매수 슬리피지     (N(2%, 1%), max 0)
 *  - 단계 2: + 매도 슬리피지     (N(1.5%, 0.7%), max 0; 갭다운 손절 제외)
 *  - 단계 3: + 갭다운 손절       (시가가 -7% 아래면 시가에 매도 → -7%보다 큰 손실 가능)
 *  - 단계 4: + 거래정지/VI       (5% 확률, exitReturnPct -1.0%p)
 *
 * 데이터 형식:
 *  - krx-daily-all.json: { "YYYYMMDD": { kospi: [{code,trdval,...}], kosdaq: [...] } }
 *  - institutional-entry-analysis.json: { events: [{code,dDate,dDay:{...},tracking:[{day,date,open,high,low,close,...}]}] }
 *  - tracking[].day = N → D+N 거래일. day=3 = D+3 시가 매수일.
 *
 * 필터(기존과 동일 의도):
 *  - dDay.chgRate ∈ [10, 20]
 *  - dDay.trdval < 5000억
 *  - tracking에 day=2 존재 + close>0 + trdval ≥ 300억
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ANALYSIS_PATH = join(__dirname, "..", "data", "krx-history", "institutional-entry-analysis.json");
const KRX_PATH = join(__dirname, "..", "data", "krx-history", "krx-daily-all.json");

const TRAILING_STOPS = [-3, -5, -7];
const MAX_HOLD_DAYS = [7, 10, 13];
const ABS_STOP = -7;
const STAGES = [0, 1, 2, 3, 4];
const RUNS_PER_COMBO = 30;

// ── 정규분포 샘플 (Box-Muller) ──
function sampleNormal(mean, std) {
  const u = Math.random() || 1e-9;
  const v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + std * z;
}
const sampleBuySlip = () => Math.max(0, sampleNormal(0.02, 0.01));
const sampleSellSlip = () => Math.max(0, sampleNormal(0.015, 0.007));

// ── 데이터 로딩 ──
console.log("=== 보수적 가정 백테스트 (단계별 슬리피지/갭다운/거래정지 보정) ===\n");
console.log("[1/3] 데이터 로딩...");
const analysis = JSON.parse(readFileSync(ANALYSIS_PATH, "utf-8"));
const krxData = JSON.parse(readFileSync(KRX_PATH, "utf-8"));

const tvMap = new Map();
for (const [date, dayData] of Object.entries(krxData)) {
  for (const market of ["kospi", "kosdaq"]) {
    const stocks = dayData?.[market];
    if (!Array.isArray(stocks)) continue;
    for (const s of stocks) {
      if (s?.code && typeof s.trdval === "number") {
        tvMap.set(`${s.code}:${date}`, s.trdval);
      }
    }
  }
}

console.log("[2/3] 필터 적용 중...");
const filtered = analysis.events.filter((ev) => {
  if (!ev.dDay || typeof ev.dDay.chgRate !== "number") return false;
  if (ev.dDay.chgRate < 10 || ev.dDay.chgRate > 20) return false;
  if (ev.dDay.trdval >= 500_000_000_000) return false;
  if (!Array.isArray(ev.tracking)) return false;
  const d2 = ev.tracking.find((p) => p.day === 2);
  if (!d2 || !d2.close || d2.close <= 0 || !d2.date) return false;
  const d2tv = tvMap.get(`${ev.code}:${d2.date}`);
  if (!d2tv || d2tv < 30_000_000_000) return false;
  return true;
});
console.log(`  전체: ${analysis.events.length}건 → 필터 후: ${filtered.length}건\n`);

console.log(
  `[3/3] 시뮬레이션 시작 — ${STAGES.length}단계 × 9조합 × ${RUNS_PER_COMBO}회 = ${STAGES.length * TRAILING_STOPS.length * MAX_HOLD_DAYS.length * RUNS_PER_COMBO}회 패스\n`
);

/**
 * 1회 시뮬레이션 — 단계(stage)에 따라 보정 적용 후 trades 배열 반환
 * 모든 가격은 절대가(KRW). 수익률은 (exitPrice/buyPrice - 1) × 100.
 */
function simulateOnce(stage, trailingPct, maxDays) {
  const trades = [];

  for (const ev of filtered) {
    const d3 = ev.tracking.find((p) => p.day === 3);
    if (!d3 || !d3.open || d3.open <= 0) continue;

    let buyPrice = d3.open;

    // 보정 1: 매수 슬리피지 — 더 비싸게 매수
    if (stage >= 1) {
      buyPrice *= 1 + sampleBuySlip();
    }

    const absStopPrice = buyPrice * (1 + ABS_STOP / 100);
    const lastDay = 2 + maxDays;

    let peakHigh = d3.high && d3.high > 0 ? d3.high : buyPrice;
    let exitPrice = null;
    let exitType = null;
    let exitDay = null;
    let applySellSlip = false;

    for (let day = 3; day <= Math.min(lastDay, 16); day++) {
      const dd = ev.tracking.find((p) => p.day === day);
      if (!dd || !dd.open || dd.open <= 0) break;

      // 1. 손절 체크
      if (stage >= 3) {
        // 보정 3: 시가가 손절가 미만 → 갭다운, 시가에 매도 (-7%보다 큰 손실 가능)
        if (dd.open <= absStopPrice) {
          exitPrice = dd.open;
          exitType = "gap_down_stop";
          exitDay = day;
          applySellSlip = false;
          break;
        }
        // 시가는 위지만 장중 -7% 도달 → 손절가에 매도
        if (dd.low <= absStopPrice) {
          exitPrice = absStopPrice;
          exitType = "abs_stop";
          exitDay = day;
          applySellSlip = true;
          break;
        }
      } else {
        // 원본 로직: 장중 -7% 도달 시 손절가에 매도
        if (dd.low <= absStopPrice) {
          exitPrice = absStopPrice;
          exitType = "abs_stop";
          exitDay = day;
          applySellSlip = true;
          break;
        }
      }

      // 2. 트레일링 스탑 체크
      if (day === 3) {
        peakHigh = dd.high;
      }

      const trailStopPrice = peakHigh * (1 + trailingPct / 100);

      if (dd.low <= trailStopPrice) {
        exitPrice = trailStopPrice;
        exitType = "trailing";
        exitDay = day;
        applySellSlip = true;
        break;
      }

      if (day > 3 && dd.high > peakHigh) {
        peakHigh = dd.high;
      }
    }

    // 강제청산 (max hold 도달)
    if (exitType === null) {
      const forceDay = Math.min(lastDay, 16);
      const dd = ev.tracking.find((p) => p.day === forceDay);
      if (dd && dd.close > 0) {
        exitPrice = dd.close;
        exitType = "forced";
        exitDay = forceDay;
        applySellSlip = true;
      } else {
        const lastAvail = ev.tracking
          .filter((p) => p.day >= 3 && p.close > 0)
          .pop();
        if (lastAvail) {
          exitPrice = lastAvail.close;
          exitType = "forced";
          exitDay = lastAvail.day;
          applySellSlip = true;
        } else {
          continue;
        }
      }
    }

    let exitReturnPct = (exitPrice / buyPrice - 1) * 100;

    // 보정 2: 매도 슬리피지 — 더 싸게 매도
    if (stage >= 2 && applySellSlip) {
      const slip = sampleSellSlip();
      exitReturnPct = ((1 + exitReturnPct / 100) * (1 - slip) - 1) * 100;
    }

    // 보정 4: 거래정지/VI — 5% 확률, -1.0%p
    if (stage >= 4 && Math.random() < 0.05) {
      exitReturnPct -= 1.0;
    }

    trades.push({ exitReturnPct, exitType, exitDay });
  }

  return trades;
}

/** trades → 통계 */
function computeStats(trades) {
  const n = trades.length;
  if (n === 0) {
    return {
      n: 0,
      winRate: 0,
      totalReturn: 0,
      avgReturn: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
      profitFactorStr: "0",
      trailingHits: 0,
      absStopHits: 0,
      gapDownHits: 0,
      forcedHits: 0,
      wins: 0,
      losses: 0,
    };
  }
  const wins = trades.filter((t) => t.exitReturnPct > 0);
  const losses = trades.filter((t) => t.exitReturnPct <= 0);
  const totalReturn = trades.reduce((s, t) => s + t.exitReturnPct, 0);
  const totalWin = wins.reduce((s, t) => s + t.exitReturnPct, 0);
  const totalLoss = Math.abs(losses.reduce((s, t) => s + t.exitReturnPct, 0));
  const profitFactor = totalLoss > 0 ? totalWin / totalLoss : Infinity;

  return {
    n,
    winRate: (wins.length / n) * 100,
    totalReturn,
    avgReturn: totalReturn / n,
    avgWin: wins.length > 0 ? totalWin / wins.length : 0,
    avgLoss: losses.length > 0 ? -totalLoss / losses.length : 0,
    profitFactor: isFinite(profitFactor) ? profitFactor : 999,
    profitFactorStr: isFinite(profitFactor) ? profitFactor.toFixed(2) : "INF",
    trailingHits: trades.filter((t) => t.exitType === "trailing").length,
    absStopHits: trades.filter((t) => t.exitType === "abs_stop").length,
    gapDownHits: trades.filter((t) => t.exitType === "gap_down_stop").length,
    forcedHits: trades.filter((t) => t.exitType === "forced").length,
    wins: wins.length,
    losses: losses.length,
  };
}

/** 30회 평균 */
function runManyAverage(stage, trailingPct, maxDays, runs) {
  const acc = {
    n: 0, winRate: 0, totalReturn: 0, avgReturn: 0, avgWin: 0, avgLoss: 0,
    profitFactor: 0, trailingHits: 0, absStopHits: 0, gapDownHits: 0,
    forcedHits: 0, wins: 0, losses: 0,
  };
  for (let i = 0; i < runs; i++) {
    const trades = simulateOnce(stage, trailingPct, maxDays);
    const s = computeStats(trades);
    for (const k of Object.keys(acc)) acc[k] += s[k];
  }
  const avg = { trailingPct, maxDays };
  for (const k of Object.keys(acc)) avg[k] = acc[k] / runs;
  // 정수형 카운트는 round
  for (const k of ["n", "trailingHits", "absStopHits", "gapDownHits", "forcedHits", "wins", "losses"]) {
    avg[k] = Math.round(avg[k]);
  }
  avg.profitFactorStr = avg.profitFactor >= 999 ? "INF" : avg.profitFactor.toFixed(2);
  return avg;
}

const STAGE_LABELS = {
  0: "0 (원본 — 보정 없음)",
  1: "1 (+ 매수 슬리피지)",
  2: "2 (+ 매도 슬리피지)",
  3: "3 (+ 갭다운 손절)",
  4: "4 (+ 거래정지/VI)",
};

const stageBest = [];

for (const stage of STAGES) {
  console.log("=".repeat(130));
  console.log(`■ 보정 단계 ${STAGE_LABELS[stage]}`);
  console.log("=".repeat(130));

  const stageResults = [];
  for (const trailingPct of TRAILING_STOPS) {
    for (const maxDays of MAX_HOLD_DAYS) {
      const r = runManyAverage(stage, trailingPct, maxDays, RUNS_PER_COMBO);
      stageResults.push(r);
    }
  }

  const showGap = stage >= 3;
  if (showGap) {
    console.log("트레일링 | 최대보유 | 거래수 |   승률  |  총수익률 | 평균수익률 |  평균이익  |  평균손실  | 손익비 | 트레일 | 절대손절 | 갭다운손절 | 강제청산");
  } else {
    console.log("트레일링 | 최대보유 | 거래수 |   승률  |  총수익률 | 평균수익률 |  평균이익  |  평균손실  | 손익비 | 트레일 | 절대손절 | 강제청산");
  }
  console.log("-".repeat(130));
  for (const r of stageResults) {
    const trail = `${r.trailingPct}%`.padStart(5);
    const hold = `${r.maxDays}일`.padStart(4);
    const cnt = String(r.n).padStart(5);
    const wr = `${r.winRate.toFixed(1)}%`.padStart(7);
    const tr = `${r.totalReturn >= 0 ? "+" : ""}${r.totalReturn.toFixed(1)}%`.padStart(9);
    const ar = `${r.avgReturn >= 0 ? "+" : ""}${r.avgReturn.toFixed(2)}%`.padStart(9);
    const aw = `+${r.avgWin.toFixed(2)}%`.padStart(9);
    const al = `${r.avgLoss.toFixed(2)}%`.padStart(9);
    const pf = r.profitFactorStr.padStart(6);

    if (showGap) {
      console.log(
        `  ${trail}  |  ${hold}   | ${cnt}  | ${wr} | ${tr} | ${ar}  | ${aw} | ${al}  | ${pf} |  ${String(r.trailingHits).padStart(3)}  |   ${String(r.absStopHits).padStart(3)}    |    ${String(r.gapDownHits).padStart(3)}    |   ${String(r.forcedHits).padStart(3)}`
      );
    } else {
      console.log(
        `  ${trail}  |  ${hold}   | ${cnt}  | ${wr} | ${tr} | ${ar}  | ${aw} | ${al}  | ${pf} |  ${String(r.trailingHits).padStart(3)}  |   ${String(r.absStopHits).padStart(3)}    |   ${String(r.forcedHits).padStart(3)}`
      );
    }
  }

  const ranked = [...stageResults].sort((a, b) => {
    if (b.profitFactor !== a.profitFactor) return b.profitFactor - a.profitFactor;
    if (b.totalReturn !== a.totalReturn) return b.totalReturn - a.totalReturn;
    return b.winRate - a.winRate;
  });

  console.log(`\n--- 단계 ${stage} TOP 3 (손익비 기준) ---`);
  for (let i = 0; i < 3; i++) {
    const r = ranked[i];
    console.log(
      `#${i + 1}: 트레일링 ${r.trailingPct}% / ${r.maxDays}일 | 승률 ${r.winRate.toFixed(1)}% | 총 ${r.totalReturn >= 0 ? "+" : ""}${r.totalReturn.toFixed(1)}% | 평균 ${r.avgReturn >= 0 ? "+" : ""}${r.avgReturn.toFixed(2)}% | 손익비 ${r.profitFactorStr} | (${r.wins}승 ${r.losses}패)`
    );
  }
  console.log();

  stageBest.push({ stage, best: ranked[0] });
}

console.log("=".repeat(95));
console.log("■ 보정 단계별 비교 요약 (각 단계 손익비 1위 조합)");
console.log("=".repeat(95));
console.log("단계                       | 트레일링/보유 |   승률  | 총수익률 | 평균수익률 | 손익비");
console.log("-".repeat(95));
for (const { stage, best } of stageBest) {
  const label = STAGE_LABELS[stage].padEnd(26);
  const combo = `${best.trailingPct}%/${best.maxDays}일`.padStart(11);
  const wr = `${best.winRate.toFixed(1)}%`.padStart(7);
  const tr = `${best.totalReturn >= 0 ? "+" : ""}${best.totalReturn.toFixed(1)}%`.padStart(8);
  const ar = `${best.avgReturn >= 0 ? "+" : ""}${best.avgReturn.toFixed(2)}%`.padStart(9);
  const pf = best.profitFactorStr.padStart(6);
  console.log(`${label} | ${combo}  | ${wr} | ${tr} | ${ar}  | ${pf}`);
}
console.log("=".repeat(95));
console.log(`\n시뮬레이션 완료. 각 셀은 ${RUNS_PER_COMBO}회 평균.`);
