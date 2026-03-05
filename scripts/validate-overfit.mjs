/**
 * 트레일링 스탑 전략 과적합 검증
 *
 * 3년 데이터를 전반기/후반기로 나눠 동일 전략 성과 비교
 * 전반기: 2023.03 ~ 2024.08
 * 후반기: 2024.09 ~ 2026.03
 *
 * 전략: 트레일링 -3% + 절대손절 -7% + D+3 시가 매수
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ANALYSIS_PATH = join(__dirname, "..", "data", "krx-history", "institutional-entry-analysis.json");
const KRX_PATH = join(__dirname, "..", "data", "krx-history", "krx-daily-all.json");

const TRAILING_PCT = -3;
const ABS_STOP = -7;

const PERIODS = [
  { name: "전반기", start: "2023-03", end: "2024-08" },
  { name: "후반기", start: "2024-09", end: "2026-03" },
  { name: "전체", start: "2023-03", end: "2026-03" },
];

console.log("=== 과적합 검증: 전반기 vs 후반기 ===\n");

console.log("[1/3] 데이터 로딩...");
const analysis = JSON.parse(readFileSync(ANALYSIS_PATH, "utf-8"));
const krxData = JSON.parse(readFileSync(KRX_PATH, "utf-8"));

// 거래대금 맵
const tvMap = new Map();
for (const stock of krxData.stocks) {
  for (const d of stock.daily) {
    tvMap.set(`${stock.code}:${d.date}`, d.tradingValue);
  }
}

console.log(`  전체 이벤트: ${analysis.totalCases}건\n`);

// D일 날짜를 YYYY-MM 형식으로 변환
function toYM(dateStr) {
  // dateStr: "20230315" or "2023-03-15" etc
  const clean = dateStr.replace(/[^0-9]/g, "");
  return clean.slice(0, 4) + "-" + clean.slice(4, 6);
}

function inPeriod(dateStr, start, end) {
  const ym = toYM(dateStr);
  return ym >= start && ym <= end;
}

console.log("[2/3] 기간별 필터링 및 시뮬레이션...\n");

for (const period of PERIODS) {
  // 필터링
  const filtered = analysis.events.filter((ev) => {
    // 기간 필터
    if (!inPeriod(ev.dDate, period.start, period.end)) return false;
    // D일 등락률 10~20%
    if (ev.dDayChangeRate < 10 || ev.dDayChangeRate > 20) return false;
    // 거래대금 5000억 미만
    if (ev.dDayTradingValue >= 500_000_000_000) return false;
    // D+1 거래대금 1/3 이하 (이미 패턴 조건에 포함되어 있음)
    // D+2 종가 플러스
    const d2 = ev.postExplosion.find((p) => p.day === 2);
    if (!d2 || d2.close <= 0) return false;
    // D+2 거래대금 300억 이상
    if (!d2.date) return false;
    const d2tv = tvMap.get(`${ev.code}:${d2.date}`);
    if (!d2tv || d2tv < 30_000_000_000) return false;
    return true;
  });

  // 시뮬레이션
  const trades = [];
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

      // 절대 손절
      if (dd.low <= absStopBasePct) {
        exitReturnPct = ABS_STOP;
        exitType = "abs_stop";
        break;
      }

      // 트레일링 스탑
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

    // 미체결 → D+16 강제청산
    if (exitType === null) {
      const d16 = ev.postExplosion.find((p) => p.day === 16);
      if (d16) {
        exitReturnPct = ((1 + d16.close / 100) / buyFactor - 1) * 100;
        exitType = "forced";
      } else {
        continue;
      }
    }

    trades.push({ exitReturnPct, exitType, name: ev.name, dDate: ev.dDate });
  }

  // 통계
  const n = trades.length;
  const wins = trades.filter((t) => t.exitReturnPct > 0);
  const losses = trades.filter((t) => t.exitReturnPct <= 0);
  const winRate = n > 0 ? (wins.length / n * 100).toFixed(1) : "0.0";

  const totalReturn = trades.reduce((s, t) => s + t.exitReturnPct, 0);
  const avgReturn = n > 0 ? (totalReturn / n).toFixed(2) : "0.00";
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

  console.log(`━━━ ${period.name} (${period.start} ~ ${period.end}) ━━━`);
  console.log(`  대상: ${filtered.length}건 (시뮬: ${n}건)`);
  console.log(`  승률: ${winRate}% (${wins.length}승 / ${losses.length}패)`);
  console.log(`  총 수익률: ${totalReturn >= 0 ? "+" : ""}${totalReturn.toFixed(1)}%`);
  console.log(`  평균 수익률: ${avgReturn >= 0 ? "+" : ""}${avgReturn}%`);
  console.log(`  평균 이익: +${avgWin}% | 평균 손실: ${avgLoss}%`);
  console.log(`  손익비: ${profitFactor}`);
  console.log(`  청산: 트레일링 ${trailingHits} | 절대손절 ${absStopHits} | 강제청산 ${forcedHits}`);
  console.log();
}

// 월별 분포
console.log("━━━ 월별 이벤트 분포 ━━━");
const monthlyCount = new Map();
const monthlyFiltered = analysis.events.filter((ev) => {
  if (ev.dDayChangeRate < 10 || ev.dDayChangeRate > 20) return false;
  if (ev.dDayTradingValue >= 500_000_000_000) return false;
  const d2 = ev.postExplosion.find((p) => p.day === 2);
  if (!d2 || d2.close <= 0) return false;
  if (!d2.date) return false;
  const d2tv = tvMap.get(`${ev.code}:${d2.date}`);
  if (!d2tv || d2tv < 30_000_000_000) return false;
  return true;
});

for (const ev of monthlyFiltered) {
  const ym = toYM(ev.dDate);
  monthlyCount.set(ym, (monthlyCount.get(ym) || 0) + 1);
}

const sortedMonths = [...monthlyCount.entries()].sort((a, b) => a[0].localeCompare(b[0]));
for (const [ym, count] of sortedMonths) {
  const bar = "█".repeat(count);
  console.log(`  ${ym}: ${bar} ${count}건`);
}
console.log();
