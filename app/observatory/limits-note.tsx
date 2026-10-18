/**
 * 한계와 반영 시점을 밝히는 공용 문단 — 관측소 1·2 상세 페이지 하단, 판정 기준 문단(CriteriaNote) 위에 둔다.
 *
 * 관측소 3~6 페이지는 처음부터 한계 상자와 "언제 반영되나요" 절이 있었지만, 관측소 1·2 페이지에는
 * 없거나 흩어져 있었다(미션 3 공개 전 검수에서 발견). 관측소 작업 규칙 2(각 상세 페이지에 한계 문구와
 * 시차 문구)를 맞추려고 추가했다. 시차는 2026-10-18 FRED 최초 공개일(ALFRED output_type=4)로 잰 값이다.
 *
 * ⚠ "use client" 를 넣지 않는다 (상세 페이지는 서버 컴포넌트다).
 */
export function LimitsNote({ limits, timing }: { limits: string; timing: string }) {
  // 두 값 모두 완결된 존댓말 문장으로 넘긴다
  return (
    <div className="mb-2 space-y-1 text-xs text-zinc-500 leading-relaxed">
      <p>한계: {limits}</p>
      <p>반영 시점: {timing}</p>
    </div>
  );
}
