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

/* ────────────────────────────────────────────────────────────
 * SRF(상설 레포 창구) 사용량
 * ──────────────────────────────────────────────────────────── */

/** SRF 판정에 사용할 최근 영업일 수 */
export const SRF_LOOKBACK_DAYS = 10;

/** 최근 창 안에서 사용액이 0보다 큰 날이 이 값 이상이면 "주의" */
export const SRF_WARN_DAYS = 1;

/** 최근 창 안에서 사용액이 0보다 큰 날이 이 값 이상이면 "경고" */
export const SRF_ALERT_DAYS = 3;

/** 이 값(십억 달러) 미만은 창구 점검성 소액으로 보고 사용으로 세지 않는다 */
export const SRF_MIN_USAGE_BILLIONS = 1.0;

export interface SrfPoint {
  /** YYYY-MM-DD */
  date: string;
  /** 하루 사용액, 십억 달러 단위 (FRED 원단위 그대로) */
  usageBillions: number;
}

export interface SrfVerdict {
  status: ObservatoryStatus;
  /** 판정에 쓴 최근 구간 (오래된 → 최신) */
  window: SrfPoint[];
  /** 최근 구간에서 사용액이 SRF_MIN_USAGE_BILLIONS 이상인 날 수 */
  usedDays: number;
  /** 최근 구간에서 가장 큰 하루 사용액 (십억 달러) */
  maxUsage: number;
  /** 최신 관측치 (데이터 없으면 null) */
  latest: SrfPoint | null;
}

/**
 * SRF 사용량 시계열로 현재 상태를 판정한다.
 *
 * 평소에는 아무도 쓰지 않아 0이다. 0에서 벗어나 며칠씩 이어지면
 * 시장에서 돈을 못 구하는 기관이 생겼다는 뜻이므로 단계를 올린다.
 *
 * 다만 몇백만 달러짜리 창구 점검성 거래가 상시 찍히기 때문에,
 * SRF_MIN_USAGE_BILLIONS 미만은 사용으로 세지 않는다.
 * (이 걸러내기가 없으면 지표가 상시 경고로 붙박여 진짜 사건과 구분되지 않는다)
 *
 * - 경고: 최근 구간에서 유의미한 사용일이 SRF_ALERT_DAYS 이상
 * - 주의: 최근 구간에서 유의미한 사용일이 SRF_WARN_DAYS 이상
 * - 정상: 그 밖 (소액 거래만 있거나 내내 0)
 *
 * @param series 날짜 오름차순으로 정렬된 사용량 시계열
 */
export function evaluateSrf(series: SrfPoint[]): SrfVerdict {
  const window = series.slice(-SRF_LOOKBACK_DAYS);
  const latest = series.length > 0 ? series[series.length - 1] : null;

  const usedDays = window.filter(
    (p) => p.usageBillions >= SRF_MIN_USAGE_BILLIONS
  ).length;
  const maxUsage = window.reduce((mx, p) => Math.max(mx, p.usageBillions), 0);

  let status: ObservatoryStatus = "normal";
  if (usedDays >= SRF_ALERT_DAYS) {
    status = "warning";
  } else if (usedDays >= SRF_WARN_DAYS) {
    status = "caution";
  }

  return { status, window, usedDays, maxUsage, latest };
}

/* ────────────────────────────────────────────────────────────
 * 재할인 창구 대출 잔액 (Discount Window Primary Credit)
 * ──────────────────────────────────────────────────────────── */

/** 이 값(십억 달러) 이상이면 "주의". 미만이면 평시로 본다 */
export const DW_CAUTION_BILLIONS = 10;

/** 이 값(십억 달러)을 넘으면 "경보" */
export const DW_ALERT_BILLIONS = 50;

/** 전주 대비 이 배수 이상 늘면 잔액이 적어도 "주의" */
export const DW_SURGE_MULTIPLE = 2;

/**
 * 급증 룰을 적용할 최소 전주 잔액 (십억 달러).
 *
 * 분모가 작으면 2배가 아무 의미도 없다. 실제로 2010년 이후 165주가
 * 0.001 → 0.057십억(=100만 → 5700만 달러) 같은 잡음으로 급증 판정에
 * 걸린다. 이 지표의 값어치는 "가짜 양성이 없는 경보"라는 데 있으므로,
 * 전주 잔액이 이 값 미만이면 배수는 계산만 하고 판정에는 쓰지 않는다.
 *
 * 하한을 최신값이 아니라 **전주(분모)** 에 거는 이유: 잡음의 원인이
 * 작은 분모이기 때문이다. 최신값에 걸면 0.9 → 1.9 같은 잡음이 그대로
 * 통과한다. (SRF 의 SRF_MIN_USAGE_BILLIONS 와 같은 성격의 잡음 바닥)
 */
export const DW_SURGE_MIN_BILLIONS = 1.0;

