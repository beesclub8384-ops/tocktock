export interface CreditBalanceItem {
  date: string;             // YYYY-MM-DD
  totalLoan: number;        // 신용융자 전체 (억원)
  kospiLoan: number;        // 유가증권 융자
  kosdaqLoan: number;       // 코스닥 융자
  totalShortSell: number;   // 대주 전체
  depositLoan: number;      // 예탁증권담보융자
}

export interface OverheatIndexItem {
  date: string;             // YYYY-MM-DD
  index: number;            // 과열지수 = totalLoan / (KOSPI + KOSDAQ)
}

export interface OverheatIndexResponse {
  data: OverheatIndexItem[];
  stats: {
    interestLine: number;   // 0.500% — 관심 구간 시작
    cautionLine: number;    // 0.750% — 주의 구간 시작
    dangerLine: number;     // 0.850% — 위험 구간 시작
    current: number;        // 최신 과열지수
    status: "safe" | "interest" | "caution" | "danger";
    dataPoints: number;     // 분석 기반 데이터 수 (25년간 6,164일)
  };
  source: "marketCap" | "indexClose";
}
