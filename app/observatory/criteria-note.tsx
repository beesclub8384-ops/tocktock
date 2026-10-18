/**
 * 판정 기준의 성격을 밝히는 공용 문단 — 관측소 1·2 상세 페이지 하단에 둔다.
 *
 * 관측소 1·2 의 기준값(예: RRP 10십억 달러, 미실현손실 10%/20%)은 분포에서 계산한 값이
 * 아니라 이 사이트가 정한 고정값이다. lib/observatory-constants.ts 주석에도 통계적 근거가
 * 적혀 있지 않다(일부는 과거 사례를 참고했다고만 적혀 있다). 그 사실을 독자에게 그대로 밝힌다.
 *
 * ⚠ "use client" 를 넣지 않는다 (상세 페이지는 서버 컴포넌트다).
 */
export function CriteriaNote({ children }: { children: React.ReactNode }) {
  // children 은 완결된 존댓말 문장으로 넘긴다 ("~이면 주의, ~이면 경보입니다.")
  return (
    <p className="mb-2 text-xs text-zinc-500 leading-relaxed">
      판정 기준: {children} 이 기준은 이 사이트가 정한 참고 기준입니다. 통계적으로 검증한 경계가
      아니며, 이 지표는 위기를 미리 알려 주는 용도로 검증된 것이 아닙니다.
    </p>
  );
}
