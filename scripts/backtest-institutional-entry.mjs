/**
 * 세력진입 의심 종목 백테스트
 * - krx-daily-all.json 3년치 데이터에 실제 필터 조건 적용
 * - 각 이벤트별 D+1~D+60 가격/거래대금 추적
 */
import fs from "fs";

const INPUT = "data/krx-history/krx-daily-all.json";
const OUTPUT = "data/krx-history/institutional-entry-analysis.json";

// --- 상수 (route.ts와 동일) ---
const YESTERDAY_THRESHOLD = 30_000_000_000; // 300억
const TODAY_THRESHOLD = 95_000_000_000; // 950억

// --- isRegularStock (route.ts와 동일) ---
const ETF_BRAND_RE =
  /^(KODEX|TIGER|KBSTAR|ACE|ARIRANG|HANARO|SOL|KOSEF|KINDEX|TIMEFOLIO|PLUS|FOCUS|WOORI|BNK|RISE|KIWOOM|KoAct|WON|HK|1Q|TIME|DAISHIN\d+|UNICORN|TRUSTON|VITA|에셋플러스|마이다스|더제이|파워|마이티|히어로)\s/;

function isRegularStock(name) {
  if (/ETF|ETN/i.test(name)) return false;
  if (ETF_BRAND_RE.test(name)) return false;
  if (name.includes("리츠") || /REIT/i.test(name)) return false;
  if (/스팩/.test(name)) return false;
  if (/채권|선물|인버스|레버리지/.test(name)) return false;
  if (/^(맥쿼리|KB발해)인프라/.test(name)) return false;
  if (/우[A-C]?$/.test(name)) return false;
  return true;
}

// --- 데이터 로드 ---
console.log("[1/4] 데이터 로드 중...");
const raw = JSON.parse(fs.readFileSync(INPUT, "utf8"));

// 날짜 정렬
const allDates = Object.keys(raw).sort();
console.log(`  날짜 범위: ${allDates[0]} ~ ${allDates[allDates.length - 1]} (${allDates.length}거래일)`);

// 날짜별 종목 맵 구축: dateMap[YYYYMMDD][code] = { open, high, low, close, trdval, chgRate, name }
console.log("[2/4] 종목 맵 구축 중...");
const dateMap = {};
for (const date of allDates) {
  const dayData = raw[date];
  const stocks = Object.values(dayData).flat();
  const map = {};
  for (const s of stocks) {
    map[s.code] = s;
  }
  dateMap[date] = map;
}

// --- 폭발 종목 탐지 ---
console.log("[3/4] 세력진입 의심 종목 탐지 중...");
const events = [];
let explosionCount = 0;

