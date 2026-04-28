/**
 * 투자자 동향 추적 도구 — 타입 정의
 *
 * 모든 데이터 소스 (KIS, Naver, KRX OpenAPI 등)는 NormalizedTrend 형태로 응답한다.
 * 단위는 일관되게 사용:
 *   - 수량(shares): 주
 *   - 거래대금(value): 원 (₩)
 *   - 가격(price): 원 (₩)
 * 매수=양수, 매도=음수.
 */

export type InvestorEntity = "foreign" | "institution" | "individual" | "otherCorp";

/** 한 일자의 한 주체 매매 정보. 수량/대금 모두 옵셔널 (소스마다 제공 범위 다름). */
export interface InvestorEntry {
  /** 순매수 수량 (주). 매수=양수, 매도=음수. null이면 해당 소스가 미제공. */
  shares: number | null;
  /** 순매수 대금 (원). 매수=양수, 매도=음수. null이면 해당 소스가 미제공. */
  value: number | null;
}

export interface DailyTrend {
  /** YYYY-MM-DD (KST 기준) */
  date: string;
  /** 종가 (원). 일부 소스는 미제공 가능 → null */
  close: number | null;
  foreign: InvestorEntry;
  institution: InvestorEntry;
  /** 개인은 일부 소스만 제공 (KIS만, Naver는 미제공) */
  individual: InvestorEntry | null;
  /** 기타법인 (KRX 4주체일 때만) */
  otherCorp: InvestorEntry | null;
  /** 이 행을 제공한 데이터 소스 표식 */
  source: "kis" | "naver" | "krx" | "archive";
}

export interface CumulativeTotals {
  /** 누적 순매수 수량 (주). 데이터 없으면 null. */
  shares: number | null;
  /** 누적 순매수 대금 (원). 데이터 없으면 null. */
  value: number | null;
}

export interface CumulativeTrend {
  foreign: CumulativeTotals;
  institution: CumulativeTotals;
  /** 개인 누적: 기간 내 KIS 데이터 (최근 30일)만 합산 가능. */
  individual: CumulativeTotals | null;
  otherCorp: CumulativeTotals | null;
}

export interface ProviderCapabilities {
  /** 개인 매매 데이터 제공 여부 */
  hasIndividual: boolean;
  /** 기타법인 제공 여부 */
  hasOtherCorp: boolean;
  /** 거래대금(원) 제공 여부 (false면 수량만) */
  hasTradingValue: boolean;
  /** 과거 조회 가능 일수 (Infinity 가능). KIS=30, Naver=수년, KRX=무제한 */
  maxHistoryDays: number;
  /** 사람이 읽는 소스 이름 (UI에 표시) */
  providerName: string;
  /** 데이터 한계 노트 (UI 하단에 표시) */
  notes: string[];
}

/** 자동 누적 추적 메타데이터 (해당 종목이 universe에 들어가 매일 KIS 데이터가 쌓이는지) */
export interface TrackingInfo {
  /** 추적 대상이면 true. universe에 포함되며 매일 새벽 cron이 KIS 데이터를 누적 저장 중. */
  isTracked: boolean;
  /** 누적된 거래일 수. 0이면 archive 비어있음. */
  daysTracked: number;
  /** 누적 데이터 첫 날짜 (YYYY-MM-DD), 없으면 null */
  firstDate: string | null;
  /** 누적 데이터 마지막 날짜 (YYYY-MM-DD), 없으면 null */
  lastDate: string | null;
}

export interface NormalizedTrend {
  symbol: string;
  /** 종목명 (조회 가능 시) */
  name: string | null;
  /** 분석 기간 시작일 (사용자 입력) */
  startDate: string;
  /** 분석 기간 종료일 (어제 또는 사용자 입력) */
  endDate: string;
  daily: DailyTrend[];
  cumulative: CumulativeTrend;
  capabilities: ProviderCapabilities;
  /** 응답 생성 시각 (ISO) */
  fetchedAt: string;
  /** 자동 추적 메타데이터 (없으면 비추적 종목) */
  tracking?: TrackingInfo;
}

export interface InvestorFlowApiResponse {
  data: NormalizedTrend | null;
  error?: string;
  /** Redis 캐시 적중 여부 (디버깅용) */
  cached?: boolean;
}
