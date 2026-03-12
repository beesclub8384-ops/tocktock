export interface Position {
  code: string;
  name: string;
  market: string;
  buyPrice: number;
  buyDate: string;
  quantity: number;
  highestHigh: number; // 보유 중 최고 고가
  trailingStopPrice: number; // 최고가 × 0.97
  absoluteStopPrice: number; // 매수가 × 0.93
}

export interface TradeRecord {
  date: string;
  code: string;
  name: string;
  type: "BUY" | "SELL";
  price: number;
  quantity: number;
  amount: number;
  pnl?: number; // 매도 시 수익금
  pnlRate?: number; // 매도 시 수익률 (%)
  reason?: string; // 매도 사유
}

/** D+2 매수 신호 대기 종목 */
export interface BuySignalCandidate {
  code: string;
  name: string;
  market: string;
  dDate: string; // D일 날짜
  dTradingValue: number; // D일 거래대금
  dClosePrice: number; // D일 종가
  dChangeRate: number; // D일 등락률
  dPlusOneTradingValue: number; // D+1일 거래대금
  dPlusOneClosePrice: number; // D+1일 종가
  stage: "D1_WAITING" | "D2_CHECKING" | "D3_BUY_READY";
  dPlusTwoClosePrice?: number; // D+2일 종가
  dPlusTwoTradingValue?: number; // D+2일 거래대금
}

export interface EquityCurvePoint {
  date: string;
  totalAsset: number;
  cash: number;
  investedValue: number;
  returnRate: number; // %
}

export interface VirtualTradingState {
  cash: number;
  initialCapital: number;
  positions: Position[];
  trades: TradeRecord[];
  candidates: BuySignalCandidate[];
  equityCurve: EquityCurvePoint[];
  lastScanDate: string;
  lastTradeCheckDate: string;
  createdAt: string;
  updatedAt: string;
}

export const INITIAL_CAPITAL = 10_000_000; // 1,000만원
export const MAX_POSITIONS = 5;
export const POSITION_SIZE_RATIO = 0.1; // 자금의 10%
export const MIN_CASH_RATIO = 0.5; // 현금 50% 유지
export const MIN_CASH_FOR_BUY = 1_000_000; // 100만원
export const TRAILING_STOP_PCT = Number(process.env.VIRTUAL_TRAILING_PCT ?? "3") / 100; // 3%
export const ABSOLUTE_STOP_PCT = Number(process.env.VIRTUAL_HARD_STOP_PCT ?? "7") / 100; // 7%

// 매수 조건 상수
export const D_MINUS_1_MAX_VALUE = 30_000_000_000; // D-1 거래대금 ≤ 300억
export const D_DAY_MIN_VALUE = 95_000_000_000; // D일 거래대금 ≥ 950억
export const D_DAY_MAX_VALUE = 500_000_000_000; // D일 거래대금 < 5,000억
export const D_DAY_MIN_CHANGE = 10; // D일 등락률 10%+
export const D_DAY_MAX_CHANGE = 20; // D일 등락률 20% 이하
export const D_PLUS_1_RATIO = 1 / 3; // D+1 거래대금 ≤ D × 1/3
export const D_PLUS_2_MIN_VALUE = 30_000_000_000; // D+2 거래대금 ≥ 300억
