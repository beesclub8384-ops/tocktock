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

/* ────────────────────────────────────────────────────────────
 * 역레포(RRP) 잔액 — Overnight Reverse Repo
 *
 * ⚠ 방향이 반대인 지표다. 다른 관측소 지표는 "값이 크면 위험" 이지만
 *   RRP 는 시스템의 여유 현금 쿠션이라 **값이 작을수록 위험**하다.
 *   임계값 비교 부등호를 다른 지표에서 복사해 오면 조용히 뒤집힌다.
 * ──────────────────────────────────────────────────────────── */

/** 이 값(십억 달러)을 넘으면 쿠션이 넉넉하다고 본다 */
export const RRP_NORMAL_BILLIONS = 100;

/** 이 값(십억 달러) 밑으로 내려가면 쿠션이 사실상 소진된 것으로 본다 */
export const RRP_ALERT_BILLIONS = 10;

/** 2022년 말 정점 (십억 달러). 차트에서 지금 수준을 견주는 눈금 */
export const RRP_PEAK_2022_BILLIONS = 2553.7;

/** 위 정점이 찍힌 날 */
export const RRP_PEAK_2022_DATE = "2022-12-30";

/**
 * 일간 시리즈라 주말·공휴일을 넘겨도 5일이면 새 값이 있어야 한다.
 * 그보다 오래되면 FRED 갱신이 막힌 것으로 보고 "데이터 지연" 을 표시한다.
 */
export const RRP_STALE_DAYS = 5;

export interface RrpPoint {
  /** YYYY-MM-DD */
  date: string;
  /** 잔액, 십억 달러 (FRED 원단위 그대로 — RRPONTSYD 는 billions 로 온다) */
  balanceBillions: number;
}

export interface RrpVerdict {
  status: ObservatoryStatus;
  /** 최신 관측치 (데이터 없으면 null) */
  latest: RrpPoint | null;
  /** 직전 영업일 관측치 (데이터 부족하면 null) */
  previous: RrpPoint | null;
  /** 최신값이 2022년 정점 대비 몇 %인지 (데이터 없으면 null) */
  pctOfPeak: number | null;
}

/**
 * RRP 잔액으로 현재 상태를 판정한다.
 *
 * MMF(머니마켓펀드)가 굴릴 데 없는 돈을 연준에 하룻밤 맡겨두는 곳이다.
 * 여기 돈이 쌓여 있다는 건 시스템에 남는 현금이 있다는 뜻이고,
 * 이 잔액이 마르면 다음에 빠지는 건 은행 지급준비금 본체다.
 *
 * - 정상: 잔액 > RRP_NORMAL_BILLIONS
 * - 주의: RRP_ALERT_BILLIONS ~ RRP_NORMAL_BILLIONS
 * - 경보: 잔액 < RRP_ALERT_BILLIONS (쿠션 사실상 소진)
 *
 * ⚠ 2026년 현재 이 지표는 경보가 정상 상태다. 2023~2024년에 걸쳐 쿠션이
 *   다 빠졌고 그 뒤로 0 부근에 붙어 있다. 첫 화면부터 빨간불인 건 버그가 아니다.
 *
 * @param series 날짜 오름차순으로 정렬된 잔액 시계열
 */
export function evaluateRrp(series: RrpPoint[]): RrpVerdict {
  const latest = series.length > 0 ? series[series.length - 1] : null;
  const previous = series.length > 1 ? series[series.length - 2] : null;

  let status: ObservatoryStatus = "normal";
  if (latest) {
    // 부등호 방향 주의 — 작을수록 위험하다
    if (latest.balanceBillions < RRP_ALERT_BILLIONS) {
      status = "warning";
    } else if (latest.balanceBillions <= RRP_NORMAL_BILLIONS) {
      status = "caution";
    }
  }

  const pctOfPeak = latest
    ? (latest.balanceBillions / RRP_PEAK_2022_BILLIONS) * 100
    : null;

  return { status, latest, previous, pctOfPeak };
}

/* ────────────────────────────────────────────────────────────
 * 지급준비금 총량 — Reserve Balances
 *
 * RRP 와 같이 값이 작을수록 위험한 방향의 지표다.
 * ──────────────────────────────────────────────────────────── */

/** 이 값(십억 달러)을 넘으면 연료가 넉넉하다고 본다 */
export const RESERVES_NORMAL_BILLIONS = 2800;

/** 이 값(십억 달러) 밑으로 내려가면 경보 */
export const RESERVES_ALERT_BILLIONS = 2300;

/**
 * 2019년 9월 레포 발작 당시 지급준비금 수준 (십억 달러).
 *
 * 실측 저점은 2019-09-18 주의 1,394.1십억이다. 차트 참고선은 읽기 쉽게 1,400 으로 둔다.
 * "충분(ample)" 의 정확한 바닥은 아무도 모른다 — 그때 저 수준에서 터졌다는
 * 사실만 알 뿐이고, 경제 규모가 커진 지금은 그 바닥도 올라와 있다.
 */
export const RESERVES_2019_CRISIS_BILLIONS = 1400;

/** 위 수준이 관측된 주 (2019년 레포 발작 직전 저점) */
export const RESERVES_2019_CRISIS_DATE = "2019-09-18";

