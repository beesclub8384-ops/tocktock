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
  qaThreads?: QAThread[]; // 이 매매에 연결된 Q&A 스레드 목록 (옵셔널)
  pendingAnalysis?: boolean; // 시장 데이터 대기 중 (첫 질문 생성 보류)
}

/** 매매 기록 내부 Q&A 스레드 상태 */
export type QAThreadStatus = "open" | "completed" | "impossible";

/** 매매 기록 내부의 Q&A 스레드 */
export interface QAThread {
  id: string;
  title: string;
  status: QAThreadStatus;
  statusReason?: string;
  createdAt: string;
  replies: QAReply[];
}

export type QAAuthor = "태양" | "용태" | "system";

export interface QAReply {
  id: string;
  author: QAAuthor;
  content: string;
  createdAt: string; // ISO timestamp
}

/** 탭에 표시하는 독립 Q&A 아이템 (과거 호환용, 신규 생성은 없음) */
export interface QAItem {
  id: string;
  title: string;
  replies: QAReply[];
  createdAt: string;
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

/** 메모에서 추출해 수치화 처리된 조건 */
export interface QuantifiedCondition {
  id: string;
  condition: string;
  value: string | null;
  status: "completed" | "impossible" | "pending";
  reason: string;
  sourceRecordId: string;
  sourceThreadId: string;
  createdAt: string;
}

/** 클로드가 자동 업데이트하는 용태형 매매 패턴 요약 */
export interface TradingPattern {
  updatedAt: string;
  basedOnRecords: number;
  longConditions: string[];
  shortConditions: string[];
  exitConditions: string[];
  avoidConditions: string[];
  summary: string;
  confidence: "low" | "medium" | "high";
}

/** 주기적 Redis 사용량 점검 결과 (무료 256MB 한도 경보용) */
export interface RedisUsageLog {
  checkedAt: string; // ISO timestamp
  totalBytes: number;
  totalMB: number;
  usagePercent: number; // 0~100, 256MB 대비
  keyCount: number;
  warning: boolean; // 80% 이상이면 true
}

/** 동적으로 추가된 수집 대상 심볼 (메모/댓글 자동 감지) */
export interface DynamicSymbol {
  id: string;
  symbol: string; // Yahoo Finance 심볼 또는 'KIS:종목코드'
  name: string; // 표시명 (예: '나스닥', 'VIX')
  source: "yahoo" | "kis";
  addedAt: string; // ISO timestamp
  addedFrom: string; // 어느 매매 기록에서 감지됐는지 (recordId)
  mentionedText: string; // 원문 (예: "나스닥 흐름을 봤다")
}

export const FUTURES_REDIS_KEY = "futures-trading:records";
export const QA_REDIS_KEY = "futures-trading:qa";
export const MSG_REDIS_KEY = "futures-trading:messages";
export const QUANTIFIED_REDIS_KEY = "futures-trading:quantified";
export const MARKET_DATA_REDIS_KEY_PREFIX = "futures-trading:market-data:";
export const MARKET_DATA_INDEX_KEY = "futures-trading:market-data-index"; // 날짜 목록
export const TRADING_PATTERN_KEY = "futures-trading:pattern";
export const DYNAMIC_SYMBOLS_KEY = "futures-trading:dynamic-symbols";
export const SYSTEM_REDIS_USAGE_KEY = "system:redis-usage-log";
