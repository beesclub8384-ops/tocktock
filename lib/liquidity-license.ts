/**
 * 재게시 허락이 필요한 유동성 구성 요소 (2026-10-19 미션 12, 결정 로그 24-1 — 계산 전에 선언, 한 번만 적용).
 *
 * NFCI(시카고 연은 금융상황지수)는 시카고 연은이 재게시·배포에 서면 허락을 요구한다. 허락이 없는 동안
 * /liquidity/us 점수·카드·모달·API 응답과 백테스트에서 뺀다. 수집 코드(FRED NFCI)는 지우지 않고 받지만 않는다.
 *
 * 되돌리기(허락을 받은 뒤): 환경변수 LIQUIDITY_NFCI=on → 점수·화면·백테스트에 다시 들어간다.
 * 되돌린 뒤에는 응답 캐시(liquidity:us:v8)가 바뀌거나 백테스트 cron 이 다시 돌아야 화면에 나온다.
 */

/** NFCI 를 점수·화면·백테스트에 쓰는가 (기본: 쓰지 않음) */
export function nfciEnabled(): boolean {
  return process.env.LIQUIDITY_NFCI === "on";
}

export const NFCI_NAME = "NFCI (금융상황지수)";
export const NFCI_SHORT_REASON = "재게시 허락 필요";
export const NFCI_EXCLUSION_REASON =
  "시카고 연방준비은행이 이 지수의 재게시에 서면 허락을 요구하고 있어, 허락을 받기 전까지 점수와 화면에서 뺐습니다.";
