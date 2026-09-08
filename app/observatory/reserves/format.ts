/**
 * 지급준비금 총량 표시 형식.
 *
 * ⚠ 이 파일에는 "use client" 를 넣지 않는다.
 *   서버 컴포넌트(page.tsx)와 클라이언트 컴포넌트(ReservesChart.tsx)가 함께 쓴다.
 *   "use client" 파일에 두면 서버에서 호출할 때 클라이언트 참조 프록시가 잡혀
 *   "Attempted to call formatReserves() from the server" 런타임 예외가 난다.
 *
 * ⚠ 들어오는 값은 이미 십억 달러다(수집 단계에서 ÷1000 완료). 여기서 나누지 말 것.
 */

/**
 * 십억 달러 → 읽기 쉬운 문자열.
 *
 * 이 지표는 늘 네 자릿수(1,400 ~ 4,200십억) 범위라 천 단위 구분만 넣는다.
 */
export function formatReserves(v: number): string {
  return `${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}십억 달러`;
}

/** 십억 달러 → "N.NN조 달러" */
export function formatTrillion(v: number): string {
  return `${(v / 1000).toFixed(2)}조 달러`;
}

/** 전주 대비 증감 → 부호 붙은 문자열 */
export function formatChange(v: number): string {
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 1 })}십억 달러`;
}
