/**
 * 관측소 — SOFR−IORB 스프레드 경고 임계값 및 판정 로직
 *
 * 임계값을 여기 한 곳에 모아두고, 판정 함수도 같이 둔다.
 * (임계값과 판정이 떨어져 있으면 한쪽만 고쳤을 때 조용히 어긋난다)
 */

/** 판정에 사용할 최근 영업일 수 */
export const POSITIVE_DAYS_WINDOW = 10;

/** 최근 창(window) 안에서 스프레드가 양수인 날이 이 값 이상이면 "주의" */
export const POSITIVE_DAYS_THRESHOLD = 5;

/** 스프레드가 이 값(bp) 이상이면 급등 후보 */
export const SPIKE_THRESHOLD_BP = 10;

/** 각 월의 마지막 N영업일은 급등 판정에서 제외 (월말·분기말 자금 수요는 정상 현상) */
export const MONTH_END_EXCLUDE_DAYS = 3;

export type ObservatoryStatus = "normal" | "caution" | "warning";

export interface SofrIorbPoint {
  /** YYYY-MM-DD */
  date: string;
  /** SOFR, % 단위 */
  sofr: number;
  /** IORB, % 단위 */
  iorb: number;
  /** (SOFR − IORB) × 100, bp 단위 */
  spreadBp: number;
}

export interface SofrIorbVerdict {
  status: ObservatoryStatus;
  /** 판정에 쓴 최근 구간 (오래된 → 최신) */
  window: SofrIorbPoint[];
  /** 최근 구간에서 스프레드가 양수(>0)인 날 수 */
  positiveDays: number;
  /** 최근 구간에서 월말 제외일이 아닌데 급등한 날짜들 */
  spikeDates: string[];
  /** 최신 관측치 (데이터 없으면 null) */
  latest: SofrIorbPoint | null;
}

/**
 * 해당 날짜가 그 달의 마지막 MONTH_END_EXCLUDE_DAYS 영업일에 속하는지.
 *
 * 달력 기준(월~금)으로 계산한다. 미국 공휴일은 반영하지 않으므로
 * 마지막 영업일이 공휴일이면 창이 하루 어긋날 수 있다 — 월말 급등을
 * 놓치는 쪽이 아니라 하루 더 보수적으로 제외하는 쪽이라 판정이 과하게
 * 민감해지지는 않는다.
 */
export function isMonthEndExcluded(date: string): boolean {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;

  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();

  // 그 달 마지막 날부터 거꾸로 올라가며 평일만 모은다
  const lastBusinessDays: string[] = [];
  const cursor = new Date(Date.UTC(year, month + 1, 0)); // 해당 월 마지막 날
  while (
    cursor.getUTCMonth() === month &&
    lastBusinessDays.length < MONTH_END_EXCLUDE_DAYS
  ) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      lastBusinessDays.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return lastBusinessDays.includes(date);
}

/**
 * 스프레드 시계열로 현재 상태를 판정한다.
 *
 * - 경고: 최근 구간에서 월말 제외일이 아닌 날에 +SPIKE_THRESHOLD_BP 이상 급등
 * - 주의: 최근 구간에서 양수인 날이 POSITIVE_DAYS_THRESHOLD 이상
 * - 정상: 둘 다 아님
 *
 * @param series 날짜 오름차순으로 정렬된 스프레드 시계열
 */
export function evaluateSofrIorb(series: SofrIorbPoint[]): SofrIorbVerdict {
  const window = series.slice(-POSITIVE_DAYS_WINDOW);
  const latest = series.length > 0 ? series[series.length - 1] : null;

  const positiveDays = window.filter((p) => p.spreadBp > 0).length;

  const spikeDates = window
    .filter((p) => p.spreadBp >= SPIKE_THRESHOLD_BP && !isMonthEndExcluded(p.date))
    .map((p) => p.date);

  let status: ObservatoryStatus = "normal";
  if (spikeDates.length > 0) {
    status = "warning";
  } else if (positiveDays >= POSITIVE_DAYS_THRESHOLD) {
    status = "caution";
  }

  return { status, window, positiveDays, spikeDates, latest };
}
