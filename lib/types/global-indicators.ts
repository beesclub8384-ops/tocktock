export interface LiveIndicatorData {
  id: string;
  value: number | null;
  change: number | null;
  unit: string;
}

export interface GlobalIndicatorsResponse {
  data: LiveIndicatorData[];
  fetchedAt: string;
}
