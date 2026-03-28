export interface MarketEvent {
  date: string;           // "2026-03-29"
  symbol: string;         // "^GSPC"
  name: string;           // "S&P 500"
  changePercent: number;  // -2.31
  direction: "상승" | "하락";
  summary: string;        // AI 요약 3줄 (줄바꿈 \n으로 구분)
  searchedAt: string;     // ISO timestamp
}

export interface MarketEventsStore {
  events: MarketEvent[];
  lastUpdated: string;
}

export const MARKET_EVENT_THRESHOLD = 1.5; // ±1.5% 이상일 때 기록

export const WATCHED_SYMBOLS = [
  { symbol: "^GSPC", name: "S&P 500", market: "US" },
  { symbol: "^IXIC", name: "나스닥", market: "US" },
  { symbol: "^KS11", name: "코스피", market: "KR" },
  { symbol: "^KQ11", name: "코스닥", market: "KR" },
] as const;
