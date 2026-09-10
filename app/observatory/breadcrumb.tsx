import Link from "next/link";
import {
  findIndicator,
  sectionHref,
  sectionShortTitle,
  type ObservatoryIndicatorKey,
} from "@/lib/observatory-catalog";

/**
 * 지표 상세 페이지 공용 브레드크럼
 *
 *   관측소 › 관측소 1 — 배관 › 역레포(RRP) 잔액
 *
 * 지표 URL 은 평면(/observatory/rrp)이라 주소만 봐서는 어느 관측소 소속인지
 * 알 수 없다. 그 계층을 화면에서 대신 보여주는 줄이다.
 *
 * ⚠ 상세 페이지 5곳에 **같은 컴포넌트**를 끼운다. 각 페이지에 마크업을
 *   복사하면 나중에 관측소가 늘 때 다섯 군데가 따로 놀게 된다.
 *
 * ⚠ 이름·소속은 카탈로그에서 가져온다. 상세 페이지에 문자열을 적어두면
 *   섹션 이름을 바꿨을 때 브레드크럼만 옛 이름으로 남는다.
 *
 * ⚠ "use client" 를 넣지 않는다 (상세 페이지는 서버 컴포넌트다).
 */
export function ObservatoryBreadcrumb({
  indicator,
}: {
  indicator: ObservatoryIndicatorKey;
}) {
  const found = findIndicator(indicator);
  // 카탈로그에 없는 지표면 줄을 그리지 않는다 (페이지 본문은 그대로 뜬다)
  if (!found) return null;

  const { section, indicator: meta } = found;
  const linkClass = "hover:underline hover:text-zinc-700 dark:hover:text-zinc-300";

  return (
    <nav aria-label="위치" className="mb-4 text-xs text-zinc-500">
      <Link href="/observatory" className={linkClass}>
        관측소
      </Link>
      <span className="mx-1.5 text-zinc-300 dark:text-zinc-700">›</span>
      <Link href={sectionHref(section)} className={linkClass}>
        {sectionShortTitle(section)}
      </Link>
      <span className="mx-1.5 text-zinc-300 dark:text-zinc-700">›</span>
      <span className="font-semibold text-zinc-700 dark:text-zinc-300">{meta.name}</span>
    </nav>
  );
}