/**
 * 주간(수요일 기준) 시리즈다. 재할인 창구와 같은 주기라 같은 지연 기준을 쓴다.
 * 평시에도 최신값이 최대 7일 전이므로, 14일이 넘어야 발표를 놓친 것으로 본다.
 */
export const RESERVES_STALE_DAYS = 14;

export interface ReservesPoint {
  /** YYYY-MM-DD — 수요일 기준일 */
  date: string;
  /**
   * 총량, 십억 달러 단위.
   * FRED 원본(WRESBAL)은 백만 달러라 수집 단계에서 이미 ÷1000 한 값이다.
   * 조회·차트에서 다시 변환하지 말 것.
   */
  balanceBillions: number;
}

export interface ReservesVerdict {
  status: ObservatoryStatus;
  /** 최신 관측치 (데이터 없으면 null) */
  latest: ReservesPoint | null;
  /** 직전 주 관측치 (데이터 부족하면 null) */
  previous: ReservesPoint | null;
  /** 전주 대비 증감 (십억 달러). 데이터 부족하면 null */
  weekOverWeekChange: number | null;
  /** 2019년 발작 수준 대비 배수 (데이터 없으면 null) */
  multipleOf2019: number | null;
}

/**
 * 지급준비금 총량으로 현재 상태를 판정한다.
 *
 * 미국 은행 전체가 연준 계좌에 가진 돈의 총합이다. 시스템이 굴러가는
 * 연료의 총량이고, RRP 쿠션이 소진된 지금 시장이 가장 긴장하며 보는 숫자다.
 *
 * - 정상: 총량 > RESERVES_NORMAL_BILLIONS
 * - 주의: RESERVES_ALERT_BILLIONS ~ RESERVES_NORMAL_BILLIONS
 * - 경보: 총량 < RESERVES_ALERT_BILLIONS
 *
 * ⚠ 임계값은 보수적 추정치다. "충분(ample)" 의 정확한 바닥은 아무도 모른다.
 *   2019년엔 1,400십억에서 발작이 터졌지만, 경제 규모가 커진 지금은 그 바닥도
 *   올라와 있다. 이 숫자를 정답으로 읽지 말 것.
 *
 * @param series 날짜 오름차순으로 정렬된 총량 시계열
 */
export function evaluateReserves(series: ReservesPoint[]): ReservesVerdict {
  const latest = series.length > 0 ? series[series.length - 1] : null;
  const previous = series.length > 1 ? series[series.length - 2] : null;

  let status: ObservatoryStatus = "normal";
  if (latest) {
    // 부등호 방향 주의 — 작을수록 위험하다
    if (latest.balanceBillions < RESERVES_ALERT_BILLIONS) {
      status = "warning";
    } else if (latest.balanceBillions <= RESERVES_NORMAL_BILLIONS) {
      status = "caution";
    }
  }

  const weekOverWeekChange =
    latest && previous
      ? Math.round((latest.balanceBillions - previous.balanceBillions) * 10) / 10
      : null;

  const multipleOf2019 = latest
    ? latest.balanceBillions / RESERVES_2019_CRISIS_BILLIONS
    : null;

  return { status, latest, previous, weekOverWeekChange, multipleOf2019 };
}

/* ────────────────────────────────────────────────────────────
 * 채권 미실현손실 비율 (관측소 2 — 은행)
 *
 * 은행이 보유한 채권 중 아직 팔지 않아 장부에 손실로 잡히지 않은 부분
 * ("유령 손실")을 자기자본으로 나눈 값이다.
 *
 * ⚠ 앞의 다섯 지표와 성격이 다르다.
 *   - 출처가 FRED 가 아니라 FDIC 분기 은행실적보고서(QBP)다
 *   - 일간/주간이 아니라 **분기** 데이터이고 발표 시차가 약 2개월이다
 *   그래서 "며칠째 이어지는가" 같은 판정을 쓰지 않고 최신 분기 값 하나로 본다.
 * ──────────────────────────────────────────────────────────── */

/** 이 비율(%) 미만이면 정상 */
export const UL_CAUTION_PCT = 10;

/** 이 비율(%)을 넘으면 경보 */
export const UL_ALERT_PCT = 20;

/**
 * 실측 정점 — 2022년 3분기 (%).
 *
 * ⚠ SVB 파산은 2023년 1분기(2023-03)인데 유령 손실의 정점은 그보다 **두 분기
 *   앞선** 2022Q3 이었다. 은행이 먼저 곪고 나서 사건이 터졌다는 뜻이라,
 *   이 지표가 선행지표라는 근거가 된다. 차트에 둘 다 표시한다.
 */
export const UL_PEAK_PCT = 31.8;

/** 위 정점이 찍힌 분기 */
export const UL_PEAK_QUARTER = "2022Q3";

/** SVB 파산이 일어난 분기 (사건 마커) */
export const UL_SVB_QUARTER = "2023Q1";

