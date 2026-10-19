export interface LiveIndicatorData {
  id: string;
  value: number | null;
  change: number | null;
  unit: string;
  /** 값의 기준을 밝히는 짧은 설명(예: "2026년 9월, 전년 동월 대비"). 변화값이 없는 카드에 보인다 (미션 9) */
  label?: string;
}

export interface GlobalIndicatorsResponse {
  data: LiveIndicatorData[];
  /** "origin" = 원출처(연준 이사회·BLS·BEA), "fred" = FRED 경유 (미션 8) */
  dataSource?: "origin" | "fred";
  fetchedAt: string;
}
