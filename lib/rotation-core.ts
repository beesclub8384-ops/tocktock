/**
 * 순환매 점검 — 순수 계산 (외부 호출·Redis·import 없음).
 *
 * 질문: "기준 업종(반도체)이 빠지는 지금, 먼저 꺾였던 업종(조선·방산)이 돌아오고 있나"
 *
 * 이 파일은 숫자만 계산한다. 가격을 받아 오는 일은 lib/rotation.ts 가 한다.
 * 계산 규칙은 날짜를 고정하지 않는다(언제 돌려도 같은 규칙):
 *  - 월간 등락률: 전월 말 종가 대비. 마지막 달은 기준일 종가까지.
 *  - 고점 월: 최근 12개 월말 종가(이번 달 포함) 가운데 가장 높은 달. 같으면 앞선 달.
 *  - 최근 8주: 주(월~금)마다 마지막 거래일 종가로 끊는다. 기준점은 8주 전 주의 마지막 거래일 종가.
 *  - 판정 3개(선행 하락·최근 반등·지속성)는 아래 judge() 주석 참고.
 *  - 긴 흐름 차트: 고정된 출발선(lib/rotation.ts 의 FLOW_BASE_DATE) 종가 = 100, 그 뒤 주마다 마지막 거래일 종가.
 *    이것만 날짜가 고정돼 있다 — 이유는 FLOW_BASE_DATE 주석 참고.
 *
 * ⚠ 검증: scripts/verify-rotation.mjs 가 2026-11-26 기준 자료(가로 PDF 에 쓴 값)를 넣어
 *   파이썬으로 따로 계산한 기대값과 대조한다. 규칙을 바꾸면 그 스크립트의 기대값도 다시 만든다.
 */

export type Num = number | null;

export interface CoreInput {
  /** 'YYYY-MM' 오름차순. 마지막 = 기준일이 속한 달 */
  months: string[];
  /** 월말 종가(마지막 칸은 기준일 종가). months 와 같은 길이. 자료가 없으면 null */
  monthEnd: Record<string, Num[]>;
  /** 최근 거래일 'YYYY-MM-DD' 오름차순. 마지막 = 기준일 */
  days: string[];
  /** 일별 종가. days 와 같은 길이. 일별 자료가 없는 시리즈는 키가 없거나 전부 null */
  recent: Record<string, Num[]>;
}

export interface CoreOptions {
  /** 기준 업종 (반도체) */
  baseKey: string;
  /** 시장 지수 (코스피) — "시장보다 덜 내렸나" 비교용 */
  marketKey: string;
  /** 점검 대상 (조선·방산) */
  targetKeys: string[];
  /** 지수 키 (오른 곳 목록에서 뺀다) */
  indexKeys: string[];
  /** 표시 순서 */
  order: string[];
}

export interface WeekInfo {
  /** 그 주 마지막 거래일 'YYYY-MM-DD' */
  end: string;
  /** 그 주 거래일 수 */
  tradingDays: number;
  /** 기준 업종이 그 주에 내렸나 */
  baseDown: boolean;
}

export interface RotationRow {
  key: string;
  /** 월간 등락률(%). 길이 = months.length - 1 (months[1] 부터) */
  monthlyRet: Num[];
  /** 고점 월의 months 인덱스 */
  peakIdx: number | null;
  /** 고점 월말 종가 대비 기준일 종가(%) */
  fromPeak: Num;
  /** 기준 업종 고점 직전 2개월 등락률(%) */
  preBasePeak: Num;
  /** 기준 업종 고점 월말 → 기준일(%) */
  sinceBasePeak: Num;
  /** 최근 8주 누적(%) */
  cum8w: Num;
  /** 이번 달(전월 말 → 기준일, %) */
  mtd: Num;
  /** 주간 등락률(%). weeks 와 같은 길이 */
  weekly: Num[];
  /** 기준 업종이 내린 주 가운데 오른 주 수. 일별 자료가 없으면 null */
  upsOnBaseDown: number | null;
}

export type Q1 = "예" | "같은 달" | "아니오" | "자료 없음";
export type Q2 = "예" | "시장보다 덜 내림" | "아니오" | "자료 없음";
export type Q3 = "예" | "아직 짧음" | "아니오" | "자료 없음";
export type Overall = "확인" | "조짐" | "아직 아님" | "자료 없음";

