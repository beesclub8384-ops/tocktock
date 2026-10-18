/**
 * 인덱스 카드 전용 표시 형식.
 *
 * ⚠ 상세 페이지의 format.ts 들과 일부러 다르다.
 *   상세 페이지는 그 지표 하나만 보는 화면이라 값의 크기에 맞춰 단위를 바꾼다
 *   (RRP 0.675 → "675백만 달러"). 하지만 인덱스는 다섯 카드가 세로로 붙어 있어,
 *   한 카드만 백만 단위면 675 라는 숫자가 옆 카드의 2,895 와 같은 눈금처럼
 *   읽히는 착시가 생긴다. 그래서 카드에서는 금액 지표를 전부 십억 달러로
 *   통일한다. 상세 페이지 표기는 그대로 둔다.
 *
 * ⚠ 이 파일에는 "use client" 를 넣지 않는다 (인덱스는 서버 컴포넌트다).
 */

/** 이 값(십억 달러) 미만이면서 0 이 아니면 "사실상 0" 이라고 덧붙인다 */
const EFFECTIVELY_ZERO_BILLIONS = 1;

export interface CardValue {
  /** 카드에 크게 넣는 값 */
  main: string;
  /** 값 옆에 작게 붙이는 보충 설명. 없으면 undefined */
  note?: string;
}

/**
 * 십억 달러 값을 카드 표기로 바꾼다. 단위는 언제나 십억 달러다.
 *
 * 자릿수만 크기에 맞춰 줄인다 — 2,895 / 5.28 / 0.68 이 한 열에서 나란히 읽히게.
 * 0 은 아니지만 1십억에 못 미치는 값에는 "(사실상 0)" 을 덧붙인다.
 * 0.68 을 그냥 두면 옆 카드들과 견줘 얼마나 작은 값인지 안 잡히기 때문이다.
 */
export function formatCardBillions(v: number): CardValue {
  if (v === 0) return { main: "0십억 달러" };

  let main: string;
  if (v >= 100) {
    main = `${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}십억 달러`;
  } else if (v >= 10) {
    main = `${v.toFixed(1)}십억 달러`;
  } else {
    main = `${v.toFixed(2)}십억 달러`;
  }

  if (v > 0 && v < EFFECTIVELY_ZERO_BILLIONS) {
    return { main, note: "사실상 0" };
  }
  return { main };
}

/** 스프레드는 금액이 아니라 bp 라 단위 통일 대상이 아니다 */
export function formatCardBp(spreadBp: number): CardValue {
  return { main: `${spreadBp > 0 ? "+" : ""}${spreadBp.toFixed(1)}bp` };
}

/**
 * 비율(%) 카드 표기. 분기 지표라 어느 분기 값인지 옆에 붙인다.
 *
 * 금액 지표들과 달리 단위를 십억 달러로 통일할 수 없는 값이라
 * (비율은 비율이다) 소수 한 자리로 고정한다.
 */
export function formatCardPercent(pct: number, quarter: string): CardValue {
  return { main: `${pct.toFixed(1)}%`, note: `${quarter} 기준` };
}

/**
 * 잔액(십억 달러) + 전분기 대비 증가율 카드 표기.
 *
 * 판정이 증가율로 이뤄지는 지표라, 잔액만 크게 띄우면 카드의 신호등 색과
 * 숫자가 따로 논다. 잔액을 본값으로 두고 증가율을 옆에 붙인다.
 */
export function formatCardQoq(billions: number, qoqPct: number | null): CardValue {
  const main = `${Math.round(billions).toLocaleString("en-US")}십억 달러`;
  if (qoqPct === null) return { main, note: "전분기 대비 미상" };
  const sign = qoqPct >= 0 ? "+" : "";
  return { main, note: `전분기 대비 ${sign}${qoqPct.toFixed(1)}%` };
}

/**
 * 예금 유출 카드 표기 — 성격이 다른 두 값을 한 장에 담는다.
 *
 * 본값은 분기 지표(무보험 비중)로 둔다. 주간 변화는 평소 0 근처라 본값으로
 * 쓰면 카드가 늘 "0.0"만 보여주게 된다. 주간 쪽은 옆에 붙인다.
 */
export function formatCardDepositFlight(
  uninsuredPct: number | null,
  weeklyChangePp: number | null
): CardValue {
  const main = uninsuredPct === null ? "—" : `무보험 ${uninsuredPct.toFixed(1)}%`;
  if (weeklyChangePp === null) return { main };
  const sign = weeklyChangePp >= 0 ? "+" : "";
  return { main, note: `소형 이동 ${sign}${weeklyChangePp.toFixed(2)}%p/주` };
}

/**
 * 국채 베이시스 대리 지표 카드 표기 — 액면 명목(십억 달러) + 미결제약정 대비 비율.
 *
 * 금액은 다른 카드와 같은 규칙(formatCardBillions)을 따른다. 레버리지 펀드가
 * 순매수로 돌아서면 음수가 될 수 있는데, 그 경우도 숫자를 그대로 보여준다.
 */
export function formatCardBasisTrade(notionalBillions: number, pctOfOi: number): CardValue {
  const main =
    notionalBillions >= 0
      ? formatCardBillions(notionalBillions).main
      : `${notionalBillions.toFixed(1)}십억 달러`;
  return { main, note: `미결제약정 대비 ${pctOfOi.toFixed(1)}%` };
}

/**
 * NDFI 대출 카드 표기 — 잔액(십억 달러)을 본값으로, 판정에 쓰는 재분류 보정 증가율을 옆에.
 * 잔액만 크게 띄우면 증가율로 켜진 신호등 색과 숫자가 따로 논다.
 */
export function formatCardNbfiLoans(billions: number, yoyPct: number | null): CardValue {
  const main = formatCardBillions(billions).main;
  if (yoyPct === null) return { main, note: "전년 대비 미상" };
  const sign = yoyPct >= 0 ? "+" : "";
  return { main, note: `전년 대비 ${sign}${yoyPct.toFixed(1)}% (재분류 보정)` };
}

/**
 * CRE 카드 표기 — 연체율(아픈 정도)을 본값, 지역은행 집중도(물린 양)를 옆에.
 *
 * 판정이 둘 중 나쁜 쪽을 따르므로 한 숫자만 보여주면 신호등 색과 어긋난다.
 */
export function formatCardCre(
  investorDelinqPct: number | null,
  regionalConcentrationPct: number | null
): CardValue {
  const main =
    investorDelinqPct === null ? "—" : `연체 ${investorDelinqPct.toFixed(2)}%`;
  if (regionalConcentrationPct === null) return { main };
  return { main, note: `지역은행 집중 ${regionalConcentrationPct.toFixed(1)}%` };
}
