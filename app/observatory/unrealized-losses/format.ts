/**
 * 채권 미실현손실 상세 페이지 표기.
 *
 * ⚠ "use client" 를 넣지 않는다. 서버 컴포넌트인 page.tsx 와 클라이언트인
 *   차트가 같이 쓰기 때문이다 (다른 지표 폴더의 format.ts 와 같은 이유).
 */

/** 비율 표기 — 12.43 → "12.4%" */
export function formatRatio(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

/**
 * 금액 표기 (십억 달러 입력).
 *
 * 1,000십억을 넘으면 조 단위로 접는다. 유령 손실은 300~700십억을 오가고
 * 자기자본은 2,600십억이라, 둘을 한 화면에서 읽으려면 자기자본 쪽은
 * "2.63조 달러" 로 보이는 편이 자릿수를 세지 않아도 된다.
 */
export function formatBillions(billions: number): string {
  const abs = Math.abs(billions);
  if (abs >= 1000) return `${(billions / 1000).toFixed(2)}조 달러`;
  return `${billions.toFixed(1)}십억 달러`;
}

/** "2026Q2" → "2026년 2분기" */
export function formatQuarter(quarter: string): string {
  const m = /^(\d{4})Q([1-4])$/.exec(quarter);
  return m ? `${m[1]}년 ${m[2]}분기` : quarter;
}

/** "2026-06-30" → "2026년 6월 30일" */
export function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}