export interface UnrealizedLossPoint {
  /** "2026Q2" 형식 */
  quarter: string;
  /** 분기 말일 YYYY-MM-DD (차트 정렬·표시용) */
  quarterEnd: string;
  /** AFS 미실현손익, 십억 달러 (손실이면 음수 — 원본 부호 그대로) */
  afsBillions: number;
  /** HTM 미실현손익, 십억 달러 (손실이면 음수 — 원본 부호 그대로) */
  htmBillions: number;
  /** 유령 손실 총액, 십억 달러 (손실분만 절댓값으로 합산 — 항상 0 이상) */
  ghostBillions: number;
  /** 자기자본(Total equity capital), 십억 달러 */
  equityBillions: number;
  /** 유령 손실 ÷ 자기자본 × 100 (%) */
  ratioPct: number;
}

export interface UnrealizedLossVerdict {
  status: ObservatoryStatus;
  /** 최신 분기 (데이터 없으면 null) */
  latest: UnrealizedLossPoint | null;
  /** 직전 분기 (데이터 부족하면 null) */
  previous: UnrealizedLossPoint | null;
  /** 최신값이 2022Q3 정점 대비 몇 %인지 (데이터 없으면 null) */
  pctOfPeak: number | null;
}

/**
 * 유령 손실 총액을 구한다 — 손실인 쪽만 절댓값으로 합산한다.
 *
 * AFS 나 HTM 이 **이익**(양수)이면 0으로 처리한다. 이익을 손실에서 빼면
 * "한쪽이 이익이라 괜찮다"는 그림이 되는데, 뱅크런 상황에서 실제로 문제가 되는
 * 건 손실 쪽 자산을 팔아야 한다는 사실이라 상계가 성립하지 않는다.
 *
 * @param afsBillions AFS 미실현손익 (십억 달러, 손실이면 음수)
 * @param htmBillions HTM 미실현손익 (십억 달러, 손실이면 음수)
 * @returns 유령 손실 총액 (십억 달러, 항상 0 이상)
 */
export function ghostLossBillions(afsBillions: number, htmBillions: number): number {
  return Math.abs(Math.min(afsBillions, 0)) + Math.abs(Math.min(htmBillions, 0));
}

/**
 * 채권 미실현손실 비율로 현재 상태를 판정한다.
 *
 * - 정상: 비율 < UL_CAUTION_PCT
 * - 주의: UL_CAUTION_PCT ~ UL_ALERT_PCT
 * - 경보: 비율 > UL_ALERT_PCT
 *
 * ⚠ 2026년 현재 값은 12% 대라 **주의(노랑)가 정상 상태**다. 첫 화면부터
 *   노란불인 건 버그가 아니다. 2022~2023년의 30% 대에서 내려온 자리다.
 *
 * @param series 분기 오름차순으로 정렬된 시계열
 */
export function evaluateUnrealizedLosses(
  series: UnrealizedLossPoint[]
): UnrealizedLossVerdict {
  const latest = series.length > 0 ? series[series.length - 1] : null;
  const previous = series.length > 1 ? series[series.length - 2] : null;

  let status: ObservatoryStatus = "normal";
  if (latest) {
    if (latest.ratioPct > UL_ALERT_PCT) {
      status = "warning";
    } else if (latest.ratioPct >= UL_CAUTION_PCT) {
      status = "caution";
    }
  }

  const pctOfPeak = latest ? (latest.ratioPct / UL_PEAK_PCT) * 100 : null;

  return { status, latest, previous, pctOfPeak };
}

/* ────────────────────────────────────────────────────────────
 * FHLB(연방주택대출은행) 차입 잔액 (관측소 2 — 은행)
 *
 * 은행들이 연준 창구보다 먼저, 낙인 없이 조용히 쓰는 자금줄이다.
 * 재할인 창구는 "저기가 급하다"는 소문이 나서 평시엔 아무도 안 쓰지만,
 * FHLB 는 평상시에도 쓰는 곳이라 급할 때 먼저 손이 간다.
 * 그래서 연준 창구(관측소 1 ⑤)보다 **앞서** 움직인다.
 *
 * ⚠ 채권 미실현손실과 같은 분기 지표다. 레벨 자체는 은행 자산 규모를 따라
 *   추세적으로 커지므로, 절대 금액이 아니라 **전분기 대비 증가율**로 본다.
 * ──────────────────────────────────────────────────────────── */

/** 전분기 대비 이 증가율(%) 이상이면 "주의" */
export const FHLB_WARN_QOQ_PCT = 15;

/** 전분기 대비 이 증가율(%) 이상이면 "경보" */
export const FHLB_ALERT_QOQ_PCT = 30;

export interface FhlbPoint {
  /** "2023Q1" 형식 */
  quarter: string;
  /** FHLB 차입(Advances) 잔액, 십억 달러 (FRED 원단위는 백만이라 1000으로 나눈 값) */
  advancesBillions: number;
  /**
   * 전분기 대비 증가율 (%).
   *
   * ⚠ 직전 관측치가 **바로 앞 분기가 아닐 때는 null** 이다.
   *   1946~1951 구간은 연간 집계만 있어 Q1~Q3 가 비어 있는데, 그 구멍을 건너뛴
   *   채로 증가율을 내면 1년치 변화가 "전분기 대비" 로 둔갑한다.
   */
  qoqChangePct: number | null;
}

export interface FhlbVerdict {
  status: ObservatoryStatus;
  /** 최신 분기 (데이터 없으면 null) */
  latest: FhlbPoint | null;
  /** 직전 분기 (데이터 부족하면 null) */
  previous: FhlbPoint | null;
}

