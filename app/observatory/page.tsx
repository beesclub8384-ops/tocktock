import type { Metadata } from "next";
import Link from "next/link";
import {
  OBSERVATORY_SECTIONS,
  sectionHref,
  sectionTitle,
  worstStatus,
  type ObservatoryStatusMap,
} from "@/lib/observatory-catalog";
import { summarizeSection } from "./summaries";
import { loadSnapshots } from "./snapshots";
import {
  NEUTRAL_SUMMARY_CLASS,
  STATUS_META,
  SUMMARY_CLASS,
} from "./status-style";

export const metadata: Metadata = {
  title: "관측소 | TockTock",
  description:
    "금융 부실 조기경보 관측소. 자금시장 배관을 비롯해 시스템에 금이 가는지 지켜보는 관측소 목록입니다.",
};

export const dynamic = "force-dynamic";

/**
 * 1층 — 관측소 목록
 *
 * 관측소가 여섯 곳까지 늘어날 예정이라, 첫 화면에는 지표 카드를 깔지 않고
 * 관측소 카드만 둔다. 카드 한 장에 그 관측소의 종합 상태(요약 문장 + 최악
 * 신호등)를 얹어, 목록만 훑어도 어디가 아픈지는 잡히게 한다.
 *
 * ⚠ 종합 상태를 실제 판정과 일치시키려면 지표를 다 읽어야 한다. 요약 문장은
 *   2층 섹션 페이지와 **같은 함수**로 만들어 두 화면이 어긋날 수 없게 했다.
 */
export default async function ObservatoryIndexPage() {
  // 카탈로그 전체 지표를 한 번에 읽는다 (전부 병렬)
  const snapshots = await loadSnapshots();

  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          관측소
        </h1>
        <p className="text-sm text-zinc-500 mt-2">
          금융 시스템에 금이 가는지 지켜보는 곳입니다. 관측소별로 보는 대상이
          다릅니다. 출처: FRED (Federal Reserve Bank of St. Louis).
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4">
        {OBSERVATORY_SECTIONS.map((section) => {
          const statusMap: ObservatoryStatusMap = Object.fromEntries(
            section.indicators.map((ind) => [ind.key, snapshots[ind.key]?.status ?? null])
          );
          const summary = summarizeSection(section.id, statusMap);
          // 배지는 요약 함수가 없는 섹션에서도 떠야 하므로 지표 상태에서 직접 뽑는다
          const worst = worstStatus(Object.values(statusMap));
          const meta = worst ? STATUS_META[worst] : null;

          return (
            <Link
              key={section.id}
              href={sectionHref(section)}
              className="group block rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6 transition-colors hover:border-zinc-400 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-zinc-100 group-hover:underline">
                  {sectionTitle(section)}
                </h2>
                {meta ? (
                  <div
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${meta.className}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </div>
                ) : (
                  <div className="shrink-0 rounded-full border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 text-xs font-bold text-zinc-500">
                    수집 대기
                  </div>
                )}
              </div>

              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {section.subtitle}
              </p>

              {summary && (
                <div
                  className={`mt-3 rounded-lg border px-4 py-2.5 text-sm font-semibold ${
                    summary.status ? SUMMARY_CLASS[summary.status] : NEUTRAL_SUMMARY_CLASS
                  }`}
                >
                  {summary.text}
                </div>
              )}

              <p className="mt-3 text-xs text-zinc-400">
                지표 {section.indicators.length}개 · 눌러서 자세히 보기
              </p>
            </Link>
          );
        })}
      </div>

      <p className="mt-8 text-xs text-zinc-500">
        이 지표들은 시장 상황을 지켜보기 위한 참고 자료입니다. 투자 권유가 아니며,
        모든 투자 판단은 본인의 책임입니다.
      </p>
    </div>
  );
}
