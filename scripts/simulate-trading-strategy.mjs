/**
 * 세력진입 의심 패턴 매매 전략 시뮬레이션
 *
 * 182건 필터링 케이스에서:
 * - 매수: D+3 시가
 * - 매도: 장중 고가가 +5% 도달 시 즉시 매도
 * - 손절: 장중 저가가 손절선 이하 시 즉시 손절
 * - 강제청산: D+16 종가
 *
 * 손절 라인: -3%, -5%, -7%, -10%, 없음(D+16 강제청산)
 *
 * 입력: data/krx-history/institutional-entry-analysis.json
 *       data/krx-history/krx-daily-all.json (D+2 거래대금 필터용)
 * 출력: 콘솔 비교 테이블
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ANALYSIS_PATH = join(__dirname, "..", "data", "krx-history", "institutional-entry-analysis.json");
const KRX_PATH = join(__dirname, "..", "data", "krx-history", "krx-daily-all.json");

const TARGET_PCT = 5; // +5% 목표
const STOP_LEVELS = [-3, -5, -7, -10, null]; // null = 손절 없음

// --- 로드 ---
console.log("=== 매매 전략 시뮬레이션 ===\n");

console.log("[1/3] 데이터 로딩...");
const analysis = JSON.parse(readFileSync(ANALYSIS_PATH, "utf-8"));
const krxData = JSON.parse(readFileSync(KRX_PATH, "utf-8"));

// krx-daily-all에서 종목별 일별 거래대금 맵 생성
const tvMap = new Map(); // "code:date" -> tradingValue
for (const stock of krxData.stocks) {
  for (const d of stock.daily) {
    tvMap.set(`${stock.code}:${d.date}`, d.tradingValue);
  }
}

// --- 필터: 692건 → 182건 ---
console.log("[2/3] 필터 적용 중...");

const filtered = analysis.events.filter((ev) => {
  // 1차 필터: D-day 등락률 10~20%, 거래대금 < 5000억
  if (ev.dDayChangeRate < 10 || ev.dDayChangeRate > 20) return false;
  if (ev.dDayTradingValue >= 500_000_000_000) return false;

  // 2차 필터: D+2 종가 > 0%
  const d2 = ev.postExplosion.find((p) => p.day === 2);
  if (!d2 || d2.close <= 0) return false;

  // D+2 거래대금 ≥ 300억 (krx-daily-all에서 조회)
  if (!d2.date) return false;
  const d2tv = tvMap.get(`${ev.code}:${d2.date}`);
  if (!d2tv || d2tv < 30_000_000_000) return false;

  return true;
});

console.log(`  전체: ${analysis.totalCases}건 → 필터 후: ${filtered.length}건\n`);

// --- 시뮬레이션 ---
console.log("[3/3] 전략 시뮬레이션 중...\n");

// postExplosion의 값은 D+1 종가 대비 등락률(%)
// D+3 시가 매수 → 매수가 = D+1종가 × (1 + d3.open/100)
// 이후 D+3~D+16의 고가/저가를 D+1종가 대비 %로 환산하여 비교

for (const stopPct of STOP_LEVELS) {
  const label = stopPct === null ? "손절없음" : `${stopPct}%`;
  const results = [];

  for (const ev of filtered) {
    const d3 = ev.postExplosion.find((p) => p.day === 3);
    if (!d3) continue;

    const buyPct = d3.open; // D+1 종가 대비 매수가(%)
    if (buyPct <= -99) continue; // 안전장치

    // 목표/손절을 D+1 종가 대비 %로 변환
    const targetPct = buyPct + TARGET_PCT * (1 + buyPct / 100);
    // +5%를 매수가 기준으로: buyPrice * 1.05 = base * (1 + buyPct/100) * 1.05
    // D+1 종가 대비: (1 + buyPct/100) * 1.05 - 1 = targetPct/100
    const targetBasePct = ((1 + buyPct / 100) * (1 + TARGET_PCT / 100) - 1) * 100;
    const stopBasePct = stopPct !== null
      ? ((1 + buyPct / 100) * (1 + stopPct / 100) - 1) * 100
      : null;

    let exitPct = null;
    let exitType = null;

    // D+3 ~ D+16 순회 (D+3 당일도 매수 후 장중 변동 체크)
    for (let day = 3; day <= 16; day++) {
      const dd = ev.postExplosion.find((p) => p.day === day);
      if (!dd) break;

      if (day === 3) {
        // D+3 당일: 시가에 매수 후 장중 고가/저가 체크
        // 시가 = 매수가이므로, 고가/저가만 체크
      }

      // 같은 날 손절과 목표 모두 도달 시 → 손절 우선 (보수적)
      if (stopBasePct !== null && dd.low <= stopBasePct) {
        exitPct = stopPct;
        exitType = "stop";
        break;
      }
      if (dd.high >= targetBasePct) {
        exitPct = TARGET_PCT;
        exitType = "target";
        break;
      }
    }

    // 미체결 → D+16 종가 강제청산
    if (exitType === null) {
      const d16 = ev.postExplosion.find((p) => p.day === 16);
      if (d16) {
        // D+16 종가 기준 수익률 = (d16.close - buyPct) / (1 + buyPct/100) * 100... 아니고
        // d16.close는 D+1종가 대비 %, buyPct도 D+1종가 대비 %
        // 수익률 = (closePrice - buyPrice) / buyPrice * 100
        //        = ((1 + d16.close/100) - (1 + buyPct/100)) / (1 + buyPct/100) * 100
        //        = (d16.close - buyPct) / (1 + buyPct/100) * 100... 이것도 맞지 않음
        // 정확히: buyPrice = base * (1 + buyPct/100), sellPrice = base * (1 + d16.close/100)
        // return = (sellPrice/buyPrice - 1) * 100 = ((1 + d16.close/100)/(1 + buyPct/100) - 1) * 100
        exitPct = ((1 + d16.close / 100) / (1 + buyPct / 100) - 1) * 100;
        exitType = "forced";
      } else {
        continue; // 데이터 부족
      }
    }

    results.push({
      code: ev.code,
      name: ev.name,
      dDate: ev.dDate,
      buyPct,
      exitPct,
      exitType,
    });
  }

  // 통계 계산
  const wins = results.filter((r) => r.exitPct > 0);
  const losses = results.filter((r) => r.exitPct <= 0);
  const winRate = (wins.length / results.length * 100).toFixed(1);

  const totalReturn = results.reduce((sum, r) => sum + r.exitPct, 0);
  const avgReturn = (totalReturn / results.length).toFixed(2);
  const avgWin = wins.length > 0
    ? (wins.reduce((s, r) => s + r.exitPct, 0) / wins.length).toFixed(2)
    : "0.00";
  const avgLoss = losses.length > 0
    ? (losses.reduce((s, r) => s + r.exitPct, 0) / losses.length).toFixed(2)
    : "0.00";

  const totalWin = wins.reduce((s, r) => s + r.exitPct, 0);
  const totalLoss = Math.abs(losses.reduce((s, r) => s + r.exitPct, 0));
  const profitFactor = totalLoss > 0 ? (totalWin / totalLoss).toFixed(2) : "INF";

  const targetHits = results.filter((r) => r.exitType === "target").length;
  const stopHits = results.filter((r) => r.exitType === "stop").length;
  const forcedExits = results.filter((r) => r.exitType === "forced").length;

  console.log(`--- 손절 라인: ${label} ---`);
  console.log(`  대상: ${results.length}건`);
  console.log(`  승률: ${winRate}% (${wins.length}승 / ${losses.length}패)`);
  console.log(`  총 수익률: ${totalReturn.toFixed(2)}%`);
  console.log(`  평균 수익률: ${avgReturn}%`);
  console.log(`  평균 이익: +${avgWin}% | 평균 손실: ${avgLoss}%`);
  console.log(`  손익비(Profit Factor): ${profitFactor}`);
  console.log(`  청산 유형: 목표달성 ${targetHits}건 | 손절 ${stopHits}건 | 강제청산 ${forcedExits}건`);
  console.log();
}