export interface Verdict {
  key: string;
  q1: Q1;
  q2: Q2;
  q3: Q3;
  overall: Overall;
  /** 대상의 고점 월말 → 기준 업종 고점 월말 사이 등락률(%) — 대상 / 기준 업종 */
  leadTargetRet: Num;
  leadBaseRet: Num;
  /** 최근 연속으로 "올랐고 기준 업종보다 나았던" 주 수 */
  streak: number | null;
}

export interface ChartSeries {
  key: string;
  values: Num[];
}

export interface RotationResult {
  asOf: string;
  months: string[];
  rows: RotationRow[];
  weeks: WeekInfo[];
  /** 8주 창의 기준점(그 전 주 마지막 거래일) */
  windowBase: string | null;
  /** 기준 업종이 내린 주 수 */
  baseDownWeeks: number;
  basePeakIdx: number | null;
  /** 기준 업종이 최근 8주 누적으로 내렸나 (순환매 점검이 의미 있는 국면인가) */
  baseFalling: boolean | null;
  verdicts: Verdict[];
  /** 최근 8주 누적이 플러스인 업종(지수 제외), 큰 순 */
  risers: { key: string; cum8w: number; ups: number | null }[];
  /** 최근 12개 월말 종가, 첫 값 = 100 */
  chart12m: { labels: string[]; series: ChartSeries[] };
  /** 8주 창 일별 종가, 기준점 = 100 */
  chart8w: { labels: string[]; series: ChartSeries[] };
}

export function pct(a: Num, b: Num): Num {
  if (a === null || b === null || b === 0) return null;
  return (a / b - 1) * 100;
}

/** 'YYYY-MM-DD' → 그 주 월요일 'YYYY-MM-DD' (UTC 계산이라 시간대 영향 없음) */
export function weekKey(day: string): string {
  const t = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
  const dow = (new Date(t).getUTCDay() + 6) % 7; // 월=0 … 일=6
  return new Date(t - dow * 86400000).toISOString().slice(0, 10);
}

const WEEKS = 8;
const PEAK_LOOKBACK = 12;

/** 주별 마지막 거래일의 days 인덱스와 그 주 거래일 수 */
function weekEnds(days: string[]): { idx: number; count: number }[] {
  const out: { idx: number; count: number }[] = [];
  let prevKey = "";
  for (let i = 0; i < days.length; i++) {
    const k = weekKey(days[i]);
    if (k === prevKey) {
      out[out.length - 1].idx = i;
      out[out.length - 1].count += 1;
    } else {
      out.push({ idx: i, count: 1 });
      prevKey = k;
    }
  }
  return out;
}

function peakIndex(v: Num[] | undefined): number | null {
  if (!v) return null;
  const start = Math.max(0, v.length - PEAK_LOOKBACK);
  let best: number | null = null;
  for (let i = start; i < v.length; i++) {
    const x = v[i];
    if (x === null) continue;
    if (best === null || x > (v[best] as number)) best = i;
  }
  return best;
}

