// 슈퍼투자자 종목 선정 관련 타입 및 상수

export interface SuperinvestorStock {
  ticker: string;
  companyName: string;
  score: number;
  grade: string; // '강력추천' | '주목' | '관심'
  signal1: { buyerCount: number; buyers: string[]; points: number };
  signal2: { maxWeight: number; priceChange: number; points: number };
  signal3: { insiderBuys: number; points: number };
  currentPrice: number;
  reportedPrice: number;
  priceChangePercent: number;
  lastUpdated: string; // ISO 날짜
}

export interface SuperinvestorData {
  stocks: SuperinvestorStock[];
  lastUpdated: string;
}

/** 슈퍼투자자 매매 활동 (파싱 중간 데이터) */
export interface ActivityRecord {
  ticker: string;
  companyName: string;
  investor: string;
  activityType: "Buy" | "Add" | "Reduce" | "Sell";
  changePercent: number; // Add 3.78% → 3.78
  portfolioWeight: number; // % change to portfolio
}

/** 개별 종목 인사이더 데이터 */
export interface InsiderData {
  ticker: string;
  buyCount: number;
  buyTotal: number; // 달러
  sellCount: number;
  sellTotal: number;
}

// Redis 키
export const SUPERINVESTOR_KEY = "superinvestor:stocks";
export const SUPERINVESTOR_TTL = 86400; // 24시간

// 점수 등급 기준
export const GRADE_THRESHOLDS = {
  STRONG: { min: 80, label: "강력추천" },
  WATCH: { min: 60, label: "주목" },
  INTEREST: { min: 40, label: "관심" },
} as const;

// 최소 표시 점수
export const MIN_DISPLAY_SCORE = 40;
