/**
 * DCF 가치 계산기 설정
 * - 빅테크/플랫폼 우위 종목은 영구성장률 3.5% 적용 (일반은 3.0%)
 * - 사유 메타로 추후 UI 툴팁/설명에 활용
 */

export interface BigTechEntry {
  symbol: string;
  reason: string;
}

export const BIG_TECH_LIST: BigTechEntry[] = [
  // 미국
  { symbol: "GOOGL", reason: "광고 검색 시장 독점적 점유" },
  { symbol: "GOOG",  reason: "광고 검색 시장 독점적 점유" },
  { symbol: "MSFT",  reason: "기업용 SW + 클라우드 양강 구도" },
  { symbol: "META",  reason: "글로벌 SNS 광고 플랫폼 우위" },
  { symbol: "AMZN",  reason: "이커머스 + 클라우드 인프라 1위" },
  { symbol: "ORCL",  reason: "기업용 DB + 클라우드 전환" },
  { symbol: "AAPL",  reason: "프리미엄 디바이스 생태계 락인" },
  { symbol: "NVDA",  reason: "AI 가속기 사실상 표준" },
  // 한국 (Yahoo 티커)
  { symbol: "005930.KS", reason: "메모리 + 파운드리 양대 축" },
  { symbol: "000660.KS", reason: "메모리 시장 글로벌 2위" },
  { symbol: "035420.KS", reason: "한국 검색 광고 우위" },
  { symbol: "035720.KS", reason: "한국 메신저 플랫폼 락인" },
];

const BIG_TECH_INDEX = new Map<string, BigTechEntry>();
for (const e of BIG_TECH_LIST) {
  BIG_TECH_INDEX.set(e.symbol.toUpperCase(), e);
  // 한국 코드는 .KQ 폴백도 동일 사유로 매칭
  if (e.symbol.endsWith(".KS")) {
    BIG_TECH_INDEX.set(e.symbol.replace(".KS", ".KQ").toUpperCase(), e);
  }
}

export function findBigTech(symbols: string[]): BigTechEntry | null {
  for (const s of symbols) {
    const hit = BIG_TECH_INDEX.get(s.toUpperCase());
    if (hit) return hit;
  }
  return null;
}

// DCF 기본 가정 상수
export const DCF_ASSUMPTIONS = {
  perpetualGrowthGeneral: 0.03,
  perpetualGrowthBigTech: 0.035,
  riskFreeRate: 0.043,        // US10Y 약 4.3%
  fallbackMrp: 0.045,
  fallbackDiscount: 0.09,
  fallbackGrowth: 0.05,
  forecastYears: 5,
} as const;

// 베타 구간별 시장 위험 프리미엄
export function mrpForBeta(beta: number | null | undefined): number {
  if (beta == null) return DCF_ASSUMPTIONS.fallbackMrp;
  if (beta < 0.8) return 0.035;
  if (beta < 1.0) return 0.040;
  if (beta < 1.3) return 0.045;
  if (beta < 1.7) return 0.055;
  return 0.065;
}
export function mrpBucketLabel(beta: number | null | undefined): string {
  if (beta == null) return "베타 N/A → 기본";
  if (beta < 0.8) return "매우 안정";
  if (beta < 1.0) return "안정";
  if (beta < 1.3) return "보통";
  if (beta < 1.7) return "높음";
  return "매우 높음";
}

// 샘플 종목 (페이지 빠른 선택용)
export interface SampleStock {
  query: string;       // 사용자가 보는 라벨
  symbols: string[];   // 시도할 yahoo 티커 (.KS/.KQ 자동 폴백)
  display: string;     // 버튼에 표시할 텍스트
}
export const SAMPLE_STOCKS: SampleStock[] = [
  { query: "GOOGL",  symbols: ["GOOGL"],                    display: "GOOGL" },
  { query: "TSLA",   symbols: ["TSLA"],                     display: "TSLA" },
  { query: "ORCL",   symbols: ["ORCL"],                     display: "ORCL" },
  { query: "PLTR",   symbols: ["PLTR"],                     display: "PLTR" },
  { query: "005930", symbols: ["005930.KS", "005930.KQ"],   display: "005930 삼성전자" },
  { query: "042660", symbols: ["042660.KS", "042660.KQ"],   display: "042660 한화오션" },
  { query: "086520", symbols: ["086520.KQ", "086520.KS"],   display: "086520 에코프로" },
  { query: "163280", symbols: ["163280.KQ", "163280.KS"],   display: "163280 에어레인" },
  { query: "187790", symbols: ["187790.KQ", "187790.KS"],   display: "187790 나노" },
];