export function computeRotation(input: CoreInput, opt: CoreOptions): RotationResult {
  const { months, monthEnd, days, recent } = input;
  const n = months.length;
  const last = n - 1;
  if (n < 3) throw new Error("월말 자료가 3개월 미만입니다");
  if (days.length < 2) throw new Error("일별 자료가 2일 미만입니다");
  for (const k of opt.order) {
    const m = monthEnd[k];
    if (!m || m.length !== n) throw new Error(`월말 자료 길이가 맞지 않습니다: ${k}`);
    const r = recent[k];
    if (r && r.length !== days.length) throw new Error(`일별 자료 길이가 맞지 않습니다: ${k}`);
  }

  // ── 주간 구간 ──
  const ends = weekEnds(days);
  const use = ends.slice(-(WEEKS + 1)); // 기준점 1개 + 최대 8주
  const baseIdxDay = use.length >= 2 ? use[0].idx : null;
  const bucket = use.slice(1);
  const baseRecent = recent[opt.baseKey];

  const weeklyOf = (k: string): Num[] => {
    const r = recent[k];
    if (!r || baseIdxDay === null) return bucket.map(() => null);
    let prev = baseIdxDay;
    return bucket.map((b) => {
      const v = pct(r[b.idx], r[prev]);
      prev = b.idx;
      return v;
    });
  };
  const baseWeekly = weeklyOf(opt.baseKey);
  const weeks: WeekInfo[] = bucket.map((b, j) => ({
    end: days[b.idx],
    tradingDays: b.count,
    baseDown: baseWeekly[j] !== null && (baseWeekly[j] as number) < 0,
  }));
  const baseDownWeeks = weeks.filter((w) => w.baseDown).length;

  const basePeakIdx = peakIndex(monthEnd[opt.baseKey]);

  // ── 행 ──
  const rows: RotationRow[] = opt.order.map((k) => {
    const m = monthEnd[k];
    const r = recent[k];
    const monthlyRet: Num[] = [];
    for (let i = 1; i < n; i++) monthlyRet.push(pct(m[i], m[i - 1]));
    const pk = peakIndex(m);
    const weekly = weeklyOf(k);
    const hasDaily = !!r && baseIdxDay !== null && r[baseIdxDay] !== null && r[days.length - 1] !== null;
    let ups: number | null = null;
    if (hasDaily) {
      ups = 0;
      weeks.forEach((w, j) => {
        if (w.baseDown && weekly[j] !== null && (weekly[j] as number) > 0) ups = (ups as number) + 1;
      });
    }
    return {
      key: k,
      monthlyRet,
      peakIdx: pk,
      fromPeak: pk === null ? null : pct(m[last], m[pk]),
      preBasePeak: basePeakIdx === null || basePeakIdx < 2 ? null : pct(m[basePeakIdx], m[basePeakIdx - 2]),
      sinceBasePeak: basePeakIdx === null || basePeakIdx === last ? null : pct(m[last], m[basePeakIdx]),
      cum8w: hasDaily ? pct((r as Num[])[days.length - 1], (r as Num[])[baseIdxDay as number]) : null,
      mtd: pct(m[last], m[last - 1]),
      weekly,
      upsOnBaseDown: ups,
    };
  });
  const rowOf = (k: string) => rows.find((x) => x.key === k);

  const baseRow = rowOf(opt.baseKey);
  const marketRow = rowOf(opt.marketKey);
  const baseFalling = baseRow && baseRow.cum8w !== null ? baseRow.cum8w < 0 : null;

  /**
   * 판정
   *  Q1 선행 하락: 대상의 고점 월이 기준 업종의 고점 월보다 앞이면 "예".
   *  Q2 최근 반등: 최근 8주 누적이 플러스면 "예". 마이너스지만 코스피보다 낫면 "시장보다 덜 내림". 아니면 "아니오".
   *  Q3 지속성: 가장 최근 주부터 거슬러, "그 주에 올랐고 기준 업종보다 나았던" 주가 연속 몇 주인가.
   *            2주 이상 "예", 1주 "아직 짧음", 0주 "아니오".
   *  종합: 셋 다 "예" → "확인". Q1 "예" + Q3 1주 이상 + Q2 가 "아니오"가 아님 → "조짐". 그 밖 → "아직 아님".
   */
  const verdicts: Verdict[] = opt.targetKeys.map((k) => {
    const row = rowOf(k);
    const m = monthEnd[k];
    if (!row || !baseRow || row.peakIdx === null || basePeakIdx === null) {
      return { key: k, q1: "자료 없음", q2: "자료 없음", q3: "자료 없음", overall: "자료 없음", leadTargetRet: null, leadBaseRet: null, streak: null };
    }
    const q1: Q1 = row.peakIdx < basePeakIdx ? "예" : row.peakIdx === basePeakIdx ? "같은 달" : "아니오";
    const lead = row.peakIdx < basePeakIdx;
    const leadTargetRet = lead ? pct(m[basePeakIdx], m[row.peakIdx]) : null;
    const leadBaseRet = lead ? pct(monthEnd[opt.baseKey][basePeakIdx], monthEnd[opt.baseKey][row.peakIdx]) : null;

    let q2: Q2 = "자료 없음";
    if (row.cum8w !== null) {
      if (row.cum8w > 0) q2 = "예";
      else if (marketRow && marketRow.cum8w !== null && row.cum8w > marketRow.cum8w) q2 = "시장보다 덜 내림";
      else q2 = "아니오";
    }

    let q3: Q3 = "자료 없음";
    let streak: number | null = null;
    if (row.cum8w !== null && weeks.length > 0) {
      streak = 0;
      for (let j = weeks.length - 1; j >= 0; j--) {
        const a = row.weekly[j];
        const b = baseRow.weekly[j];
        if (a !== null && b !== null && a > 0 && a > b) streak += 1;
        else break;
      }
      q3 = streak >= 2 ? "예" : streak === 1 ? "아직 짧음" : "아니오";
    }

    let overall: Overall = "아직 아님";
    if (q2 === "자료 없음" || q3 === "자료 없음") overall = "자료 없음";
    else if (q1 === "예" && q2 === "예" && q3 === "예") overall = "확인";
    else if (q1 === "예" && (streak ?? 0) >= 1 && q2 !== "아니오") overall = "조짐";
    return { key: k, q1, q2, q3, overall, leadTargetRet, leadBaseRet, streak };
  });

  const risers = rows
    .filter((r) => !opt.indexKeys.includes(r.key) && r.cum8w !== null && r.cum8w > 0)
    .map((r) => ({ key: r.key, cum8w: r.cum8w as number, ups: r.upsOnBaseDown }))
    .sort((a, b) => b.cum8w - a.cum8w);

  // ── 차트 자료 ──
  const s12 = Math.max(0, n - PEAK_LOOKBACK);
  const chart12m = {
    labels: months.slice(s12),
    series: opt.order.map((k) => {
      const m = monthEnd[k];
      const b = m[s12];
      return { key: k, values: m.slice(s12).map((v) => (v === null || b === null || b === 0 ? null : (v / b) * 100)) };
    }),
  };
  const d0 = baseIdxDay ?? 0;
  const chart8w = {
    labels: days.slice(d0),
    series: opt.order
      .filter((k) => !!recent[k])
      .map((k) => {
        const r = recent[k];
        const b = r[d0];
        return { key: k, values: r.slice(d0).map((v) => (v === null || b === null || b === 0 ? null : (v / b) * 100)) };
      }),
  };

  return {
    asOf: days[days.length - 1],
    months,
    rows,
    weeks,
    windowBase: baseIdxDay === null ? null : days[baseIdxDay],
    baseDownWeeks,
    basePeakIdx,
    baseFalling: baseRecent ? baseFalling : null,
    verdicts,
    risers,
    chart12m,
    chart8w,
  };
}

