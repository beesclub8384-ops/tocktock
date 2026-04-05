export interface FuturesRecord {
  id: string;
  date: string; // YYYY-MM-DD
  direction: "long" | "short";
  entryTime: string; // HH:MM
  entryPoint: number;
  exitTime: string; // HH:MM
  exitPoint: number;
  contracts: number;
  pnl: number; // 원 단위
  memo: string;
  createdAt: string; // ISO timestamp
}

export interface FuturesStore {
  records: FuturesRecord[];
}

export const FUTURES_REDIS_KEY = "futures-trading:records";
