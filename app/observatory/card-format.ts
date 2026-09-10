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