/* ───────────────────────── 일별 자료 → CoreInput ───────────────────────── */

export interface DailyPoint {
  /** 'YYYY-MM-DD' */
  date: string;
  close: number;
}

const MONTHS_SHOWN = 36;
const RECENT_DAYS = 60;

/**
 * 시리즈별 일별 종가(오름차순)를 월말·최근 거래일 표로 바꾼다.
 *  - 거래일 달력은 calendarKey(코스피) 시리즈를 따른다.
 *  - asOf 뒤의 값은 버린다(장중 값이 섞이지 않게 호출 쪽에서 asOf 를 정한다).
 *  - 어떤 날 값이 없으면 그 전 마지막 종가로 채운다(거래가 없던 날 = 값이 안 변한 날).
 *    단, 그 시리즈의 첫 거래일 전은 null 로 둔다(상장 전).
 */
export function toCoreInput(series: Record<string, DailyPoint[]>, calendarKey: string, asOf: string): CoreInput {
  const cal = (series[calendarKey] ?? []).filter((p) => p.date <= asOf).map((p) => p.date);
  if (cal.length < 2) throw new Error("거래일 달력(코스피) 자료가 부족합니다");
  if (cal[cal.length - 1] !== asOf) throw new Error(`기준일 ${asOf} 의 코스피 종가가 없습니다`);

  // 달별 마지막 거래일
  const monthLast = new Map<string, string>();
  for (const d of cal) monthLast.set(d.slice(0, 7), d);
  const allMonths = [...monthLast.keys()].sort();
  const months = allMonths.slice(-MONTHS_SHOWN);
  const days = cal.slice(-RECENT_DAYS);

  const monthEnd: Record<string, Num[]> = {};
  const recent: Record<string, Num[]> = {};
  for (const [key, pts0] of Object.entries(series)) {
    const pts = pts0.filter((p) => p.date <= asOf);
    // date 이하 마지막 종가 (이분 탐색)
    const at = (date: string): Num => {
      let lo = 0;
      let hi = pts.length - 1;
      let ans = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (pts[mid].date <= date) {
          ans = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      return ans < 0 ? null : pts[ans].close;
    };
    monthEnd[key] = months.map((m) => at(monthLast.get(m) as string));
    recent[key] = days.map((d) => at(d));
  }
  return { months, monthEnd, days, recent };
}

/* ───────────────────────── 출발선부터 지금까지 (긴 흐름 차트) ───────────────────────── */

export interface SinceChart {
  /** 0% 로 삼은 날 — baseDate 이하 마지막 거래일. 자료가 baseDate 까지 닿지 않으면 null */
  base: string | null;
  /** 점의 날짜. 첫 점 = base, 그 뒤 주마다 마지막 거래일, 마지막 점 = 기준일 */
  labels: string[];
  /** base 종가 = 100. 소수 둘째 자리까지 */
  series: ChartSeries[];
}

/**
 * 출발선(baseDate)부터 기준일까지의 흐름. 출발선 종가 = 100.
 *  - 거래일 달력은 calendarKey(코스피) 시리즈를 따른다.
 *  - 출발선은 baseDate 이하 마지막 거래일. 달력의 첫 날이 baseDate 보다 뒤면(수집 기간이 못 미치면)
 *    엉뚱한 날을 0% 로 삼지 않도록 base = null 로 돌려준다.
 *  - 점: 출발선 → 그 뒤 주(월~금)마다 마지막 거래일 종가. 마지막 점은 기준일(이번 주의 지금까지 마지막 거래일).
 *  - 어떤 날 값이 없으면 그 전 마지막 종가로 채운다(toCoreInput 과 같은 규칙).
 *  - 출발선 날까지 종가가 한 번도 없던(그 뒤 상장한) 시리즈는 전부 null.
 */
export function buildSinceChart(
  series: Record<string, DailyPoint[]>,
  calendarKey: string,
  baseDate: string,
  asOf: string,
  order: string[]
): SinceChart {
  const cal = (series[calendarKey] ?? []).filter((p) => p.date <= asOf).map((p) => p.date);
  if (cal.length === 0 || cal[0] > baseDate) return { base: null, labels: [], series: [] };
  let base = cal[0];
  for (const d of cal) {
    if (d <= baseDate) base = d;
    else break;
  }
  const labels: string[] = [base];
  let prevKey = "";
  for (const d of cal) {
    if (d <= base) continue;
    const k = weekKey(d);
    if (k === prevKey) labels[labels.length - 1] = d;
    else {
      labels.push(d);
      prevKey = k;
    }
  }
  const out: ChartSeries[] = order.map((key) => {
    const pts = (series[key] ?? []).filter((p) => p.date <= asOf);
    let j = -1;
    const at = (date: string): Num => {
      // labels 가 오름차순이라 앞으로만 움직인다
      while (j + 1 < pts.length && pts[j + 1].date <= date) j += 1;
      return j < 0 ? null : pts[j].close;
    };
    const b = at(base);
    const values = labels.map((d, i) => {
      const v = i === 0 ? b : at(d);
      return v === null || b === null || b === 0 ? null : Math.round((v / b) * 10000) / 100;
    });
    return { key, values };
  });
  return { base, labels, series: out };
}

/* ───────────────────────── 수집 쪽 순수 도우미 (lib/rotation.ts 가 쓴다) ───────────────────────── */

/** Date → KST 'YYYY-MM-DD' */
export function kstDate(d: Date): string {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * 지금 시각 기준으로 "종가가 확정된 마지막 날짜"의 상한.
 * 평일 15:40(KST) 전이면 어제까지, 그 뒤면 오늘까지. (주말·휴일은 그날 자료가 없어 자연히 걸러진다)
 */
export function closedThrough(now: Date): string {
  const k = new Date(now.getTime() + 9 * 3600 * 1000);
  const minutes = k.getUTCHours() * 60 + k.getUTCMinutes();
  const dow = k.getUTCDay(); // 0=일
  const weekday = dow >= 1 && dow <= 5;
  if (weekday && minutes < 15 * 60 + 40) {
    return new Date(k.getTime() - 86400000).toISOString().slice(0, 10);
  }
  return k.toISOString().slice(0, 10);
}

/** 네이버 siseJson — ['날짜','시가','고가','저가','종가','거래량',…]. 응답이 표준 JSON 이 아니라 손으로 다듬는다. */
export function parseSiseJson(text: string): DailyPoint[] {
  const cleaned = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/'/g, '"')
    .trim();
  const parsed = JSON.parse(cleaned) as unknown;
  if (!Array.isArray(parsed)) return [];
  const out: DailyPoint[] = [];
  for (let i = 1; i < parsed.length; i++) {
    const row = parsed[i] as unknown;
    if (!Array.isArray(row) || row.length < 5) continue;
    const raw = String(row[0]).trim();
    const close = Number(row[4]);
    if (!/^\d{8}$/.test(raw) || !Number.isFinite(close) || close <= 0) continue;
    out.push({ date: `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`, close });
  }
  return dedupeSorted(out);
}

export function dedupeSorted(pts: DailyPoint[]): DailyPoint[] {
  const m = new Map<string, number>();
  for (const p of pts) m.set(p.date, p.close);
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, close]) => ({ date, close }));
}