/**
 * 최신 기준일이 이 일수보다 오래됐으면 "데이터 지연"으로 표시한다.
 *
 * 주간(수요일 기준) 시리즈라 평시에도 최신값이 최대 7일 전이다.
 * 14일은 발표를 한 번 통째로 놓쳤다는 뜻이므로 그때만 지연으로 본다.
 * (7일로 잡으면 목요일 발표 직전마다 매번 지연으로 뜬다)
 */
export const DW_STALE_DAYS = 14;

/** 2023년 3월 은행 사태 때의 피크. 차트 참고선 눈금으로 쓴다 (십억 달러) */
export const DW_PEAK_2023_BILLIONS = 152.85;

/** 위 피크가 찍힌 기준일 */
export const DW_PEAK_2023_DATE = "2023-03-15";

export interface DiscountWindowPoint {
  /** YYYY-MM-DD — 수요일 기준일 */
  date: string;
  /**
   * 잔액, 십억 달러 단위.
   * FRED 원본(WLCFLPCL)은 백만 달러라 수집 단계에서 이미 ÷1000 한 값이다.
   * 조회·차트에서 다시 변환하지 말 것.
   */
  balanceBillions: number;
}

export interface DiscountWindowVerdict {
  status: ObservatoryStatus;
  /** 최신 관측치 (데이터 없으면 null) */
  latest: DiscountWindowPoint | null;
  /** 직전 주 관측치 (데이터 부족하면 null) */
  previous: DiscountWindowPoint | null;
  /** 전주 대비 배수. 전주가 0이거나 데이터가 부족하면 null */
  weekOverWeekMultiple: number | null;
  /**
   * 급증으로 판정했는지.
   * 전주 잔액이 DW_SURGE_MIN_BILLIONS 이상이면서 DW_SURGE_MULTIPLE 배 이상 늘었을 때만 true.
   * (배수 자체는 weekOverWeekMultiple 에 그대로 담기므로 화면에는 계속 표시된다)
   */
  surged: boolean;
}

/**
 * 기준일이 오늘로부터 며칠 전인지 (UTC 날짜 기준).
 * 날짜를 못 읽으면 무한대를 반환해 "지연"으로 판정되게 한다.
 */
export function daysSinceObservation(dateStr: string, now: Date = new Date()): number {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return Number.POSITIVE_INFINITY;
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((todayUtc - d.getTime()) / 86_400_000);
}

/**
 * 재할인 창구 잔액 시계열로 현재 상태를 판정한다.
 *
 * 이 창구는 "낙인(stigma)" 때문에 평시엔 은행들이 쓰기를 꺼린다.
 * 그래서 잔액이 뛰었다는 건 낙인을 감수할 만큼 급했다는 뜻이고,
 * 가짜 양성이 거의 없는 신호다.
 *
 * - 경보: 최신 잔액 > DW_ALERT_BILLIONS
 * - 주의: 최신 잔액 >= DW_CAUTION_BILLIONS, 또는 전주 대비 DW_SURGE_MULTIPLE 배 이상 급증
 *         (급증 룰은 전주 잔액이 DW_SURGE_MIN_BILLIONS 이상일 때만 적용)
 * - 정상: 그 밖
 *
 * 주간 데이터라 SOFR·SRF 처럼 "최근 N영업일 중 며칠" 식으로 세지 않는다.
 * 최근 창을 10주로 잡으면 두 달 반 전 사건이 지금 상태로 남아버린다.
 * 대신 최신값과 직전 주 한 쌍만 본다.
 *
 * @param series 날짜 오름차순으로 정렬된 잔액 시계열
 */
export function evaluateDiscountWindow(
  series: DiscountWindowPoint[]
): DiscountWindowVerdict {
  const latest = series.length > 0 ? series[series.length - 1] : null;
  const previous = series.length > 1 ? series[series.length - 2] : null;

  // 전주가 0이면 배수가 무한대가 되므로 급증 판정에서 뺀다
  const weekOverWeekMultiple =
    latest && previous && previous.balanceBillions > 0
      ? latest.balanceBillions / previous.balanceBillions
      : null;

  // 잡음 바닥: 전주 잔액이 너무 작으면 배수는 계산해도 판정에는 쓰지 않는다
  const surged =
    weekOverWeekMultiple !== null &&
    weekOverWeekMultiple >= DW_SURGE_MULTIPLE &&
    (previous?.balanceBillions ?? 0) >= DW_SURGE_MIN_BILLIONS;

  let status: ObservatoryStatus = "normal";
  if (latest) {
    if (latest.balanceBillions > DW_ALERT_BILLIONS) {
      status = "warning";
    } else if (latest.balanceBillions >= DW_CAUTION_BILLIONS || surged) {
      status = "caution";
    }
  }

  return { status, latest, previous, weekOverWeekMultiple, surged };
}