/**
 * FHLB 차입 잔액의 전분기 대비 증가율로 현재 상태를 판정한다.
 *
 * - 정상: 증가율 < FHLB_WARN_QOQ_PCT
 * - 주의: FHLB_WARN_QOQ_PCT ~ FHLB_ALERT_QOQ_PCT
 * - 경보: FHLB_ALERT_QOQ_PCT 이상
 *
 * 증가율이 null(구멍 뒤 첫 분기)이면 판정하지 않고 정상으로 둔다 — 값을
 * 모른다고 경보를 켜면 1950년대 구간이 통째로 빨간불이 된다.
 *
 * ⚠ **줄어드는 쪽은 보지 않는다.** 잔액이 급감하는 건 위기가 지나가고 은행이
 *   빌린 돈을 갚았다는 뜻이라(2020Q2 −31%, 2023Q2 −18%) 경보 대상이 아니다.
 *
 * @param series 분기 오름차순으로 정렬된 시계열
 */
export function evaluateFhlb(series: FhlbPoint[]): FhlbVerdict {
  const latest = series.length > 0 ? series[series.length - 1] : null;
  const previous = series.length > 1 ? series[series.length - 2] : null;

  let status: ObservatoryStatus = "normal";
  const qoq = latest?.qoqChangePct;
  if (typeof qoq === "number") {
    if (qoq >= FHLB_ALERT_QOQ_PCT) {
      status = "warning";
    } else if (qoq >= FHLB_WARN_QOQ_PCT) {
      status = "caution";
    }
  }

  return { status, latest, previous };
}

/* ────────────────────────────────────────────────────────────
 * 예금 유출 (관측소 2 — 은행)
 *
 * 두 가지를 같이 본다. 성격이 달라 한 숫자로 합치지 않는다.
 *   주간: 소형 은행 예금이 대형으로 옮겨가는 흐름 (매주 갱신)
 *   분기: 예금 중 보험으로 보호되지 않는 돈의 비중 (분기에 한 번)
 *
 * 예금이 "어디서 빠져 어디로 가는가"와 "그 돈이 얼마나 도망가기 쉬운가"는
 * 다른 질문이다. 앞은 지금 벌어지는 일이고, 뒤는 터졌을 때의 화력이다.
 * ──────────────────────────────────────────────────────────── */

/**
 * 주간 — 소형 은행 예금 비중의 **1주 변화**(%p)가 이 값 이하면 "주의".
 *
 * 부호 주의: 비중이 **줄어드는** 쪽이 위험이라 음수다.
 */
export const DF_WARN_WEEKLY_PP = -0.4;

/** 주간 — 1주 변화(%p)가 이 값 이하면 "경보" */
export const DF_ALERT_WEEKLY_PP = -0.7;

/**
 * 분기 — 무보험 예금 비중(%)이 이 값 이상이면 "주의".
 *
 * 이쪽은 높을수록 위험이라 양수다 (주간과 부호 방향이 반대다).
 */
export const DF_WARN_UNINSURED_PCT = 43;

/** 분기 — 무보험 예금 비중(%)이 이 값 이상이면 "경보" */
export const DF_ALERT_UNINSURED_PCT = 45;

export interface DepositFlightWeeklyPoint {
  /** 관측 주의 수요일 YYYY-MM-DD */
  date: string;
  /** 소형 국내 상업은행 예금, 십억 달러 */
  smallBillions: number;
  /** 대형 국내 상업은행 예금, 십억 달러 */
  largeBillions: number;
  /** 소형 은행이 차지하는 비중 (%) = 소형 / (소형 + 대형) */
  smallSharePct: number;
  /**
   * 직전 주 대비 비중 변화 (%p). 음수면 소형에서 대형으로 옮겨간 것이다.
   *
   * ⚠ 직전 관측이 **바로 앞 주가 아닐 때는 null**. 주간 시리즈라 구멍이
   *   거의 없지만, 구멍을 건너뛴 채 계산하면 여러 주의 변화가 "1주 변화" 로
   *   둔갑한다 (FHLB 분기 구멍과 같은 함정).
   */
  weeklyChangePp: number | null;
}

export interface DepositFlightQuarterlyPoint {
  /** "2026Q2" 형식 */
  quarter: string;
  /** 국내 사무소 예금(Domestic office deposits), 십억 달러 */
  domesticDepositsBillions: number;
  /** 추정 보험예금(Estimated insured deposits), 십억 달러 */
  insuredDepositsBillions: number;
  /** 무보험 예금 비중 (%) = (1 − 보험예금 / 국내예금) × 100 */
  uninsuredSharePct: number;
}

export interface DepositFlightVerdict {
  /** 둘 중 더 나쁜 쪽 */
  status: ObservatoryStatus;
  /** 주간 파트 판정 */
  weeklyStatus: ObservatoryStatus;
  /** 분기 파트 판정 */
  quarterlyStatus: ObservatoryStatus;
  latestWeekly: DepositFlightWeeklyPoint | null;
  latestQuarterly: DepositFlightQuarterlyPoint | null;
}

