/**
 * 출처 기관이 요구하는 고지 문구 (2026-10-18 미션 3에서 이용 약관을 확인하고 추가).
 *
 *  - FRED API 이용 약관: "This product uses the FRED® API but is not endorsed or certified by the Federal
 *    Reserve Bank of St. Louis." 를 눈에 띄게 두고 약관 링크를 보여 주라고 한다 → 관측소 레이아웃 하단.
 *  - 뉴욕 연은 이용 약관: 정해진 출처 표기 형식("© [year] Federal Reserve Bank of New York. Content from the
 *    New York Fed subject to the Terms of Use at newyorkfed.org."), 참조금리(SOFR)는 별도 고지문을 함께 두라고
 *    한다(FRED 로 받아도 같다). 목록·섹션 카드에도 뉴욕 연은 자료(SOFR·역레포·레포·딜러 통계) 값이 나오므로
 *    관측소 레이아웃 하단에 한 번 둔다(독립 검증 지적으로 페이지별 배치에서 옮김).
 *  원문은 약관 그대로 영어로 둔다(뜻을 바꾸지 않으려고). 바로 위에 한국어 설명을 붙인다.
 *  SOFR 은 DTCC Solutions 자료로 계산된다는 문구도 약관 원문 그대로 둔다(2026-10-18 원문 확인).
 *
 * ⚠ "use client" 를 넣지 않는다 (서버 컴포넌트에서 쓴다).
 */

export function FredNotice() {
  // 영어 문장은 FRED API 이용 약관(Requirements)의 문구 그대로다. 바꾸거나 줄이지 않는다.
  return (
    // 약관이 "prominently" 를 요구해 다른 출처 표기보다 크고 진하게, 경계선으로 구분해 둔다 (독립 검증 지적)
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 mt-6 border-t border-zinc-200 dark:border-zinc-800 pt-3 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
      <p>
        This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.{" "}
        <a href="https://fred.stlouisfed.org/docs/api/terms_of_use.html" className="underline" target="_blank" rel="noreferrer">
          FRED® API Terms of Use
        </a>
      </p>
      <p>
        이 사이트의 일부 자료는 미국 세인트루이스 연방준비은행의 FRED® API로 받습니다. 세인트루이스 연방준비은행이 이
        사이트를 보증하거나 인증한 것은 아니며, 자료 이용에는 위 FRED® API 이용 약관이 적용됩니다.
      </p>
    </div>
  );
}

/** 뉴욕 연은 이용 약관의 출처 표기 문장 (API 응답의 attribution 필드도 같은 문장을 쓴다) */
export function nyFedAttribution(year = new Date().getFullYear()): string {
  return `© ${year} Federal Reserve Bank of New York. Content from the New York Fed subject to the Terms of Use at newyorkfed.org.`;
}

export const SOFR_NOTICE =
  "The SOFR is subject to the Terms of Use posted at newyorkfed.org. The New York Fed is not responsible for publication of the SOFR by TockTock, does not sanction or endorse any particular republication, and has no liability for your use. The Secured Overnight Financing Rate (SOFR) Data and Broad General Collateral Rate (BGCR) Data are calculated using data provided under a license granted to the New York Fed by DTCC Solutions LLC (\u201cSolutions\u201d), an affiliate of The Depository Trust & Clearing Corporation. Solutions, its affiliates, and third parties from which they obtained data have no liability for the content of this material.";

export function NyFedNotice() {
  return (
    <p className="container mx-auto max-w-5xl px-4 sm:px-6 mt-2 text-[11px] leading-relaxed text-zinc-400">
      SOFR·역레포·레포(SRF)·프라이머리 딜러 통계는 뉴욕 연방준비은행 자료입니다. 이 사이트가 계산한 값(차이·변화·판정)은
      뉴욕 연은이 낸 값이 아닙니다. {nyFedAttribution()} {SOFR_NOTICE}
    </p>
  );
}
