export interface OHLCData {
  time: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ChartInterval = "1d" | "1wk" | "1mo";

export interface StockChartResponse {
  symbol: string;
  interval: ChartInterval;
  data: OHLCData[];
}

export interface TrendlinePoint {
  time: string;
  value: number;
}

export interface TrendlineData {
  direction: "support" | "resistance" | "cross";
  touchCount: number;
  points: TrendlinePoint[];
}

export interface TrendlineResponse {
  symbol: string;
  trendlines: TrendlineData[];
}
