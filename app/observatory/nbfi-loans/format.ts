/**
 * 은행의 비예금 금융기관 대출 표기.
 *
 * ⚠ "use client" 를 넣지 않는다. 서버 컴포넌트인 page.tsx 와 클라이언트인
 *   차트가 같이 쓰는 파일이기 때문이다.
 *   "use client" 파일의 함수를 서버에서 부르면 클라이언트 참조 프록시가 잡혀
 *   런타임 예외가 난다 (SRF 페이지 500 의 원인이었다).
 */

/** 잔액 (십억 달러 입력) — 2,098.0십억 달러 */
export function formatLoans(billions: number): string {
  return `${billions.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}십억 달러`;
}

/** 축용 짧은 표기 — 2,098 */
export function formatLoansShort(billions: number): string {
  return Math.round(billions).toLocaleString("en-US");
}

/** 변화 (십억 달러 입력) — +82.0십억 달러 / 없으면 "—" */
export function formatLoansChange(billions: number | null): string {
  if (billions === null) return "—";
  const sign = billions > 0 ? "+" : "";
  return `${sign}${billions.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}십억 달러`;
}

/** 증가율 — +20.0% / 없으면 "—" */
export function formatYoy(pct: number | null): string {
  if (pct === null) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

/** 비율 — 14.8% / 없으면 "—" */
export function formatShare(pct: number | null): string {
  return pct === null ? "—" : `${pct.toFixed(1)}%`;
}

/** YYYY-MM-DD → 2026.10.07 (수) */
export function formatWeekDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(
    d.getUTCDate()
  ).padStart(2, "0")} (${days[d.getUTCDay()]})`;
}