/**
 * 주간 파트 판정 — 소형 은행 예금 비중이 얼마나 빠르게 빠지는가.
 *
 * ⚠ 방향이 한쪽이다. 비중이 **늘어나는** 것은 경보 대상이 아니다
 *   (대형에서 소형으로 돌아오는 것은 진정 국면이다).
 * 변화가 null(구멍 뒤 첫 주)이면 판정하지 않고 정상으로 둔다.
 */
export function evaluateDepositFlightWeekly(
  series: DepositFlightWeeklyPoint[]
): ObservatoryStatus {
  const latest = series.length > 0 ? series[series.length - 1] : null;
  const change = latest?.weeklyChangePp;
  if (typeof change !== "number") return "normal";
  // 부등호 방향 주의 — 더 음수일수록 나쁘다
  if (change <= DF_ALERT_WEEKLY_PP) return "warning";
  if (change <= DF_WARN_WEEKLY_PP) return "caution";
  return "normal";
}

/**
 * 분기 파트 판정 — 예금 중 보험 밖에 있는 돈이 얼마나 되는가.
 *
 * 보험 한도 밖의 예금은 사고가 나면 가장 먼저 빠져나간다. 비중이 높을수록
 * 뱅크런이 터졌을 때의 화력이 크다는 뜻이라, 높은 쪽이 위험이다.
 */
export function evaluateDepositFlightQuarterly(
  series: DepositFlightQuarterlyPoint[]
): ObservatoryStatus {
  const latest = series.length > 0 ? series[series.length - 1] : null;
  if (!latest) return "normal";
  if (latest.uninsuredSharePct >= DF_ALERT_UNINSURED_PCT) return "warning";
  if (latest.uninsuredSharePct >= DF_WARN_UNINSURED_PCT) return "caution";
  return "normal";
}

/**
 * 예금 유출 종합 판정 — 주간·분기 중 더 나쁜 쪽을 따른다.
 *
 * 둘은 서로 다른 것을 재므로 평균 내지 않는다. 한쪽만 켜져도 볼 이유가 있다.
 */
export function evaluateDepositFlight(
  weekly: DepositFlightWeeklyPoint[],
  quarterly: DepositFlightQuarterlyPoint[]
): DepositFlightVerdict {
  const weeklyStatus = evaluateDepositFlightWeekly(weekly);
  const quarterlyStatus = evaluateDepositFlightQuarterly(quarterly);

  const severity: Record<ObservatoryStatus, number> = {
    normal: 0,
    caution: 1,
    warning: 2,
  };
  const status =
    severity[weeklyStatus] >= severity[quarterlyStatus]
      ? weeklyStatus
      : quarterlyStatus;

  return {
    status,
    weeklyStatus,
    quarterlyStatus,
    latestWeekly: weekly.length > 0 ? weekly[weekly.length - 1] : null,
    latestQuarterly: quarterly.length > 0 ? quarterly[quarterly.length - 1] : null,
  };
}

/* ────────────────────────────────────────────────────────────
 * CRE(상업용 부동산) 익스포저 (관측소 2 — 은행)
 *
 * 조사에서 확인된 그림이 통념과 다르다. 두 가지를 갈라서 본다.
 *   아픈 정도 = 임대용 비주거 CRE 연체율 — 대형은행이 더 높다
 *   물린 양   = 자산 규모별 CRE 집중도 — 지역은행이 압도적으로 높다
 *
 * ⚠ 오피스만 뗀 공개 통계는 없다. 콜리포트가 물건 유형(오피스/리테일/산업)
 *   으로 나누지 않기 때문이다. 대신 비주거 상업용을 **자가사용 / 임대용**
 *   으로 가른 분류를 쓴다. 임대용(Other, non-owner-occupied)이 투자 목적
 *   부동산이라 오피스에 가장 가까운 공개 대용치다.
 *
 * ⚠ "2026~27 만기 벽" 도 쓰지 않는다. MBA 연례 설문과 Trepp 이 출처인데
 *   시계열로 공개되지 않는다. 만기 벽의 예상 대신 그 **결과**인 연체율
 *   추이를 본다.
 * ──────────────────────────────────────────────────────────── */

/** 임대용 CRE 연체율(%)이 이 값 이상이면 "주의" */
export const CRE_WARN_DELINQ_PCT = 1.5;

/** 임대용 CRE 연체율(%)이 이 값 이상이면 "경보" */
export const CRE_ALERT_DELINQ_PCT = 2.5;

/**
 * 전년 동기 대비 연체율 상승폭(%p)이 이 값 이상이면 "주의".
 *
 * 수준만 보면 늦는다. 2024년 초 지역은행 CRE 충격 때 수준은 1.3~1.5% 로
 * 주의선 밑이었지만 **상승 속도**는 역대 최대였다 (2023Q4 +0.91%p,
 * 2010Q3 의 +0.82%p 를 넘었다). 그래서 수준과 속도를 함께 본다.
 */
export const CRE_WARN_DELINQ_YOY_PP = 0.5;

/** 전년 동기 대비 상승폭(%p)이 이 값 이상이면 "경보" */
export const CRE_ALERT_DELINQ_YOY_PP = 0.75;

/** 지역은행($1B~$10B) CRE 집중도(총자산 대비 %)가 이 값 이상이면 "주의" */
export const CRE_WARN_CONCENTRATION_PCT = 30;

