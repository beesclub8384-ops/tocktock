/**
 * 역레포(RRP) 잔액 표시 형식.
 *
 * ⚠ 이 파일에는 "use client" 를 넣지 않는다.
 *   서버 컴포넌트(page.tsx)와 클라이언트 컴포넌트(RrpChart.tsx)가 함께 쓴다.
 *   "use client" 파일에 두면 서버에서 호출할 때 클라이언트 참조 프록시가 잡혀
 *   "Attempted to call formatRrp() from the server" 런타임 예외가 난다.
 *
 * ⚠ 들어오는 값은 이미 십억 달러다(RRPONTSYD 원단위). 여기서 나누지 말 것.
 */

/**
 * 십억 달러 → 읽기 쉬운 문자열.
 *
 * 이 지표는 정점 2,553십억에서 지금 0.7십억까지 네 자릿수 범위를 오간다.
 * 한 가지 자릿수로는 양쪽이 다 안 읽혀서 구간별로 나눈다.
 */
export function formatRrp(v: number): string {
  if (v === 0) return "0";
  if (v < 1) return `${(v * 1000).toFixed(0)}백만 달러`;
  if (v < 100) return `${v.toFixed(2)}십억 달러`;
  if (v < 1000) return `${v.toFixed(1)}십억 달러`;
  return `${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}십억 달러`;
}

/** 십억 달러 → "N.NN조 달러". 1,000십억 이상일 때만 의미가 있다 */
export function formatTrillion(v: number): string {
  return `${(v / 1000).toFixed(2)}조 달러`;
}
