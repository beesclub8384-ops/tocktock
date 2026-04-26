/**
 * 한국 시장 매력도 분석 도구 설정
 */

// 판정 기준 (이익수익률 - 채권/시장 스프레드, 단위: %p)
export const VERDICT_THRESHOLDS = {
  attractive: 5,   // +5%p 이상: 🟢 매력적
  neutral: 0,      // 0~+5%p:    🟡 중립
  // < 0:                          🔴 비매력
} as const;

// 안전 필터
export const SAFETY_FILTER = {
  minMarketCapKRW: 1_000_0000_0000,   // 1,000억원 (소형주 데이터 신뢰도 ↓)
  minPositiveEpsRequired: true,       // EPS ≤ 0 (적자) 제외
  maxReasonablePE: 100,                // PER 100배 초과 제외 (이상치)
  minReasonablePE: 1,                  // PER 1배 미만 제외 (이상치)
} as const;

// 사이클 산업 키워드 — 회사명/산업명에 포함되면 ⚠️ 표시
// 우선순위: 더 구체적인 산업이 먼저(자동차/조선이 "장비"보다 먼저 잡혀야 함)
export const CYCLICAL_KEYWORDS: { pattern: RegExp; label: string }[] = [
  { pattern: /자동차|현대차|기아|모비스|타이어|쌍용차|넥센타이어/, label: "자동차" },
  { pattern: /조선|HD현대|한화오션|삼성중공업|현대미포|선박|운송장비.{0,3}부품/, label: "조선/중공업" },
  { pattern: /해운|HMM|팬오션|선사|컨테이너/, label: "해운" },
  { pattern: /건설|GS건설|대우건설|HDC|DL이앤씨|시멘트|레미콘/, label: "건설" },
  { pattern: /철강|POSCO|포스코|현대제철|동국제강/, label: "철강" },
  { pattern: /화학|롯데케미칼|LG화학|한화솔루션|석유화학|정유|S\-Oil/, label: "화학/정유" },
  { pattern: /반도체장비|반도체.{0,5}소재|소부장|식각|증착|에스앤에스텍/, label: "반도체장비" },
  { pattern: /항공|대한항공|아시아나|LCC|티웨이/, label: "항공" },
];

export function detectCyclical(
  symbol: string,
  longName: string | null | undefined,
  industry: string | null | undefined
): string | null {
  const blob = `${symbol} ${longName ?? ""} ${industry ?? ""}`;
  for (const c of CYCLICAL_KEYWORDS) {
    if (c.pattern.test(blob)) return c.label;
  }
  return null;
}

// 한국 시가총액 상위 종목 정적 리스트 — 스크리닝용
// 각각 { symbol, name } 형태. 폴백을 위해 .KS/.KQ 명시.
export interface KoreaStock {
  symbol: string;     // Yahoo 티커 (.KS / .KQ 포함)
  altSymbol?: string; // 거래소 폴백
  name: string;
  market: "kospi" | "kosdaq";
}

export const KOSPI_TOP: KoreaStock[] = [
  { symbol: "005930.KS", name: "삼성전자",          market: "kospi" },
  { symbol: "000660.KS", name: "SK하이닉스",       market: "kospi" },
  { symbol: "207940.KS", name: "삼성바이오로직스",   market: "kospi" },
  { symbol: "373220.KS", name: "LG에너지솔루션",    market: "kospi" },
  { symbol: "005380.KS", name: "현대차",            market: "kospi" },
  { symbol: "035420.KS", name: "NAVER",             market: "kospi" },
  { symbol: "000270.KS", name: "기아",              market: "kospi" },
  { symbol: "105560.KS", name: "KB금융",            market: "kospi" },
  { symbol: "005490.KS", name: "POSCO홀딩스",       market: "kospi" },
  { symbol: "035720.KS", name: "카카오",            market: "kospi" },
  { symbol: "028260.KS", name: "삼성물산",          market: "kospi" },
  { symbol: "055550.KS", name: "신한지주",          market: "kospi" },
  { symbol: "012330.KS", name: "현대모비스",        market: "kospi" },
  { symbol: "086790.KS", name: "하나금융지주",      market: "kospi" },
  { symbol: "015760.KS", name: "한국전력",          market: "kospi" },
  { symbol: "003670.KS", name: "포스코퓨처엠",      market: "kospi" },
  { symbol: "068270.KS", name: "셀트리온",          market: "kospi" },
  { symbol: "042660.KS", name: "한화오션",          market: "kospi" },
  { symbol: "010130.KS", name: "고려아연",          market: "kospi" },
  { symbol: "009150.KS", name: "삼성전기",          market: "kospi" },
  { symbol: "011170.KS", name: "롯데케미칼",        market: "kospi" },
  { symbol: "032830.KS", name: "삼성생명",          market: "kospi" },
  { symbol: "003550.KS", name: "LG",                market: "kospi" },
  { symbol: "017670.KS", name: "SK텔레콤",          market: "kospi" },
  { symbol: "138040.KS", name: "메리츠금융지주",    market: "kospi" },
  { symbol: "034730.KS", name: "SK",                market: "kospi" },
  { symbol: "030200.KS", name: "KT",                market: "kospi" },
  { symbol: "000810.KS", name: "삼성화재",          market: "kospi" },
  { symbol: "316140.KS", name: "우리금융지주",      market: "kospi" },
  { symbol: "024110.KS", name: "기업은행",          market: "kospi" },
];

