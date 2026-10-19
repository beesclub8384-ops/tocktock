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
  period: string; // allact.php Period 열 (예: "Q2 2026"), 못 읽으면 ""
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
  quarter: string; // 집계 기준 분기 (예: "Q2 2026"), Period 열을 못 읽으면 ""
  failedTickers: string[]; // stock.php 를 재시도 후에도 못 가져온 티커 (할인·내부자 섹션에서 빠짐)
  lastUpdated: string;
}

// Redis 키
export const REDIS_KEYS = {
  DATA: "superinvestor:v2",
  LOCK: "lock:cron:superinvestor-scan",
} as const;

// 30일 — 수집이 3번 연속 실패해도 지난 데이터 유지. 데이터 시각은 화면의 수집 시각으로 확인
export const SUPERINVESTOR_TTL = 2592000;

// 수집 결과 최소 기준. 미달이면 Dataroma 구조 변경 등으로 파싱이 깨진 것으로 보고 저장하지 않는다.
// 근거: 2026-10 기준 활동 약 721건(분기 필터 전), 투자자 83명, 동시 매수 51개
export const MIN_ACTIVITIES = 100;
export const MIN_MANAGERS = 40;
export const MIN_CONSENSUS = 5;

// Add 를 동시 매수로 인정하는 최소 변화율 (단위: 보유 주식 수 변화율 %)
// 예: "Add 0.22%" 는 사실상 비중 유지라 제외
export const MIN_ADD_PERCENT = 1;
