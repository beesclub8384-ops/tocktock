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

export interface ChannelData {
  direction: "uptrend" | "downtrend";
  mainLine: TrendlinePoint[];
  mainTouchCount: number;
  tunnelLine: TrendlinePoint[];
  tunnelTouchCount: number;
}

export interface TrendlineResponse {
  symbol: string;
  channels: ChannelData[];
}
