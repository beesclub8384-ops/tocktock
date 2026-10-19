/**
 * 관측소 밖 화면의 출처 표기와 FRED 고지 (2026-10-19 미션 8).
 *
 *  - origin: 원출처 표기 (예: "연준 이사회 H.4.1·H.6·H.15, 뉴욕 연방준비은행")
 *  - nyFed: 뉴욕 연은 자료가 있으면 약관이 정한 출처 표기 문장(관측소와 같은 문장)을 붙인다
 *  - fredCitations: 아직 FRED 로 받는 시리즈의 출처 표기. 하나라도 있으면 FRED API 이용 약관이 요구하는 고지
 *    (영어 원문 그대로 + 약관 링크)를 함께 보여 준다. 없으면 FRED 고지를 띄우지 않는다(사실과 맞지 않으므로).
 *
 * ⚠ "use client" 를 넣지 않는다 (서버·클라이언트 페이지 모두에서 쓴다).
 */
import { nyFedAttribution } from "@/app/observatory/source-notices";

export function SiteSourceNotice({
  origin,
  nyFed = false,
  fredCitations = [],
  className = "",
}: {
  origin?: string;
  nyFed?: boolean;
  fredCitations?: string[];
  className?: string;
}) {
  return (
    // max-w: 표·차트가 넓어 부모가 화면보다 넓은 페이지(모바일 백테스트·한국 시장)에서도 고지가 화면 안에서 줄바꿈되게
    // (html 의 overflow-x-hidden 때문에 넘치면 잘려 보이지 않는다 — 미션 8 독립 검증 지적 11)
    <div className={`text-xs leading-relaxed text-zinc-500 space-y-1 max-w-[calc(100vw-2rem)] break-words ${className}`}>
      {origin && <p>출처: {origin}. 이 사이트가 계산한 값(점수·변화율 등)은 발표 기관이 낸 값이 아닙니다.</p>}
      {nyFed && <p>{nyFedAttribution()}</p>}
      {fredCitations.length > 0 && (
        <div className="pt-1">
          <p>
            This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.{" "}
            <a href="https://fred.stlouisfed.org/docs/api/terms_of_use.html" className="underline" target="_blank" rel="noreferrer">
              FRED® API Terms of Use
            </a>
          </p>
          <p>
            이 페이지의 일부 자료는 미국 세인트루이스 연방준비은행의 FRED® API로 받습니다. 세인트루이스 연방준비은행이 이
            사이트를 보증하거나 인증한 것은 아니며, 자료 이용에는 위 FRED® API 이용 약관이 적용됩니다. FRED로 받는 자료:{" "}
            {fredCitations.join("; ")}.
          </p>
        </div>
      )}
    </div>
  );
}
