/**
 * 관측소 4 상세 페이지 공용 표기.
 *
 * ⚠ "use client" 를 넣지 않는다. 서버 컴포넌트인 page.tsx 와 클라이언트인 차트가 같이 쓴다.
 *   "use client" 파일의 함수를 서버에서 부르면 런타임 예외가 난다 (SRF 페이지 500 의 원인이었다).
 * ⚠ 폴더 이름이 밑줄(_)로 시작해 Next.js 가 경로로 잡지 않는다 (/observatory/_obs4 는 없다).
 */
import type { ObservatoryStatus } from "@/lib/observatory-constants";

export const STATUS_LABEL: Record<ObservatoryStatus, string> = {
  normal: "정상",
  caution: "주의",
  warning: "경보",
};

/** 상태 → 라벨. null 이면 판정 보류 */
export function statusLabel(s: ObservatoryStatus | null): string {
  return s === null ? "판정 보류" : STATUS_LABEL[s];
}

/** 부호 붙은 숫자 — +0.12 / −0.30 */
export function signed(v: number | null, digits = 2, unit = ""): string {
  if (v === null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}${unit}`;
}

/** 십억 달러 — 9,331.7십억 달러 */
export function formatBillions(v: number): string {
  return `${v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}십억 달러`;
}

/** 축용 짧은 숫자 — 9,332 */
export function shortNumber(v: number): string {
  return Math.round(v).toLocaleString("en-US");
}

/** YYYY-MM-DD → 2026.10.08 (목) */
export function formatDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(
    d.getUTCDate()
  ).padStart(2, "0")} (${days[d.getUTCDay()]})`;
}

/** YYYY-MM → 2026년 8월 */
export function formatMonth(month: string): string {
  return `${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`;
}

/** 입찰 한 건 이름 — 30년물(재발행) */
export function auctionName(termYears: number, reopening: boolean): string {
  return `${termYears}년물${reopening ? "(재발행)" : ""}`;
}