/**
 * 지역은행 CRE 집중도(%)가 이 값 이상이면 "경보".
 *
 * ⚠ 2026년 현재 이 값(34.4%)은 **역대 최고 부근**이라 경보가 켜져 있는 것이
 *   정상 상태다. 버그가 아니다. 1984년 이후 범위가 11.4~34.6% 이고
 *   2006년 이후 평균이 30.3% 다.
 */
export const CRE_ALERT_CONCENTRATION_PCT = 34;

/** 지역은행으로 보는 자산 규모 구간 (FDIC 워크북 라벨과 짝을 이룬다) */
export const CRE_REGIONAL_BUCKET = "Assets $1 Billion - $10 Billion";

export interface CreDelinquencyPoint {
  /** "2026Q2" 형식 */
  quarter: string;
  /** 임대용 비주거 CRE 연체율 (%). 워크북 R203 */
  investorNoncurrentPct: number;
  /** 자가사용 비주거 CRE 연체율 (%). 워크북 R188 — 대조용 */
  ownerOccupiedNoncurrentPct: number | null;
  /**
   * 전년 동기 대비 상승폭 (%p).
   *
   * ⚠ 4분기 전 값이 없으면 null. 구멍을 건너뛴 채 계산하면 다른 기간의
   *   변화가 "전년 대비" 로 둔갑한다.
   */
  yoyChangePp: number | null;
}

export interface CreSizeSplitPoint {
  /** "2026Q2" 형식 */
  quarter: string;
  /** 상위 100대 은행 CRE 연체율 (%) — FRED DRCRELEXFT100S */
  top100Pct: number | null;
  /** 100대 밖 은행 CRE 연체율 (%) — FRED DRCRELEXFOBS */
  otherPct: number | null;
  /** 전체 상업은행 CRE 연체율 (%) — FRED DRCRELEXFACBS */
  allBanksPct: number | null;
  /** 상위100대 − 100대 밖 (%p). 한쪽이라도 없으면 null */
  gapPp: number | null;
}

export interface CreConcentrationPoint {
  /** "2026Q2" 형식 */
  quarter: string;
  /** 자산 규모 구간별 CRE 대출 / 총자산 (%). 라벨 → 값 */
  byBucket: Record<string, number>;
}

export interface CreVerdict {
  /** 셋 중 가장 나쁜 것 */
  status: ObservatoryStatus;
  /** 임대용 연체율 수준 판정 */
  delinquencyStatus: ObservatoryStatus;
  /** 임대용 연체율 상승 속도 판정 */
  momentumStatus: ObservatoryStatus;
  /** 지역은행 집중도 판정 */
  concentrationStatus: ObservatoryStatus;
  latestDelinquency: CreDelinquencyPoint | null;
  latestSizeSplit: CreSizeSplitPoint | null;
  latestConcentration: CreConcentrationPoint | null;
  /** 지역은행 집중도 최신값 (%) */
  regionalConcentrationPct: number | null;
}

/**
 * CRE 익스포저 판정.
 *
 * ⚠ 대형·지역 **격차는 판정에 쓰지 않는다.** 격차가 좁혀지는 데는 두 가지
 *   정반대 이유가 있다 — 대형이 회복 중이거나, 지역이 나빠지는 중이거나.
 *   격차 하나로는 둘을 구분할 수 없어 경보 근거가 되지 못한다.
 *   (지금은 실제로 둘 다 일어나는 중이다: 대형 1.97%→1.70%, 지역 0.50%→1.27%)
 *   그래서 격차는 화면에 보여만 주고, 판정은 수준·속도·집중도로 한다.
 */
export function evaluateCre(
  delinquency: CreDelinquencyPoint[],
  sizeSplit: CreSizeSplitPoint[],
  concentration: CreConcentrationPoint[]
): CreVerdict {
  const latestDelinquency =
    delinquency.length > 0 ? delinquency[delinquency.length - 1] : null;
  const latestSizeSplit =
    sizeSplit.length > 0 ? sizeSplit[sizeSplit.length - 1] : null;
  const latestConcentration =
    concentration.length > 0 ? concentration[concentration.length - 1] : null;

  let delinquencyStatus: ObservatoryStatus = "normal";
  if (latestDelinquency) {
    const v = latestDelinquency.investorNoncurrentPct;
    if (v >= CRE_ALERT_DELINQ_PCT) delinquencyStatus = "warning";
    else if (v >= CRE_WARN_DELINQ_PCT) delinquencyStatus = "caution";
  }

  let momentumStatus: ObservatoryStatus = "normal";
  const yoy = latestDelinquency?.yoyChangePp;
  if (typeof yoy === "number") {
    if (yoy >= CRE_ALERT_DELINQ_YOY_PP) momentumStatus = "warning";
    else if (yoy >= CRE_WARN_DELINQ_YOY_PP) momentumStatus = "caution";
  }

  const regionalConcentrationPct =
    latestConcentration?.byBucket[CRE_REGIONAL_BUCKET] ?? null;

  let concentrationStatus: ObservatoryStatus = "normal";
  if (typeof regionalConcentrationPct === "number") {
    if (regionalConcentrationPct >= CRE_ALERT_CONCENTRATION_PCT)
      concentrationStatus = "warning";
    else if (regionalConcentrationPct >= CRE_WARN_CONCENTRATION_PCT)
      concentrationStatus = "caution";
  }

  const severity: Record<ObservatoryStatus, number> = {
    normal: 0,
    caution: 1,
    warning: 2,
  };
  const status = [delinquencyStatus, momentumStatus, concentrationStatus].reduce(
    (worst, s) => (severity[s] > severity[worst] ? s : worst),
    "normal" as ObservatoryStatus
  );

  return {
    status,
    delinquencyStatus,
    momentumStatus,
    concentrationStatus,
    latestDelinquency,
    latestSizeSplit,
    latestConcentration,
    regionalConcentrationPct,
  };
}

