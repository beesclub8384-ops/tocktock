/**
 * FHLB 차입 잔액 표기.
 *
 * ⚠ "use client" 를 넣지 않는다. 서버 컴포넌트인 page.tsx 와 클라이언트인
 *   차트가 같이 쓰는 파일이기 때문이다.
 *   "use client" 파일의 함수를 서버에서 부르면 클라이언트 참조 프록시가 잡혀
 *   런타임 예외가 난다 (다른 지표 폴더의 format.ts 가 같은 이유로 비어 있다).
 */

/** 잔액 표기 (십억 달러 입력) — 1,042.1십억 달러 */
export function formatAdvances(billions: number): string {
  return `${billions.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}십억 달러`;
}

/** 축·카드용 짧은 잔액 표기 — 1,042 */
export function formatAdvancesShort(billions: number): string {
  return Math.round(billions).toLocaleString("en-US");
}

/** 전분기 대비 증가율 — +27.0% / 데이터 없으면 "—" */
export function formatQoq(pct: number | null): string {
  if (pct === null) return "—";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

/** "2023Q1" → "2023년 1분기" */
export function formatQuarter(quarter: string): string {
  const m = /^(\d{4})Q([1-4])$/.exec(quarter);
  return m ? `${m[1]}년 ${m[2]}분기` : quarter;
}
