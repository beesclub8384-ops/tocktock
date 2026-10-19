/**
 * 사이트 전체(관측소 밖) 출처 전환 설정 — FRED ↔ 원출처를 이 파일 한 곳에서 바꾼다 (2026-10-19 미션 8).
 *
 * 배경: FRED 이용 약관(/legal)은 FRED 로 받은 값을 저장(캐시)해 공개 사이트에 다시 게시하는 데 서면 허락을 요구할 수
 * 있다(결정 로그 16-1). 관측소는 미션 5·6에서 원출처로 옮겼고, 미션 8에서 관측소 밖 화면도 옮겼다.
 * 관측소는 따로 lib/observatory-source-config.ts(OBSERVATORY_SOURCE)를 쓴다 — 이 스위치는 관측소에 영향이 없다.
 *
 * 되돌리기(비상용): 환경변수 SITE_DATA_SOURCE=fred → 아래 전환 시리즈와 발표 일정을 모두 FRED 에서 받는다.
 * 각 화면의 FRED 수집 코드는 지우지 않고 그대로 두었다. 되돌리면 FRED 고지는 API 의 dataSource 를 보고 화면에 나오지만,
 * 발표 일정(/calendar 팝업, /reports)은 날짜만 쓰므로 고지 자리가 없다(미션 7 이전과 같은 상태가 된다).
 *
 * 전환한 시리즈 (FRED 와 전 기간 대조, 결정 로그 20-3). 값이 다른 곳은 정해 둔 차이다:
 *   T10Y2Y 최신일이 하루 늦음(FRED 는 재무부 자료, 여기는 H.15) · FRED 자체 저장값이 다른 1990년대 3일,
 *   RRPONTSYD 5일(미션 6과 같음: 영업일을 걸친 익일물 4일, 같은 결제일 두 운영 합산 1일).
 *  - 연준 이사회 H.4.1: WALCL(RESPPMA_N.WW), WTREGEN(RESPPLLDT_XAW_N.WW)
 *  - 연준 이사회 H.15: DGS2(RIFLGFCY02_N.B), DFII10(RIFLGFCY10_XII_N.B), DGS10(RIFLGFCY10_N.B), DFF(RIFSPFF_N.D),
 *    T10Y2Y(= H.15 10년물 − 2년물을 직접 계산, 소수 둘째 자리)
 *  - 연준 이사회 H.6: M2SL(M2.M, 날짜를 달 첫날로)
 *  - BLS 시계열 파일: CPIAUCSL(CUSR0000SA0), CPIAUCNS(CUUR0000SA0, 비조정 — 미션 10), CPILFESL(CUSR0000SA0L1E), PAYEMS(CES0000000001)
 *  - BEA NIPA 월별 파일: PCEPI(DPCERG), PCEPILFE(DPCCRG)
 *  - 뉴욕 연은 Markets API: RRPONTSYD(역레포 운영 결과), SOFR
 *  - 발표 일정: BLS 일정표(ics), BEA 일정표(ics), 인구조사국 경제지표 일정표 — FRED release/dates 대신
 *
 * 전환하지 않은 시리즈 (FRED 그대로, 이유는 결정 로그 20장·사람이 결정할 항목):
 *  - NFCI (시카고 연은): 시카고 연은 법적 고지가 재게시·배포에 서면 허락을 요구한다.
 *  - TEDRATE: ICE LIBOR 로 계산된 FRED 자체 시리즈(2022-01 중단). 허락 없이 받을 원출처가 없다.
 *  - IRLTLT01KRM156N (OECD): OECD 이용 조건 원문을 이 환경에서 열지 못했고(403), 원자료는 한국은행 자료다.
 */

/** 원출처에서 받는 FRED 시리즈 ID */
export const SITE_ORIGIN_SERIES = new Set<string>([
  "WALCL",
  "WTREGEN",
  "DGS2",
  "DFII10",
  "DGS10",
  "DFF",
  "T10Y2Y",
  "M2SL",
  "CPIAUCSL",
  "CPIAUCNS",
  "CPILFESL",
  "PAYEMS",
  "PCEPI",
  "PCEPILFE",
  "RRPONTSYD",
  "SOFR",
]);

/** 사이트 전체 스위치: SITE_DATA_SOURCE=fred 면 모두 FRED */
export function siteUsesFredOnly(): boolean {
  return process.env.SITE_DATA_SOURCE === "fred";
}

/** 이 시리즈를 원출처에서 받는가 */
export function isSiteOriginSeries(fredSeriesId: string): boolean {
  return !siteUsesFredOnly() && SITE_ORIGIN_SERIES.has(fredSeriesId);
}

/** 발표 일정을 공식 일정표에서 받는가 */
export function siteUsesOfficialSchedules(): boolean {
  return !siteUsesFredOnly();
}
