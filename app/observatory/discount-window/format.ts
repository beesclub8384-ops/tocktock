/**
 * 재할인 창구 잔액 표시 형식.
 *
 * ⚠ 이 파일에는 "use client" 를 넣지 않는다.
 *   서버 컴포넌트(page.tsx)와 클라이언트 컴포넌트(DiscountWindowChart.tsx)가
 *   함께 쓴다. "use client" 파일에 두면 서버에서 호출할 때 클라이언트 참조
 *   프록시가 잡혀 "Attempted to call formatBalance() from the server" 런타임
 *   예외가 난다. (SRF 페이지에서 실제로 났던 문제)
 *
 * ⚠ 들어오는 값은 이미 십억 달러다. 여기서 단위를 다시 나누지 말 것.
 */

/** 십억 달러 → 읽기 쉬운 문자열. 자릿수가 클수록 소수점을 줄인다 */
export function formatBalance(v: number): string {
  if (v === 0) return "0";
  if (v >= 100) return `${v.toFixed(0)}십억 달러`;
  if (v >= 10) return `${v.toFixed(1)}십억 달러`;
  return `${v.toFixed(2)}십억 달러`;
}
