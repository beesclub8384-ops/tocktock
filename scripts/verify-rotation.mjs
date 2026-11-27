/**
 * 순환매 점검 계산(lib/rotation-core.ts) 검증.
 *
 *   node scripts/verify-rotation.mjs
 *
 * 1) 2026-11-26 기준 자료(scripts/fixtures/rotation-2026-11-26.json)를 넣어,
 *    파이썬으로 따로 계산해 둔 기대값(…expected.json)과 전부 대조한다.
 *    기대값에는 가로 PDF 에 인쇄된 숫자(소수 첫째 자리)도 들어 있다.
 * 2) 일별 자료 → 월말·최근 거래일 표 변환(toCoreInput)을 작은 가짜 자료로 확인한다.
 * 3) 네이버 응답 해석, 장 마감 시각 판단(15:40 KST), 두 출처 대조 규칙을 확인한다.
 *
 * Node 22.18 이상(타입 제거 기본 지원)에서 .ts 를 바로 읽는다.
 * 외부 접속·Redis 를 쓰지 않는다. 실패하면 종료 코드 1.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closedThrough, computeRotation, crossCheck, kstDate, parseSiseJson, toCoreInput, weekKey } from "../lib/rotation-core.ts";

const here = dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(readFileSync(join(here, "fixtures", f), "utf8"));
const fx = load("rotation-2026-11-26.json");
const ex = load("rotation-2026-11-26.expected.json");

let checks = 0;
const fails = [];
const near = (a, b, tol) => (a === null || b === null ? a === b : Math.abs(a - b) <= tol);
function eq(name, got, want, tol = 1e-9) {
  checks += 1;
  const ok = typeof want === "number" || want === null ? near(got ?? null, want, tol) : got === want;
  if (!ok) fails.push(`${name}: 계산 ${got} ≠ 기대 ${want}`);
}

const res = computeRotation(fx, fx.options);
const row = (k) => res.rows.find((r) => r.key === k);

// ── 1) 파이썬 독립 계산과 대조 ──
eq("asOf", res.asOf, ex.asOf);
eq("windowBase", res.windowBase, ex.windowBase);
eq("주 수", res.weeks.length, ex.weekEnds.length);
res.weeks.forEach((w, j) => {
  eq(`주 ${j} 끝`, w.end, ex.weekEnds[j]);
  eq(`주 ${j} 거래일 수`, w.tradingDays, ex.weekDays[j]);
  eq(`주 ${j} 반도체 하락`, w.baseDown, ex.baseDown[j]);
});
eq("반도체 하락 주 수", res.baseDownWeeks, ex.baseDownWeeks);
eq("반도체 고점 월", res.months[res.basePeakIdx], ex.basePeakMonth);
for (const [k, e] of Object.entries(ex.rows)) {
  const r = row(k);
  eq(`${k} 월간 개수`, r.monthlyRet.length, e.monthlyRet.length);
  e.monthlyRet.forEach((v, i) => eq(`${k} 월간[${i}]`, r.monthlyRet[i], v));
  eq(`${k} 고점 인덱스`, r.peakIdx, e.peakIdx);
  for (const f of ["fromPeak", "preBasePeak", "sinceBasePeak", "cum8w", "mtd"]) eq(`${k} ${f}`, r[f], e[f]);
  e.weekly.forEach((v, i) => eq(`${k} 주간[${i}]`, r.weekly[i], v));
  eq(`${k} 반도체 하락 주에 오른 횟수`, r.upsOnBaseDown, e.upsOnBaseDown);
}
for (const [k, e] of Object.entries(ex.verdicts)) {
  const v = res.verdicts.find((x) => x.key === k);
  for (const f of ["q1", "q2", "q3", "overall", "streak", "leadTargetRet", "leadBaseRet"]) eq(`판정 ${k} ${f}`, v[f], e[f]);
}
eq("오른 곳 개수", res.risers.length, ex.risers.length);
ex.risers.forEach(([k, c], i) => {
  eq(`오른 곳 ${i} 이름`, res.risers[i]?.key, k);
  eq(`오른 곳 ${i} 누적`, res.risers[i]?.cum8w, c);
});

// ── PDF 에 인쇄된 값과 대조 (소수 첫째 자리 반올림 오차 0.05) ──
const p = ex.pdf;
for (const [k, m] of Object.entries(p.peakMonth)) eq(`PDF 고점 월 ${k}`, res.months[row(k).peakIdx], m);
for (const f of ["fromPeak", "preBasePeak", "mtd"]) for (const [k, v] of Object.entries(p[f])) eq(`PDF ${f} ${k}`, row(k)[f], v, 0.0501);
for (const [k, v] of Object.entries(p.weeklyLast)) eq(`PDF 마지막 주 ${k}`, row(k).weekly.at(-1), v, 0.0501);
for (const [k, v] of Object.entries(p.ups)) eq(`PDF 오른 주 수 ${k}`, row(k).upsOnBaseDown, v);
eq("PDF 반도체 하락 주 수", res.baseDownWeeks, p.baseDownWeeks);

// 차트 자료: 첫 값 100, 길이
const c12 = res.chart12m.series.find((s) => s.key === "반도체");
eq("12개월 차트 길이", res.chart12m.labels.length, 12);
eq("12개월 차트 첫 값", c12.values[0], 100);
eq("12개월 차트 끝 값", c12.values.at(-1), (81200 / 61300) * 100);
const c8 = res.chart8w.series.find((s) => s.key === "조선");
eq("8주 차트 첫 날", res.chart8w.labels[0], ex.windowBase);
eq("8주 차트 첫 값", c8.values[0], 100);
eq("8주 차트 끝 값", c8.values.at(-1), 100 + ex.rows["조선"].cum8w);

// ── 2) 일별 → 표 변환 ──
eq("주 키(목)", weekKey("2026-11-26"), "2026-11-23");
eq("주 키(월)", weekKey("2026-11-23"), "2026-11-23");
eq("주 키(일)", weekKey("2026-11-29"), "2026-11-23");
eq("주 키(해 넘김)", weekKey("2027-01-01"), "2026-12-28");
const cal = ["2026-08-28", "2026-08-31", "2026-09-01", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-05"];
const series = {
  K: cal.map((d, i) => ({ date: d, close: 100 + i })),
  // A: 9월 1일 상장, 9월 30일 거래 없음(전날 값 유지), 10월 5일 값은 기준일 뒤라 버려야 함
  A: [
    { date: "2026-09-01", close: 10 },
    { date: "2026-09-29", close: 12 },
    { date: "2026-10-01", close: 13 },
    { date: "2026-10-02", close: 14 },
    { date: "2026-10-05", close: 99 },
  ],
};
const ci = toCoreInput(series, "K", "2026-10-02");
eq("변환 월 목록", ci.months.join(","), "2026-08,2026-09,2026-10");
eq("변환 K 월말", ci.monthEnd.K.join(","), "101,104,106");
eq("변환 A 8월(상장 전)", ci.monthEnd.A[0], null);
eq("변환 A 9월(전날 값 유지)", ci.monthEnd.A[1], 12);
eq("변환 A 10월(기준일까지)", ci.monthEnd.A[2], 14);
eq("변환 마지막 거래일", ci.days.at(-1), "2026-10-02");
eq("변환 A 일별", ci.recent.A.join(","), ",,10,12,12,13,14");
let threw = false;
try {
  toCoreInput(series, "K", "2026-10-03");
} catch {
  threw = true;
}
eq("기준일에 코스피 종가가 없으면 오류", threw, true);

// ── 3) 수집 쪽 도우미: 네이버 응답 해석, 장 마감 시각, 출처 대조 ──
const sise = `[['날짜', '시가', '고가', '저가', '종가', '거래량', '외국인소진율'],
["20261125", 80100, 81900, 79800, 80435, 1234567, 12.3],
["20261126", 80500, 82000, 80200, 81200, 1111111, 12.4],

["20261126", 80500, 82000, 80200, 81200, 1111111, 12.4],
["20261124", 88000, 89000, 87000, 88650, 999, 0],
["bad", 1, 1, 1, 1, 1, 0],
["20261123", 1, 1, 1, 0, 1, 0]
]`;
const parsed = parseSiseJson(sise);
eq("siseJson 행 수(중복·잘못된 행 제거)", parsed.length, 3);
eq("siseJson 정렬·날짜 형식", parsed.map((p) => p.date).join(","), "2026-11-24,2026-11-25,2026-11-26");
eq("siseJson 종가", parsed.at(-1).close, 81200);
eq("siseJson 지수(소수)", parseSiseJson(`[['날짜','시가','고가','저가','종가','거래량'],["20261126", 4700.1, 4720.5, 4690.2, 4711.21, 1]]`)[0].close, 4711.21);

// 2026-11-27 은 금요일. KST = UTC+9
const kst = (s) => new Date(`${s}+09:00`);
eq("KST 날짜", kstDate(new Date("2026-11-26T15:30:00Z")), "2026-11-27");
eq("금 09:00 → 목까지", closedThrough(kst("2026-11-27T09:00:00")), "2026-11-26");
eq("금 15:39 → 목까지", closedThrough(kst("2026-11-27T15:39:00")), "2026-11-26");
eq("금 15:40 → 금까지", closedThrough(kst("2026-11-27T15:40:00")), "2026-11-27");
eq("금 16:30(cron) → 금까지", closedThrough(kst("2026-11-27T16:30:00")), "2026-11-27");
eq("토 10:00 → 토(자료 없음, 자연히 금)", closedThrough(kst("2026-11-28T10:00:00")), "2026-11-28");
eq("월 00:10 → 일(자료 없음, 자연히 금)", closedThrough(kst("2026-11-30T00:10:00")), "2026-11-29");

const mk = (n, f) => Array.from({ length: n }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, close: f(i) }));
const same = crossCheck(mk(25, (i) => 1000 + i), mk(25, (i) => 1000 + i + 0.0004), "2026-10-20");
eq("대조: 같으면 일치", same.status, "일치");
eq("대조: 비교한 날 수", same.compared, 25);
const diff = crossCheck(mk(25, (i) => 1000 + i), mk(25, (i) => (i === 3 || i === 22 ? 1010 + i : 1000 + i)), "2026-10-20");
eq("대조: 다르면 불일치", diff.status, "불일치");
eq("대조: 다른 날 수", diff.mismatched, 2);
eq("대조: 최근 구간에서 다른 날 수", diff.recentMismatched, 1);
eq("대조: 겹치는 날이 적으면 판단 안 함", crossCheck(mk(10, (i) => i + 1), mk(10, (i) => i + 1), "2026-10-01").status, "대조 못 함");
eq("대조: 한쪽이 비면 판단 안 함", crossCheck(mk(25, (i) => i + 1), [], "2026-10-01").status, "대조 못 함");

if (fails.length) {
  console.error(`실패 ${fails.length}건 / 확인 ${checks}건`);
  for (const f of fails.slice(0, 40)) console.error(" - " + f);
  process.exit(1);
}
console.log(`통과: ${checks}건 모두 일치 (기준일 ${res.asOf}, 8주 기준점 ${res.windowBase})`);
