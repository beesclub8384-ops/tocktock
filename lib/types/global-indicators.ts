export interface LiveIndicatorData {
  id: string;
  value: number | null;
  change: number | null;
  unit: string;
  /** 값의 기준을 밝히는 짧은 설명(예: "2026년 9월, 전년 동월 대비"). 변화값이 없는 카드에 보인다 (미션 9) */
  label?: string;
  /** 이번에 못 받았을 때 마지막으로 받은 값과 받은 날짜(KST) — 화면은 고정값 대신 이것을 안내와 함께 보여 준다 (미션 11) */
  lastGood?: { value: number; unit: string; asOf: string; label?: string };
}

export interface GlobalIndicatorsResponse {
  data: LiveIndicatorData[];
  /** "origin" = 원출처(연준 이사회·BLS·BEA), "fred" = FRED 경유 (미션 8) */
  dataSource?: "origin" | "fred";
  fetchedAt: string;
}
