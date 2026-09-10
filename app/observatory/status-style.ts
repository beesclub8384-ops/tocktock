/**
 * 신호등 표기 공용 — 1층 목록과 2층 섹션 페이지가 같이 쓴다
 *
 * ⚠ 상세 페이지 5개는 각자의 STATUS_META 를 그대로 둔다.
 *   이번 구조 재편에서 상세 페이지는 브레드크럼 한 줄 외에는 건드리지 않기로
 *   했다. 겉보기 값이 같다고 지금 끌어오면 무변경 약속이 깨진다.
 *
 * ⚠ "use client" 를 넣지 않는다 (두 화면 다 서버 컴포넌트다).
 */
import type { ObservatoryStatus } from "@/lib/observatory-constants";

/** 카드 오른쪽 위 배지 */
export const STATUS_META: Record<
  ObservatoryStatus,
  { label: string; className: string; dot: string }
> = {
  normal: {
    label: "정상",
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
    dot: "bg-emerald-500",
  },
  caution: {
    label: "주의",
    className:
      "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
    dot: "bg-amber-500",
  },
  warning: {
    label: "경보",
    className:
      "bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800",
    dot: "bg-rose-500",
  },
};

/** 요약 문장 줄의 색 — 가장 나쁜 상태를 따라간다 */
export const SUMMARY_CLASS: Record<ObservatoryStatus, string> = {
  normal:
    "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  caution:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  warning:
    "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200",
};

/** 아직 판정할 데이터가 없을 때의 중립 스타일 */
export const NEUTRAL_SUMMARY_CLASS =
  "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400";

/** 사슬 순서 표기 ①②③… */
export const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"];

/** YYYY-MM-DD → 2026.09.10 */
export function formatCardDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}
