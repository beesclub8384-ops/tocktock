/**
 * 트레일링 스탑 전략 추가 검증 4가지
 * 현실적 슬리피지(왕복 0.63%) 반영
 *
 * 1. 연속 손실 분석
 * 2. 시장 상황별 성과 (코스피 20일 수익률 기준)
 * 3. 월별/분기별 수익 분포
 * 4. 생존편향 체크 (상폐/관리종목)
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ANALYSIS_PATH = join(__dirname, "..", "data", "krx-history", "institutional-entry-analysis.json");
const KRX_PATH = join(__dirname, "..", "data", "krx-history", "krx-daily-all.json");

const TRAILING_PCT = -3;
const ABS_STOP = -7;
const BUY_COST = (0.015 + 0.3) / 100;  // 매수 시 수수료+슬리피지
const SELL_COST = (0.015 + 0.3) / 100;  // 매도 시

const NAVER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- 코스피 지수 가져오기 ---
async function fetchKospiIndex() {
  const url = `https://api.finance.naver.com/siseJson.naver?symbol=KOSPI&requestType=1&startTime=20230101&endTime=20260305&timeframe=day`;
  try {
    const res = await fetch(url, { headers: NAVER_HEADERS, signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    const parsed = JSON.parse(text.trim().replace(/'/g, '"'));
    if (!Array.isArray(parsed) || parsed.length < 2) return null;
    return parsed.slice(1).map(row => ({
      date: String(row[0]).trim().replace(/"/g, ""),
      close: Number(row[4]),
    }));
  } catch (e) {
    console.error("  코스피 지수 로딩 실패:", e.message);
    return null;
  }
}

// --- 메인 ---
async function main() {
  console.log("=== 추가 검증 4가지 (현실적 비용 반영) ===\n");

  console.log("[로딩] 데이터...");
  const analysis = JSON.parse(readFileSync(ANALYSIS_PATH, "utf-8"));
  const krxData = JSON.parse(readFileSync(KRX_PATH, "utf-8"));

  // 거래대금 맵
  const tvMap = new Map();
  // 종목별 전체 daily 맵 (생존편향 체크용)
  const stockDailyMap = new Map(); // code → daily[]
  for (const stock of krxData.stocks) {
    stockDailyMap.set(stock.code, stock.daily);
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

  console.log(`  필터 후: ${filtered.length}건\n`);

  // 시뮬레이션 (비용 반영)
  const trades = [];

  for (const ev of filtered) {
    const d3 = ev.postExplosion.find((p) => p.day === 3);
    if (!d3) continue;

    const buyBasePct = d3.open;
    if (buyBasePct <= -99) continue;
    const buyFactor = 1 + buyBasePct / 100;
    const absStopBasePct = (buyFactor * (1 + ABS_STOP / 100) - 1) * 100;

    let peakHighBasePct = d3.high;
    let rawReturnPct = null;
    let exitType = null;
    let exitDay = null;

    for (let day = 3; day <= 16; day++) {
      const dd = ev.postExplosion.find((p) => p.day === day);
      if (!dd) break;

      if (dd.low <= absStopBasePct) {
        rawReturnPct = ABS_STOP;
        exitType = "abs_stop";
        exitDay = day;
        break;
      }

      if (day === 3) peakHighBasePct = dd.high;
      const peakFactor = 1 + peakHighBasePct / 100;
      const trailStopBasePct = (peakFactor * (1 + TRAILING_PCT / 100) - 1) * 100;

      if (dd.low <= trailStopBasePct) {
        const stopFactor = peakFactor * (1 + TRAILING_PCT / 100);
        rawReturnPct = (stopFactor / buyFactor - 1) * 100;
        exitType = "trailing";
        exitDay = day;
        break;
      }

      if (day > 3 && dd.high > peakHighBasePct) peakHighBasePct = dd.high;
    }

    if (exitType === null) {
      const d16 = ev.postExplosion.find((p) => p.day === 16);
      if (d16) {
        rawReturnPct = ((1 + d16.close / 100) / buyFactor - 1) * 100;
        exitType = "forced";
        exitDay = 16;
      } else continue;
    }

    // 비용 반영
    const grossFactor = 1 + rawReturnPct / 100;
    const netFactor = grossFactor * (1 - SELL_COST) / (1 + BUY_COST);
    const netReturnPct = (netFactor - 1) * 100;

    trades.push({
      code: ev.code,
      name: ev.name,
      market: ev.market,
      dDate: ev.dDate,
      netReturnPct,
      rawReturnPct,
      exitType,
      exitDay,
    });
  }

  // 날짜순 정렬
  trades.sort((a, b) => a.dDate.localeCompare(b.dDate));

  console.log(`  시뮬레이션: ${trades.length}건 (비용 왕복 0.63% 반영)\n`);

  // ========================================
  // 1. 연속 손실 분석
  // ========================================
  console.log("━".repeat(70));
  console.log("1. 연속 손실 분석");
  console.log("━".repeat(70));

  let maxStreak = 0;
  let currentStreak = 0;
  let maxStreakLoss = 0;
  let currentStreakLoss = 0;
  const streaks = []; // 각 연패의 길이 기록

  for (const t of trades) {
    if (t.netReturnPct <= 0) {
      currentStreak++;
      currentStreakLoss += t.netReturnPct;
    } else {
      if (currentStreak >= 2) streaks.push({ len: currentStreak, loss: currentStreakLoss });
      if (currentStreak > maxStreak) {
        maxStreak = currentStreak;
        maxStreakLoss = currentStreakLoss;
      }
      currentStreak = 0;
      currentStreakLoss = 0;
    }
  }
  if (currentStreak >= 2) streaks.push({ len: currentStreak, loss: currentStreakLoss });
  if (currentStreak > maxStreak) {
    maxStreak = currentStreak;
    maxStreakLoss = currentStreakLoss;
  }

  const streak2 = streaks.filter(s => s.len === 2).length;
  const streak3 = streaks.filter(s => s.len === 3).length;
  const streak4 = streaks.filter(s => s.len === 4).length;
  const streak5plus = streaks.filter(s => s.len >= 5).length;

  console.log(`  최대 연패: ${maxStreak}연패`);
  console.log(`  최대 연패 시 누적 손실: ${maxStreakLoss.toFixed(2)}%`);
  console.log(`  연패 분포:`);
  console.log(`    2연패: ${streak2}번`);
  console.log(`    3연패: ${streak3}번`);
  console.log(`    4연패: ${streak4}번`);
  console.log(`    5연패+: ${streak5plus}번`);

  // 최대 드로다운(누적 수익 기준)
  let cumReturn = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let ddStart = "", ddEnd = "";
  let currentPeakDate = trades[0]?.dDate || "";

  for (const t of trades) {
    cumReturn += t.netReturnPct;
    if (cumReturn > peak) {
      peak = cumReturn;
      currentPeakDate = t.dDate;
    }
    const dd = peak - cumReturn;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
      ddStart = currentPeakDate;
      ddEnd = t.dDate;
    }
  }
  console.log(`\n  최대 드로다운: -${maxDrawdown.toFixed(1)}% (${ddStart} ~ ${ddEnd})`);
  console.log(`  최종 누적 수익: +${cumReturn.toFixed(1)}%`);

  // ========================================
  // 2. 시장 상황별 성과
  // ========================================
  console.log(`\n${"━".repeat(70)}`);
  console.log("2. 시장 상황별 성과 (코스피 직전 20일 수익률 기준)");
  console.log("━".repeat(70));

  console.log("  코스피 지수 로딩 중...");
  const kospiData = await fetchKospiIndex();

  if (kospiData && kospiData.length > 20) {
    // 날짜 → 코스피 종가 맵
    const kospiMap = new Map();
    for (const d of kospiData) {
      // 날짜 형식 정리: "20230315 " → "20230315"
      const cleanDate = d.date.replace(/\s/g, "");
      kospiMap.set(cleanDate, d.close);
    }

    // 코스피 날짜 배열 (정렬됨)
    const kospiDates = kospiData.map(d => d.date.replace(/\s/g, "")).filter(d => d.length === 8);

    // 각 이벤트의 D일에 대해 20거래일 전 코스피 종가 대비 수익률 계산
    const marketGroups = { bull: [], bear: [], sideways: [] };

    for (const t of trades) {
      const dDate = t.dDate.replace(/[^0-9]/g, "");
      const dIdx = kospiDates.findIndex(d => d >= dDate);
      if (dIdx < 0) continue;

      // 20거래일 전
      const prevIdx = Math.max(0, dIdx - 20);
      const currentClose = kospiMap.get(kospiDates[dIdx]) || kospiMap.get(kospiDates[Math.max(0, dIdx - 1)]);
      const prevClose = kospiMap.get(kospiDates[prevIdx]);

      if (!currentClose || !prevClose || prevClose === 0) {
        marketGroups.sideways.push(t);
        continue;
      }

      const kospi20dReturn = ((currentClose / prevClose) - 1) * 100;

      if (kospi20dReturn >= 5) {
        marketGroups.bull.push(t);
      } else if (kospi20dReturn <= -5) {
        marketGroups.bear.push(t);
      } else {
        marketGroups.sideways.push(t);
      }
    }

    for (const [label, korLabel] of [["bull", "상승장 (+5%↑)"], ["sideways", "횡보장"], ["bear", "하락장 (-5%↓)"]]) {
      const group = marketGroups[label];
      if (group.length === 0) {
        console.log(`\n  ${korLabel}: 0건`);
        continue;
      }
      const wins = group.filter(t => t.netReturnPct > 0);
      const totalRet = group.reduce((s, t) => s + t.netReturnPct, 0);
      const avgRet = totalRet / group.length;
      const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.netReturnPct, 0) / wins.length : 0;
      const losses = group.filter(t => t.netReturnPct <= 0);
      const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.netReturnPct, 0) / losses.length : 0;
      const totalWin = wins.reduce((s, t) => s + t.netReturnPct, 0);
      const totalLoss = Math.abs(losses.reduce((s, t) => s + t.netReturnPct, 0));
      const pf = totalLoss > 0 ? (totalWin / totalLoss).toFixed(2) : "INF";

      console.log(`\n  ${korLabel}: ${group.length}건`);
      console.log(`    승률: ${(wins.length / group.length * 100).toFixed(1)}% (${wins.length}승 / ${losses.length}패)`);
      console.log(`    총 수익률: ${totalRet >= 0 ? "+" : ""}${totalRet.toFixed(1)}%`);
      console.log(`    평균 수익률: ${avgRet >= 0 ? "+" : ""}${avgRet.toFixed(2)}%`);
      console.log(`    평균 이익: +${avgWin.toFixed(2)}% | 평균 손실: ${avgLoss.toFixed(2)}%`);
      console.log(`    손익비: ${pf}`);
    }
  } else {
    console.log("  코스피 지수 데이터를 가져올 수 없어 스킵합니다.");
  }

  // ========================================
  // 3. 월별/분기별 수익 분포
  // ========================================
  console.log(`\n${"━".repeat(70)}`);
  console.log("3. 월별/분기별 수익 분포");
  console.log("━".repeat(70));

  function toYM(dateStr) {
    const clean = dateStr.replace(/[^0-9]/g, "");
    return clean.slice(0, 4) + "-" + clean.slice(4, 6);
  }

  function toQuarter(dateStr) {
    const clean = dateStr.replace(/[^0-9]/g, "");
    const year = clean.slice(0, 4);
    const month = parseInt(clean.slice(4, 6));
    const q = Math.ceil(month / 3);
    return `${year}Q${q}`;
  }

  // 월별
  const monthlyMap = new Map();
  for (const t of trades) {
    const ym = toYM(t.dDate);
    if (!monthlyMap.has(ym)) monthlyMap.set(ym, []);
    monthlyMap.get(ym).push(t);
  }

  console.log("\n  [월별]");
  const sortedMonths = [...monthlyMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  let profitMonths = 0, lossMonths = 0;

  for (const [ym, ts] of sortedMonths) {
    const totalRet = ts.reduce((s, t) => s + t.netReturnPct, 0);
    const wins = ts.filter(t => t.netReturnPct > 0).length;
    const sign = totalRet >= 0 ? "+" : "";
    const bar = totalRet >= 0
      ? " ".repeat(15) + "█".repeat(Math.min(Math.round(totalRet / 2), 30))
      : " ".repeat(Math.max(15 - Math.round(Math.abs(totalRet) / 2), 0)) + "▓".repeat(Math.min(Math.round(Math.abs(totalRet) / 2), 15));

    console.log(`  ${ym}: ${String(ts.length).padStart(2)}건 ${String(wins).padStart(2)}승 | ${sign}${totalRet.toFixed(1).padStart(6)}% ${bar}`);
    if (totalRet > 0) profitMonths++;
    else lossMonths++;
  }

  console.log(`\n  수익 월: ${profitMonths}개 / 손실 월: ${lossMonths}개 (${(profitMonths / (profitMonths + lossMonths) * 100).toFixed(0)}% 수익)`);

  // 분기별
  console.log("\n  [분기별]");
  const quarterMap = new Map();
  for (const t of trades) {
    const q = toQuarter(t.dDate);
    if (!quarterMap.has(q)) quarterMap.set(q, []);
    quarterMap.get(q).push(t);
  }

  const sortedQuarters = [...quarterMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  let profitQ = 0, lossQ = 0;

  for (const [q, ts] of sortedQuarters) {
    const totalRet = ts.reduce((s, t) => s + t.netReturnPct, 0);
    const wins = ts.filter(t => t.netReturnPct > 0).length;
    const sign = totalRet >= 0 ? "+" : "";
    console.log(`  ${q}: ${String(ts.length).padStart(2)}건 ${String(wins).padStart(2)}승 | ${sign}${totalRet.toFixed(1).padStart(7)}%`);
    if (totalRet > 0) profitQ++;
    else lossQ++;
  }

  console.log(`\n  수익 분기: ${profitQ}개 / 손실 분기: ${lossQ}개 (${(profitQ / (profitQ + lossQ) * 100).toFixed(0)}% 수익)`);

  // ========================================
  // 4. 생존편향 체크
  // ========================================
  console.log(`\n${"━".repeat(70)}`);
  console.log("4. 생존편향 체크 (상폐/관리종목/데이터 단절)");
  console.log("━".repeat(70));

  let earlyEndCount = 0;
  let shortDataCount = 0;
  const suspectStocks = [];

  for (const t of trades) {
    const daily = stockDailyMap.get(t.code);
    if (!daily || daily.length === 0) {
      earlyEndCount++;
      suspectStocks.push({ code: t.code, name: t.name, reason: "데이터 없음" });
      continue;
    }

    const dDateClean = t.dDate.replace(/[^0-9]/g, "");

    // D일 인덱스 찾기
    const dIdx = daily.findIndex(d => d.date.replace(/[^0-9]/g, "").replace(/\s/g, "") >= dDateClean);
    if (dIdx < 0) {
      earlyEndCount++;
      suspectStocks.push({ code: t.code, name: t.name, reason: "D일 이후 데이터 없음" });
      continue;
    }

    // D+16 이후 데이터가 얼마나 있는지 체크
    const remainingAfterD16 = daily.length - (dIdx + 17);
    const lastDate = daily[daily.length - 1].date.replace(/[^0-9]/g, "").replace(/\s/g, "");

    // 데이터가 D+16 직후에 끝나면 의심 (전체 데이터 마지막 날이 아닌데 끝남)
    const dataEndDate = krxData.dateRange.end.replace(/[^0-9]/g, "");
    const monthsToEnd = (parseInt(dataEndDate.slice(0, 6)) - parseInt(lastDate.slice(0, 6)));

    if (remainingAfterD16 < 20 && monthsToEnd > 2) {
      shortDataCount++;
      suspectStocks.push({
        code: t.code,
        name: t.name,
        dDate: t.dDate,
        lastDate,
        remainingAfterD16,
        reason: `D+16 이후 ${remainingAfterD16}일만 남음 (데이터 종료: ${lastDate})`,
      });
    }
  }

  // 전체 종목 중 데이터가 일찍 끝나는 종목 (상폐 의심)
  const uniqueCodes = [...new Set(trades.map(t => t.code))];
  const delistedSuspect = [];

  for (const code of uniqueCodes) {
    const daily = stockDailyMap.get(code);
    if (!daily || daily.length === 0) continue;
    const lastDate = daily[daily.length - 1].date.replace(/[^0-9]/g, "").replace(/\s/g, "");
    const dataEndDate = krxData.dateRange.end.replace(/[^0-9]/g, "");
    const monthsToEnd = parseInt(dataEndDate.slice(0, 6)) - parseInt(lastDate.slice(0, 6));

    if (monthsToEnd > 3) {
      const name = trades.find(t => t.code === code)?.name || code;
      delistedSuspect.push({ code, name, lastDate, monthsToEnd });
    }
  }

  console.log(`\n  전체 종목 수: ${uniqueCodes.length}개`);
  console.log(`  데이터 조기 종료 의심 (상폐/관리): ${delistedSuspect.length}개`);

  if (delistedSuspect.length > 0) {
    console.log("\n  [상폐/조기종료 의심 종목]");
    for (const s of delistedSuspect) {
      // 해당 종목의 거래 결과
      const stockTrades = trades.filter(t => t.code === s.code);
      const stockReturn = stockTrades.reduce((sum, t) => sum + t.netReturnPct, 0);
      console.log(`    ${s.code} ${s.name}: 마지막 데이터 ${s.lastDate} (${s.monthsToEnd}개월 전 종료) | 거래 ${stockTrades.length}건, 수익 ${stockReturn >= 0 ? "+" : ""}${stockReturn.toFixed(1)}%`);
    }

    // 상폐 종목 제외 시 성과 변화
    const delistedCodes = new Set(delistedSuspect.map(s => s.code));
    const cleanTrades = trades.filter(t => !delistedCodes.has(t.code));
    const cleanWins = cleanTrades.filter(t => t.netReturnPct > 0);
    const cleanLosses = cleanTrades.filter(t => t.netReturnPct <= 0);
    const cleanTotal = cleanTrades.reduce((s, t) => s + t.netReturnPct, 0);
    const cleanTotalWin = cleanWins.reduce((s, t) => s + t.netReturnPct, 0);
    const cleanTotalLoss = Math.abs(cleanLosses.reduce((s, t) => s + t.netReturnPct, 0));
    const cleanPF = cleanTotalLoss > 0 ? (cleanTotalWin / cleanTotalLoss).toFixed(2) : "INF";

    console.log(`\n  [상폐 의심 종목 제외 시]`);
    console.log(`    대상: ${cleanTrades.length}건`);
    console.log(`    승률: ${(cleanWins.length / cleanTrades.length * 100).toFixed(1)}%`);
    console.log(`    총 수익률: ${cleanTotal >= 0 ? "+" : ""}${cleanTotal.toFixed(1)}%`);
    console.log(`    평균 수익률: ${(cleanTotal / cleanTrades.length).toFixed(2)}%`);
    console.log(`    손익비: ${cleanPF}`);
  } else {
    console.log("\n  상폐/조기종료 의심 종목 없음. 생존편향 위험 낮음.");
  }

  // D+16 이후 데이터 부족 케이스
  if (shortDataCount > 0) {
    console.log(`\n  D+16 이후 데이터 부족 케이스: ${shortDataCount}건`);
  }

  console.log(`\n${"━".repeat(70)}`);
  console.log("검증 완료");
  console.log("━".repeat(70));
}

main().catch(err => { console.error("오류:", err); process.exit(1); });