export type CheckStatus = "일치" | "조정 차이" | "불일치" | "대조 못 함";

export interface CrossCheckResult {
  status: CheckStatus;
  /** 두 출처에 모두 있는 날짜 수 */
  compared: number;
  /** 종가 수준이 MISMATCH_PCT 넘게 다른 날짜 수 (분배금 조정 방식 차이도 여기 잡힌다) */
  mismatched: number;
  /** 종가 수준의 가장 큰 차이(%) */
  maxDiffPct: number | null;
  /** 하루 등락률이 RETURN_MISMATCH_PP 넘게 다른 날짜 수 — 실제 가격이 틀린 날 */
  returnMismatched: number;
  /** recentFrom 이후(최근 8주)에서 하루 등락률이 다른 날짜 수 */
  recentMismatched: number;
}

/**
 * 종가 수준 비교 기준(%). 두 출처 모두 분배금 반영 수정주가라 반올림 차이만큼은 허용한다.
 * 예: 7,000원짜리 ETF 에서 1원 차이 = 0.014%.
 */
export const MISMATCH_PCT = 0.1;

/**
 * 하루 등락률 비교 기준(%p).
 * 네이버와 야후는 분배금 조정 계산이 조금 달라(또는 한쪽이 최근 분배금을 늦게 반영해) 오래전 종가 수준이
 * 0.1~0.7% 어긋날 수 있다(2026-11-27 미리보기: 화장품 0.70%, 엔터 0.62%, 은행 0.45%). 이 차이는
 * 분배금 기준일 하루의 등락률에만 나타나고, 크기는 분배금 크기(대개 1% 미만)를 넘지 않는다.
 * 그래서 하루 등락률이 1%p 넘게 다른 날만 "가격이 틀린 날"로 본다.
 */