for (let i = 1; i < allDates.length - 1; i++) {
  const yesterdayDate = allDates[i - 1];
  const todayDate = allDates[i]; // D일 (폭발일)
  const tomorrowDate = allDates[i + 1]; // D+1일

  const yesterdayMap = dateMap[yesterdayDate];
  const todayMap = dateMap[todayDate];
  const tomorrowMap = dateMap[tomorrowDate];

  // D일 전종목 순회
  for (const code of Object.keys(todayMap)) {
    const today = todayMap[code];
    const yesterday = yesterdayMap[code];
    const tomorrow = tomorrowMap[code];

    if (!today || !yesterday || !tomorrow) continue;
    if (!isRegularStock(today.name)) continue;

    // 조건 1: D-1일 거래대금 ≤ 300억 (조용한 종목)
    if (yesterday.trdval <= 0 || yesterday.trdval > YESTERDAY_THRESHOLD) continue;

    // 조건 2: D일 거래대금 ≥ 950억 (폭발)
    if (today.trdval < TODAY_THRESHOLD) continue;

    // 조건 3: D일 등락률 > 0
    if (today.chgRate <= 0) continue;

    // 조건 4: 갭상승 10%+ 음봉 제외
    const prevClose = today.close / (1 + today.chgRate / 100);
    const gapPct = ((today.open - prevClose) / prevClose) * 100;
    if (gapPct >= 10 && today.close < today.open) continue;

    explosionCount++;

    // 조건 5: D+1 거래대금 ≤ D일의 1/3
    const ratio = tomorrow.trdval / today.trdval;
    if (ratio > 1 / 3) continue;

    // (시총 필터 스킵 — 데이터에 시총 없음)

    // D+1 ~ D+60 추적
    const tracking = [];
    for (let j = 1; j <= 60; j++) {
      const idx = i + j;
      if (idx >= allDates.length) break;
      const futureDate = allDates[idx];
      const futureStock = dateMap[futureDate][code];
      if (!futureStock) {
        tracking.push({ day: j, date: futureDate, data: null });
      } else {
        tracking.push({
          day: j,
          date: futureDate,
          open: futureStock.open,
          high: futureStock.high,
          low: futureStock.low,
          close: futureStock.close,
          trdval: futureStock.trdval,
          chgRate: futureStock.chgRate,
        });
      }
    }

    events.push({
      code,
      name: today.name,
      dDate: todayDate,
      dMinusOne: {
        date: yesterdayDate,
        close: yesterday.close,
        trdval: yesterday.trdval,
      },
      dDay: {
        open: today.open,
        high: today.high,
        low: today.low,
        close: today.close,
        trdval: today.trdval,
        chgRate: today.chgRate,
        gapPct: Math.round(gapPct * 100) / 100,
      },
      dPlusOne: {
        date: tomorrowDate,
        open: tomorrow.open,
        high: tomorrow.high,
        low: tomorrow.low,
        close: tomorrow.close,
        trdval: tomorrow.trdval,
        chgRate: tomorrow.chgRate,
        trdvalRatio: Math.round(ratio * 1000) / 10, // %
      },
      tracking,
    });
  }

  // 진행 표시
  if (i % 100 === 0) {
    process.stderr.write(`  ${i}/${allDates.length} 거래일 처리... (폭발 ${explosionCount}건, 세력의심 ${events.length}건)\r`);
  }
}

console.log(`\n  폭발 종목: ${explosionCount}건`);
console.log(`  세력진입 의심: ${events.length}건`);

// --- 결과 저장 ---
console.log("[4/4] 결과 저장 중...");
const result = {
  meta: {
    description: "세력진입 의심 종목 백테스트 — krx-daily-all.json 3년치",
    generatedAt: new Date().toISOString(),
    dataRange: `${allDates[0]} ~ ${allDates[allDates.length - 1]}`,
    tradingDays: allDates.length,
    filters: {
      "D-1 거래대금": "<= 300억",
      "D일 거래대금": ">= 950억",
      "D일 등락률": "> 0%",
      "갭상승+음봉": "갭 10%+ && 종가<시가 제외",
      "D+1 거래대금": "<= D일의 1/3",
      "시총 필터": "미적용 (데이터 없음)",
      "종목 유형": "일반 주식만 (ETF/ETN/스팩/리츠/우선주 제외)",
    },
    totalExplosions: explosionCount,
    totalSuspected: events.length,
  },
  events: events.sort((a, b) => a.dDate.localeCompare(b.dDate)),
};

fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2), "utf8");
const sizeMB = (fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(1);
console.log(`  저장 완료: ${OUTPUT} (${sizeMB}MB, ${events.length}건)`);

// --- 요약 통계 ---
console.log("\n=== 요약 ===");
const byYear = {};
for (const e of events) {
  const y = e.dDate.slice(0, 4);
  byYear[y] = (byYear[y] || 0) + 1;
}
for (const [y, cnt] of Object.entries(byYear).sort()) {
  console.log(`  ${y}년: ${cnt}건`);
}

// D+5, D+20, D+60 수익률 분포
for (const dPlus of [5, 20, 60]) {
  const returns = events
    .map((e) => {
      const t = e.tracking.find((t) => t.day === dPlus);
      if (!t || !t.close) return null;
      return ((t.close - e.dDay.close) / e.dDay.close) * 100;
    })
    .filter((r) => r !== null);

  if (returns.length === 0) continue;
  returns.sort((a, b) => a - b);
  const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
  const median = returns[Math.floor(returns.length / 2)];
  const positive = returns.filter((r) => r > 0).length;

  console.log(
    `  D+${dPlus}: 평균 ${avg.toFixed(1)}%, 중앙값 ${median.toFixed(1)}%, 승률 ${((positive / returns.length) * 100).toFixed(0)}% (${returns.length}건)`
  );
}
