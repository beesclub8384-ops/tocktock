/**
 * 예금 유출 표기.
 *
 * ⚠ "use client" 를 넣지 않는다. 서버 컴포넌트인 page.tsx 와 클라이언트인
 *   차트가 같이 쓰는 파일이기 때문이다.
 *   "use client" 파일의 함수를 서버에서 부르면 클라이언트 참조 프록시가 잡혀
 *   런타임 예외가 난다.
 */

/** 비중 표기 — 31.446 → "31.45%" (주간은 소수 둘째 자리까지 봐야 움직임이 보인다) */
export function formatSharePct(pct: number): string {
  return `${pct.toFixed(2)}%`;
}

/** 무보험 비중 — 42.9% (분기 값은 한 자리면 충분하다) */
export function formatUninsuredPct(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

/** 비중 변화 (%p) — +0.12%p / −0.90%p / 데이터 없으면 "—" */
export function formatChangePp(pp: number | null): string {
  if (pp === null) return "—";
  const sign = pp >= 0 ? "+" : "−";
  return `${sign}${Math.abs(pp).toFixed(2)}%p`;
}

/** 금액 (십억 달러) — 4,966 */
export function formatBillions(billions: number): string {
  return Math.round(billions).toLocaleString("en-US");
}

/** "2026-09-02" → "2026년 9월 2일" */
export function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

/** "2026Q2" → "2026년 2분기" */
export function formatQuarter(quarter: string): string {
  const m = /^(\d{4})Q([1-4])$/.exec(quarter);
  return m ? `${m[1]}년 ${m[2]}분기` : quarter;
}
