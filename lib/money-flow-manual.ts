// ---------------------------------------------------------------------------
// 돈의 흐름 지표 — 수동 업데이트 데이터
// API로 자동화하기 어려운 정성적 지표를 여기에 관리합니다.
// 업데이트: 이 파일의 값만 수정하면 페이지에 반영됩니다.
// ---------------------------------------------------------------------------

export interface ManualIndicator {
  value: string;
  change: number; // 양수 = 상승, 음수 = 하락, 0 = 보합
  updatedAt: string; // YYYY-MM-DD
}

export interface ManualData {
  // 중앙은행
  fomcDotPlot: ManualIndicator;
  // 대형 금융기관
  filing13F: ManualIndicator;
  // 투기 자본
  shortInterest: ManualIndicator;
  cotReport: ManualIndicator;
  // 대형 기업
  earnings: ManualIndicator;
  capex: ManualIndicator;
  buybacks: ManualIndicator;
  // 정부
  regulationPolicy: ManualIndicator;
  // 규제기관
  financialRegulation: ManualIndicator;
  antitrustProbe: ManualIndicator;
  fxIntervention: ManualIndicator;
  // 개인 투자자
  retailFlow: ManualIndicator;
}

/** 수동 업데이트 데이터 — 필요 시 여기 값만 수정 */
export const manualData: ManualData = {
  // ── 중앙은행 ──
  fomcDotPlot: {
    value: "연내 2회 인하 전망",
    change: 1,
    updatedAt: "2025-03-19",
  },

  // ── 대형 금융기관 ──
  filing13F: {
    value: "빅테크 비중 확대",
    change: 1,
    updatedAt: "2025-02-14",
  },

  // ── 투기 자본 ──
  shortInterest: {
    value: "S&P 500: 2.3%",
    change: 0.2,
    updatedAt: "2025-03-01",
  },
  cotReport: {
    value: "투기적 롱 우위",
    change: 1,
    updatedAt: "2025-02-28",
  },

  // ── 대형 기업 ──
  earnings: {
    value: "AI 관련 매출 급증",
    change: 1,
    updatedAt: "2025-02-15",
  },
  capex: {
    value: "$78B (전분기 대비 +15%)",
    change: 1,
    updatedAt: "2025-02-15",
  },
  buybacks: {
    value: "$42B (분기)",
    change: 0.5,
    updatedAt: "2025-02-15",
  },

  // ── 정부 ──
  regulationPolicy: {
    value: "관세 확대 기조",
    change: -1,
    updatedAt: "2025-03-01",
  },

  // ── 규제기관 ──
  financialRegulation: {
    value: "자본 요건 완화 논의",
    change: 1,
    updatedAt: "2025-02-20",
  },
  antitrustProbe: {
    value: "빅테크 AI 반독점 조사 진행 중",
    change: -0.5,
    updatedAt: "2025-03-01",
  },
  fxIntervention: {
    value: "일본 BOJ 구두개입 주시",
    change: 0,
    updatedAt: "2025-02-28",
  },

  // ── 개인 투자자 ──
  retailFlow: {
    value: "AI·반도체 순매수 집중",
    change: 1,
    updatedAt: "2025-03-01",
  },
};
