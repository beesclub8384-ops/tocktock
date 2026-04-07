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

export interface QAItem {
  id: string;
  question: string;
  answer: string;        // 빈 문자열이면 미답변
  createdAt: string;     // 질문 등록 시각 (ISO)
  answeredAt: string;    // 답변 등록 시각 (ISO, 빈 문자열이면 미답변)
}

export interface MessageItem {
  id: string;
  author: "태양" | "용태";
  content: string;
  createdAt: string; // ISO timestamp
}

export interface MessageStore {
  messages: MessageItem[];
}

export interface FuturesStore {
  records: FuturesRecord[];
}

export interface QAStore {
  qa: QAItem[];
}

export const FUTURES_REDIS_KEY = "futures-trading:records";
export const QA_REDIS_KEY = "futures-trading:qa";
export const MSG_REDIS_KEY = "futures-trading:messages";