export const RETURN_MISMATCH_PP = 1;

/**
 * 두 출처의 날짜별 종가를 대조한다.
 *  - 일치: 모든 날의 종가 수준이 0.1% 안
 *  - 조정 차이: 수준은 어긋나지만 하루 등락률은 모든 날 1%p 안 (분배금 조정 방식 차이 — 등락 계산에 사실상 영향 없음)
 *  - 불일치: 하루 등락률이 1%p 넘게 다른 날이 있다 (한쪽 가격이 틀렸을 가능성)
 */
export function crossCheck(a: DailyPoint[], b: DailyPoint[], recentFrom: string): CrossCheckResult {
  const bm = new Map(b.map((p) => [p.date, p.close]));
  let compared = 0;
  let mismatched = 0;
  let returnMismatched = 0;
  let recentMismatched = 0;
  let maxDiff = 0;
  let prevA: number | null = null;
  let prevB: number | null = null;
  for (const p of a) {
    const other = bm.get(p.date);
    if (other === undefined) {
      // 한쪽에만 있는 날을 건너뛰면 다음 날 등락이 이틀치가 되므로 연결을 끊는다
      prevA = null;
      prevB = null;
      continue;
    }
    compared += 1;
    const diff = Math.abs(p.close / other - 1) * 100;
    if (diff > maxDiff) maxDiff = diff;
    if (diff > MISMATCH_PCT) mismatched += 1;
    if (prevA !== null && prevB !== null) {
      const ra = (p.close / prevA - 1) * 100;
      const rb = (other / prevB - 1) * 100;
      if (Math.abs(ra - rb) > RETURN_MISMATCH_PP) {
        returnMismatched += 1;
        if (p.date >= recentFrom) recentMismatched += 1;
      }
    }
    prevA = p.close;
    prevB = other;
  }
  const base = { compared, mismatched, maxDiffPct: compared ? maxDiff : null, returnMismatched, recentMismatched };
  if (compared < 20) return { status: "대조 못 함", ...base };
  const status: CheckStatus = returnMismatched > 0 ? "불일치" : mismatched > 0 ? "조정 차이" : "일치";
  return { status, ...base };
}
