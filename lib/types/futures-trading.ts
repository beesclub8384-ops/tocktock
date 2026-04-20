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

export type QAAuthor = "태양" | "용태";

export interface QAReply {
  id: string;
  author: QAAuthor;
  content: string;
  createdAt: string; // ISO timestamp
}

export interface QAItem {
  id: string;
  title: string;        // 최초 질문(스레드 제목)
  replies: QAReply[];   // 스레드 댓글 목록
  createdAt: string;    // 스레드 생성 시각 (ISO)
}

/** 마이그레이션 전 옛 구조 (Redis에 남아있을 수 있음) */
export interface LegacyQAItem {
  id: string;
  question?: string;
  answer?: string;
  createdAt: string;
  answeredAt?: string;
}

export interface MessageItem {
  id: string;
  author: QAAuthor;
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
