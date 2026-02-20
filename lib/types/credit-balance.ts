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
    mean: number;
    std: number;
    cautionLine: number;    // mean + 0σ (= mean)
    dangerLine: number;     // mean + 1σ
    current: number;        // 최신 과열지수
    status: "safe" | "caution" | "danger";
  };
}
