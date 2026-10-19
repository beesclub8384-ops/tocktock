export interface LiveIndicatorData {
  id: string;
  value: number | null;
  change: number | null;
  unit: string;
}

export interface GlobalIndicatorsResponse {
  data: LiveIndicatorData[];
  /** "origin" = 원출처(연준 이사회·BLS·BEA), "fred" = FRED 경유 (미션 8) */
  dataSource?: "origin" | "fred";
  fetchedAt: string;
}
