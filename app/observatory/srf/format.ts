/**
 * SRF 사용량 표시 형식.
 *
 * ⚠ 이 파일에는 "use client" 를 넣지 않는다.
 *   서버 컴포넌트(page.tsx)와 클라이언트 컴포넌트(SrfChart.tsx)가 함께 쓴다.
 *   "use client" 파일에 두면 서버에서 호출할 때 클라이언트 참조 프록시가 잡혀
 *   "Attempted to call formatUsage() from the server" 런타임 예외가 난다.
 */

/** 십억 달러 → 읽기 쉬운 문자열. 소액 구간은 자릿수를 더 보여준다 */
export function formatUsage(v: number): string {
  if (v === 0) return "0";
  if (v < 0.01) return `${(v * 1000).toFixed(1)}백만 달러`;
  if (v < 1) return `${v.toFixed(3)}십억 달러`;
  return `${v.toFixed(2)}십억 달러`;
}
