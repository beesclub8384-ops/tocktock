// 슈퍼투자자 페이지 타입 정의

// ── 섹션 1: 동시 매수 종목 ──
export interface ConsensusStock {
  ticker: string;
  companyName: string;
  buyerCount: number;
  buyers: { name: string; activityType: "Buy" | "Add" }[];
}

// ── 섹션 2: 할인 중인 거물 종목 ──
export interface DiscountStock {
  ticker: string;
  companyName: string;
  topHolder: string;
  topHolderWeight: number;
  holdPrice: number;
  currentPrice: number;
  discountPercent: number;
  holderCount: number;
}

// ── 섹션 3: 거물 + 내부자 동시 매수 ──
export interface InsiderStock {
  ticker: string;
  companyName: string;
  superinvestorCount: number;
  insiderBuyCount: number;
  insiderBuyAmount: number;
}

// ── 섹션 4: 투자자 목록 / 보유 종목 ──
export interface Manager {
  code: string;
  name: string;
}

export interface Holding {
  ticker: string;
  companyName: string;
  weightPercent: number;
  activity: string;
  reportedPrice: number;
  currentPrice: number;
  changePct: number;
}

// ── 매매 활동 파싱 중간 데이터 ──
export interface ActivityRecord {
  ticker: string;
  companyName: string;
  investor: string;
  activityType: "Buy" | "Add" | "Reduce" | "Sell";
  changePercent: number;
  portfolioWeight: number;
}

// ── stock.php 파싱 결과 ──
export interface StockDetail {
  ticker: string;
  holdPrice: number;
  holders: { name: string; weight: number; activity: string }[];
  insiderBuyCount: number;
  insiderBuyAmount: number;
}

// ── Redis 저장 구조 ──
export interface SuperinvestorStore {
  consensus: ConsensusStock[];
  discount: DiscountStock[];
  insider: InsiderStock[];
  managers: Manager[];
  lastUpdated: string;
}

// Redis 키
export const REDIS_KEYS = {
  DATA: "superinvestor:v2",
  LOCK: "lock:cron:superinvestor-scan",
} as const;

export const SUPERINVESTOR_TTL = 604800; // 7일
