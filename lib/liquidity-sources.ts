import { isSiteOriginSeries } from "@/lib/site-source-config";

/** 이 화면이 FRED 로 받는 시리즈와 FRED 경유 출처 표기 (FRED 등급 "Copyrighted: Citation required" 는 원출처 + FRED 표기) */
const FRED_CITATION: Record<string, string> = {
  NFCI: "Federal Reserve Bank of Chicago, Chicago Fed National Financial Conditions Index [NFCI], retrieved from FRED",
  TEDRATE: "Federal Reserve Bank of St. Louis, TED Spread [TEDRATE], retrieved from FRED",
  WALCL: "Board of Governors of the Federal Reserve System, via FRED",
  WTREGEN: "Board of Governors of the Federal Reserve System, via FRED",
  M2SL: "Board of Governors of the Federal Reserve System, via FRED",
  T10Y2Y: "Federal Reserve Bank of St. Louis, 10-Year Treasury Constant Maturity Minus 2-Year [T10Y2Y], retrieved from FRED",
  RRPONTSYD: "Federal Reserve Bank of New York, Overnight Reverse Repurchase Agreements [RRPONTSYD], retrieved from FRED",
};

/** 미국 유동성 화면(/liquidity/us, 백테스트)에서 FRED 로 받는 시리즈와 그 출처 표기 (미션 8) */
export function liquiditySources(ids: string[]): { fredSeries: string[]; fredCitations: string[] } {
  const fredSeries = ids.filter((id) => !isSiteOriginSeries(id));
  return { fredSeries, fredCitations: fredSeries.map((id) => FRED_CITATION[id] ?? `${id}, retrieved from FRED`) };
}