/* ────────────────────────────────────────────────────────────
 * 국채 베이시스 트레이드 (관측소 3 — 그림자금융)
 *
 * CFTC TFF(Futures Only) 의 레버리지 펀드 국채 선물 **순숏**(short − long)을
 * 베이시스 트레이드의 대리 지표로 본다. 6개 만기(2년·5년·10년·울트라 10년·
 * 30년·울트라 본드)를 계약당 액면으로 환산해 합친다.
 *
 * 두 신호를 보고 더 나쁜 쪽을 판정으로 쓴다.
 *   청산 신호 — 액면 명목의 4주 변화율이 **저장된 전 기간(2016-04~)** 분포의
 *              하위 5% 이하면 주의, 하위 2% 이하면 경보.
 *   쏠림 신호 — 액면 명목이 **최근 157주(3년)** 중 상위 10% 안이면 주의.
 *              경보는 만들지 않는다 (쌓인 것 자체는 아직 사고가 아니다).
 *
 * ⚠ 기준이 고정 금액·고정 변화율이 아니라 **분포의 백분위**다. 기준값(컷오프)은
 *   evaluateBasisTrade 가 저장된 시계열에서 매번 계산한다. 시장 규모가 10년 새
 *   몇 배로 커져 고정 금액은 금방 낡기 때문이다.
 *
 * ⚠ 이 백분위들은 사후에 사건을 맞추려고 고른 값이 아니다. 2026-10 구현 때
 *   회귀 검증에서 2020-03(4주 −20.8%)은 청산 신호에 걸리지 않았고, 그대로 뒀다.
 * ──────────────────────────────────────────────────────────── */

/** 청산 신호 "주의" — 4주 변화율이 전 기간 분포의 이 백분위 이하 */
export const BT_LIQ_CAUTION_PCTILE = 5;

/** 청산 신호 "경보" — 4주 변화율이 전 기간 분포의 이 백분위 이하 */
export const BT_LIQ_ALERT_PCTILE = 2;

/** 쏠림 신호 "주의" — 액면 명목의 최근 창 백분위 순위가 이 값 이상 */
export const BT_CONC_CAUTION_PCTILE = 90;

/** 쏠림 신호를 보는 최근 창 (주). 157주 ≈ 3년 */
export const BT_LOOKBACK_WEEKS = 157;

/** 변화율을 재는 간격 (보고 회차 수) */
export const BT_CHANGE_WEEKS = 4;

/**
 * 청산 신호 분포에 필요한 최소 변화율 개수. 이보다 적으면 판정 보류.
 * 1년치(52주) 미만의 분포로 하위 2%를 말하면 사실상 최저값 한두 개라 의미가 없다.
 */
export const BT_MIN_CHANGE_OBS = 52;

/**
 * 4주 변화율을 인정하는 날짜 간격 (일).
 *
 * 보통 28일이지만 연휴 주에는 보고일이 월요일로 밀려 27~29일이 된다.
 * 6개 만기 중 하나라도 빠진 주는 저장하지 않으므로, 4회차 전이 5주 이상
 * 떨어져 있을 수 있다 — 그때는 "4주" 변화가 아니므로 null 로 둔다.
 */
export const BT_CHANGE_MIN_DAYS = 25;
export const BT_CHANGE_MAX_DAYS = 31;

export interface BasisTradePoint {
  /** 보고 기준일(화요일, 연휴 주는 월요일) YYYY-MM-DD — CFTC 원본에 시간대 없음 */
  date: string;
  /** 6개 만기 레버리지 펀드 순숏 합계 (계약 수, short − long) */
  netShortContracts: number;
  /**
   * 액면 명목 순숏, 십억 달러.
   * = Σ 만기별 순숏 계약 × 계약당 액면 (2년 $200,000, 나머지 $100,000 — CFTC contract_units 기준)
   * 듀레이션(금리 민감도) 차이는 반영하지 않은 단순 액면 합이다.
   */
  notionalBillions: number;
  /** 6개 만기 미결제약정 합계 (계약 수, 전체 참가자) */
  openInterest: number;
  /** 순숏 계약 ÷ 미결제약정 × 100 (%) */
  netShortPctOfOi: number;
  /**
   * 4회차 전 대비 액면 명목 변화율 (%).
   *
   * ⚠ null 인 경우: 4회차 전이 없거나, 날짜 간격이 25~31일을 벗어나거나,
   *   **4회차 전 액면 명목이 0 이하**일 때. 2021년 10~11월에 레버리지 펀드가
   *   순매수(음수)로 돌아선 구간이 실제로 있는데, 음수나 0 근처를 분모로 쓰면
   *   부호가 뒤집히거나 수백 % 가 나와 분포가 망가진다.
   */
  change4wPct: number | null;
}