export const KOSDAQ_TOP: KoreaStock[] = [
  { symbol: "247540.KQ", name: "에코프로비엠",      market: "kosdaq" },
  { symbol: "086520.KQ", name: "에코프로",          market: "kosdaq" },
  { symbol: "196170.KQ", name: "알테오젠",          market: "kosdaq" },
  { symbol: "028300.KQ", name: "HLB",               market: "kosdaq" },
  { symbol: "263750.KQ", name: "펄어비스",          market: "kosdaq" },
  { symbol: "293490.KQ", name: "카카오게임즈",      market: "kosdaq" },
  { symbol: "068760.KQ", name: "셀트리온제약",      market: "kosdaq" },
  { symbol: "145020.KQ", name: "휴젤",              market: "kosdaq" },
  { symbol: "277810.KQ", name: "레인보우로보틱스",  market: "kosdaq" },
  { symbol: "058470.KQ", name: "리노공업",          market: "kosdaq" },
  { symbol: "357780.KQ", name: "솔브레인",          market: "kosdaq" },
  { symbol: "240810.KQ", name: "원익IPS",           market: "kosdaq" },
  { symbol: "095340.KQ", name: "ISC",               market: "kosdaq" },
  { symbol: "348370.KQ", name: "엔켐",              market: "kosdaq" },
  { symbol: "041510.KQ", name: "에스엠",            market: "kosdaq" },
  { symbol: "067310.KQ", name: "하나마이크론",      market: "kosdaq" },
  { symbol: "035900.KQ", name: "JYP Ent.",          market: "kosdaq" },
  { symbol: "112040.KQ", name: "위메이드",          market: "kosdaq" },
  { symbol: "036930.KQ", name: "주성엔지니어링",    market: "kosdaq" },
  { symbol: "039030.KQ", name: "이오테크닉스",      market: "kosdaq" },
  { symbol: "108860.KQ", name: "셀바스AI",          market: "kosdaq" },
  { symbol: "066970.KQ", name: "엘앤에프",          market: "kosdaq" },
  { symbol: "214150.KQ", name: "클래시스",          market: "kosdaq" },
  { symbol: "099190.KQ", name: "아이센스",          market: "kosdaq" },
  { symbol: "950140.KQ", name: "잉글우드랩",        market: "kosdaq" },
  { symbol: "078600.KQ", name: "대주전자재료",      market: "kosdaq" },
  { symbol: "131970.KQ", name: "테스나",            market: "kosdaq" },
  { symbol: "192080.KQ", name: "더블유게임즈",      market: "kosdaq" },
  { symbol: "079960.KQ", name: "동양이엔피",        market: "kosdaq" },
  { symbol: "278280.KQ", name: "천보",              market: "kosdaq" },
];

export const REDIS_KEYS = {
  bondYield: "korea-market:bond-yield",
  marketAvg: (m: "kospi" | "kosdaq") => `korea-market:avg:${m}`,
  stock: (sym: string) => `korea-market:stock:${sym.toUpperCase()}`,
  screening: (m: "kospi" | "kosdaq") => `korea-market:screening:${m}`,
} as const;

export const CACHE_TTL = {
  bondYield: 24 * 60 * 60,    // 24시간 (월별 데이터)
  marketAvg: 24 * 60 * 60,    // 24시간
  stock: 6 * 60 * 60,         // 6시간 (장중 PER 변동 무시 안 하기 위해 약간 짧게)
  screening: 24 * 60 * 60,    // 24시간
} as const;
