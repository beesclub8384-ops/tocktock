/**
 * 관측소 출처 전환 설정 — 이 파일 한 곳에서 FRED ↔ 원출처를 바꾼다 (2026-10-19 미션 5).
 *
 * 배경: FRED 이용 약관(/legal 의 게시 조항, (p)(l))은 FRED 로 받은 값을 저장해 공개 사이트에 보여 주는 데
 * 서면 허락이 필요할 수 있다. 그래서 원출처(연준 이사회·뉴욕 연은)에서 직접 받도록 바꿨다.
 * 전환한 14개 시리즈(연준 이사회 13 — IORB 포함 —, 뉴욕 연은 SOFR 1)는 FRED 값과 원출처 값을 전 기간 대조해 불일치 0 을
 * 확인했다(docs/observatory-decision-log.md 17장). 관측소가 쓰던 FRED 시리즈 18개 = 전환 14 + 미전환 2(역레포·레포) + 수집 중단 2(지수).
 *
 * ⚠ 되돌리기(OBSERVATORY_SOURCE=fred)는 비상용이다. 되돌리면 FRED 고지는 자동으로 모든 해당 페이지에 나오지만,
 *   각 페이지의 출처 문장("연준 이사회 H.4.1" 등)은 고정 문구라 그대로 남는다 — 오래 되돌릴 거면 출처 문장도 고칠 것.
 *
 * 되돌리기:
 *  - 전부 FRED 로: 환경변수 OBSERVATORY_SOURCE=fred
 *  - 한 시리즈만: 아래 ORIGIN_SERIES 에서 빼면 그 시리즈는 FRED 로 받는다(수집 코드의 FRED 경로는 그대로 남아 있다).
 *
 * 전환하지 않은 FRED 시리즈와 이유:
 *  - RRPONTSYD(역레포)·RPONTTLD(레포): FRED 는 같은 결제일의 운영이 여러 건이면 한 건만 싣는 것으로 보이고
 *    (2020-02-19, 2019-12-31), 특수 휴장 전날 운영이 빠지며(성금요일 전날 등), 레포는 2000년 1~7월이 뉴욕 연은
 *    API 에 없다. 원출처 정의로 설명되지 않는 차이라 전환하지 않았다(사람 결정 항목).
 *  - SP500·NASDAQCOM: 저작권자 사전 승인 필요 시리즈라 수집 자체를 끈다(MARKET_INDEX_COLLECTION).
 */

/** 원출처에서 받는 FRED 시리즈 ID (대조 통과분) */
export const ORIGIN_SERIES = new Set<string>([
  // 연준 이사회 H.4.1
  "WRESBAL",
  "WLCFLPCL",
  // 연준 이사회 Z.1
  "BOGZ1FL403069330Q",
  // 연준 이사회 H.8
  "DPSSCBW027NBOG",
  "DPSLCBW027NBOG",
  "LNFACBW027SBOG",
  "TOTLL",
  // 연준 이사회 대출 상각·연체율(CHGDEL)
  "CORBLACBS",
  "DRCRELEXFACBS",
  "DRCRELEXFT100S",
  "DRCRELEXFOBS",
  // 연준 이사회 H.15
  "DGS10",
  // 연준 이사회 정책금리(PRATES)
  "IORB",
  // 뉴욕 연은 참조금리
  "SOFR",
]);

/** 이 시리즈를 원출처에서 받는가 */
export function isOriginSource(fredSeriesId: string): boolean {
  if (process.env.OBSERVATORY_SOURCE === "fred") return false;
  return ORIGIN_SERIES.has(fredSeriesId);
}

/**
 * 주가지수(SP500·NASDAQCOM) 수집 — 꺼 둔다.
 * FRED 등급 "Copyrighted: Pre-approval required" 라 승인 없이 저장·게시할 수 없고, 화면에서도 쓰지 않는다(미션 4).
 * 수집 코드(lib/observatory-market-index.ts)는 남겨 두었다. 승인을 받으면 true 로 바꾸면 된다.
 */
export const MARKET_INDEX_COLLECTION = false;

/**
 * 지표 → 그 지표가 쓰는 FRED 시리즈. 원출처로 바꾼 시리즈만 쓰면 그 지표는 FRED 를 쓰지 않는다.
 * FRED API 이용 약관의 고지("This product uses the FRED® API …")는 FRED 를 쓰는 지표가 보이는 페이지에만 둔다.
 * (주가지수 SP500·NASDAQCOM 은 화면에서 쓰지 않아 넣지 않았다)
 */
export const INDICATOR_FRED_SERIES: Record<string, string[]> = {
  rrp: ["RRPONTSYD"],
  reserves: ["WRESBAL"],
  "sofr-iorb": ["SOFR", "IORB"],
  srf: ["RPONTTLD"],
  "discount-window": ["WLCFLPCL"],
  fhlb: ["BOGZ1FL403069330Q"],
  "deposit-flight": ["DPSSCBW027NBOG", "DPSLCBW027NBOG"],
  cre: ["DRCRELEXFT100S", "DRCRELEXFOBS", "DRCRELEXFACBS"],
  "nbfi-loans": ["LNFACBW027SBOG", "TOTLL"],
  "rate-volatility": ["DGS10"],
  "business-chargeoffs": ["CORBLACBS"],
};

/** 이 지표들 중 하나라도 아직 FRED 에서 받는가 */
export function anyUsesFred(indicatorKeys: string[]): boolean {
  return indicatorKeys.some((k) => (INDICATOR_FRED_SERIES[k] ?? []).some((id) => !isOriginSource(id)));
}