export interface BasisTradeVerdict {
  /** 최종 판정. 데이터가 모자라 백분위를 못 구하면 null (판정 보류) */
  status: ObservatoryStatus | null;
  /** 청산 신호 (null = 보류) */
  liquidationStatus: ObservatoryStatus | null;
  /** 쏠림 신호 (null = 보류) */
  concentrationStatus: ObservatoryStatus | null;
  latest: BasisTradePoint | null;
  /** 전 기간 4주 변화율 분포의 하위 5% / 2% 값 (%) */
  liquidationCautionCutoffPct: number | null;
  liquidationAlertCutoffPct: number | null;
  /** 분포에 쓴 4주 변화율 개수 */
  changeObs: number;
  /** 최신 액면 명목의 최근 157주 백분위 순위 (0~100, 높을수록 큼) */
  percentile3y: number | null;
  /** 최근 157주 액면 명목의 90번째 백분위 값 (십억 달러) — 차트 기준선용 */
  concentrationCutoffBillions: number | null;
}

/**
 * 분위수 (선형 보간, Excel PERCENTILE.INC / R type 7 과 같은 방식).
 * @param p 0~1
 */
export function quantile(values: number[], p: number): number {
  // 빈 배열이면 NaN 이 조용히 기준값으로 들어가 모든 비교가 false(=정상)가 된다
  if (values.length === 0) throw new Error("quantile: 빈 배열");
  const s = [...values].sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

/**
 * series 의 i 번째 시점에서 판정한다 (i 이후 데이터는 보지 않는다).
 *
 * 회귀 검증에서 과거 시점을 "그때 알 수 있었던 데이터만으로" 판정하려고
 * 시점 인덱스를 받는다. 현재 판정은 evaluateBasisTrade 가 마지막 인덱스로 부른다.
 */
export function evaluateBasisTradeAt(
  series: BasisTradePoint[],
  i: number
): BasisTradeVerdict {
  const empty: BasisTradeVerdict = {
    status: null,
    liquidationStatus: null,
    concentrationStatus: null,
    latest: null,
    liquidationCautionCutoffPct: null,
    liquidationAlertCutoffPct: null,
    changeObs: 0,
    percentile3y: null,
    concentrationCutoffBillions: null,
  };
  if (i < 0 || i >= series.length) return empty;

  const hist = series.slice(0, i + 1);
  const latest = hist[hist.length - 1];

  // 청산 신호 — 전 기간 4주 변화율 분포
  const changes = hist
    .map((p) => p.change4wPct)
    .filter((v): v is number => typeof v === "number");
  let liquidationStatus: ObservatoryStatus | null = null;
  let cautionCut: number | null = null;
  let alertCut: number | null = null;
  if (changes.length >= BT_MIN_CHANGE_OBS) {
    cautionCut = quantile(changes, BT_LIQ_CAUTION_PCTILE / 100);
    alertCut = quantile(changes, BT_LIQ_ALERT_PCTILE / 100);
    const c = latest.change4wPct;
    // 최신 변화율을 못 구하면(분모 0 이하 등) 청산 신호는 보류한다
    if (typeof c === "number") {
      liquidationStatus =
        c <= alertCut ? "warning" : c <= cautionCut ? "caution" : "normal";
    }
  }

  // 쏠림 신호 — 최근 157주 안에서의 순위
  let concentrationStatus: ObservatoryStatus | null = null;
  let percentile3y: number | null = null;
  let concCut: number | null = null;
  if (hist.length >= BT_LOOKBACK_WEEKS) {
    const window = hist.slice(-BT_LOOKBACK_WEEKS).map((p) => p.notionalBillions);
    // 순위 = 창 안에서 최신값 이하인 값의 비율 (최신값 자신 포함)
    percentile3y =
      (window.filter((v) => v <= latest.notionalBillions).length / window.length) * 100;
    concCut = quantile(window, BT_CONC_CAUTION_PCTILE / 100);
    concentrationStatus = percentile3y >= BT_CONC_CAUTION_PCTILE ? "caution" : "normal";
  }

  // 둘 중 하나라도 보류면 최종도 보류 — 한쪽만 보고 "정상" 이라 말하지 않는다
  const severity: Record<ObservatoryStatus, number> = {
    normal: 0,
    caution: 1,
    warning: 2,
  };
  const status =
    liquidationStatus === null || concentrationStatus === null
      ? null
      : severity[liquidationStatus] >= severity[concentrationStatus]
        ? liquidationStatus
        : concentrationStatus;

  return {
    status,
    liquidationStatus,
    concentrationStatus,
    latest,
    liquidationCautionCutoffPct: cautionCut,
    liquidationAlertCutoffPct: alertCut,
    changeObs: changes.length,
    percentile3y,
    concentrationCutoffBillions: concCut,
  };
}

/** 현재(가장 최근 보고일) 판정. series 는 날짜 오름차순 */
export function evaluateBasisTrade(series: BasisTradePoint[]): BasisTradeVerdict {
  return evaluateBasisTradeAt(series, series.length - 1);
}
