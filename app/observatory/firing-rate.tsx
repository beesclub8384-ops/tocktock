/**
 * 발동 비율 한 줄 — "판정할 수 있었던 기간 중 주의 이상이 켜진 비율".
 *
 * 숫자를 코드에 박지 않는다. API 가 저장된 데이터로 매 요청 계산한 값(FiringStats)을 받아 그대로 쓴다.
 * 15% 를 넘으면 신호가 자주 켜진다는 것을 같은 줄에서 밝힌다 (관측소 작업 규칙 4).
 *
 * ⚠ "use client" 를 넣지 않는다 (상세 페이지는 서버 컴포넌트다).
 */
import type { FiringStats } from "@/lib/observatory-constants";

/** YYYY-MM-DD → 2019.04.02, YYYY-MM → 2015.12, 2026Q2 → 2026년 2분기 */
function formatLabel(l: string): string {
  if (/^\d{4}Q[1-4]$/.test(l)) return `${l.slice(0, 4)}년 ${l.slice(5)}분기`;
  return l.replace(/-/g, ".");
}

/** 상시 경보 위험으로 보는 발동 비율 (%) — 관측소 작업 규칙 4 */
export const FREQUENT_FIRING_PCT = 15;

export function FiringRateLine({
  stats,
  unit,
}: {
  stats: FiringStats | null | undefined;
  /** 시점 단위 — 주 / 영업일 / 개월 */
  unit: string;
}) {
  if (!stats || stats.pct === null) return null;
  const frequent = stats.pct > FREQUENT_FIRING_PCT;
  return (
    <p className="text-zinc-500">
      저장된 자료로 지금 다시 계산하면, 판정할 수 있었던 {stats.evaluable.toLocaleString("en-US")}
      {unit}({stats.from && formatLabel(stats.from)} ~ {stats.to && formatLabel(stats.to)}) 중 {stats.firing.toLocaleString("en-US")}
      {unit}({stats.pct.toFixed(1)}%)에서 주의 이상이 켜졌습니다.
      {frequent &&
        ` ${FREQUENT_FIRING_PCT}%를 넘어 신호가 자주 켜지는 편이니, 주의·경보를 그만큼 걸러서 읽어 주세요.`}
    </p>
  );
}
