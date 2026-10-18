/**
 * 국채 베이시스 대리 지표 표기.
 *
 * ⚠ "use client" 를 넣지 않는다. 서버 컴포넌트인 page.tsx 와 클라이언트인
 *   차트가 같이 쓰는 파일이기 때문이다.
 *   "use client" 파일의 함수를 서버에서 부르면 클라이언트 참조 프록시가 잡혀
 *   런타임 예외가 난다 (SRF 페이지 500 의 원인이었다).
 */

/** 액면 명목 (십억 달러 입력) — 825.1십억 달러 */
export function formatNotional(billions: number): string {
  return `${billions.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}십억 달러`;
}

/** 축용 짧은 표기 — 825 */
export function formatNotionalShort(billions: number): string {
  return Math.round(billions).toLocaleString("en-US");
}

/** 계약 수 — 6,883,343계약 */
export function formatContracts(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")}계약`;
}

/**
 * 금액 변화 — 십억 달러 입력을 **억 달러**로 바꿔 표시한다. +383억 달러 / 없으면 "—"
 * (십억 달러 1 = 억 달러 10)
 */
export function formatChangeEok(billions: number | null): string {
  if (billions === null) return "—";
  const eok = Math.round(billions * 10);
  const sign = eok > 0 ? "+" : "";
  return `${sign}${eok.toLocaleString("en-US")}억 달러`;
}

/** 축용 짧은 억 달러 표기 — 십억 달러 입력 → -2,000 */
export function formatEokShort(billions: number): string {
  return Math.round(billions * 10).toLocaleString("en-US");
}

/** 비율 — 28.5% */
export function formatPct(pct: number | null): string {
  return pct === null ? "—" : `${pct.toFixed(1)}%`;
}

/** YYYY-MM-DD → 2026.10.13 (화) */
export function formatReportDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(
    d.getUTCDate()
  ).padStart(2, "0")} (${days[d.getUTCDay()]})`;
}
