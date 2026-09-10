import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  findSection,
  sectionTitle,
  type ObservatoryStatusMap,
} from "@/lib/observatory-catalog";
import { summarizeSection } from "../summaries";
import { EMPTY_SNAPSHOT, loadSnapshots } from "../snapshots";
import {
  CIRCLED,
  NEUTRAL_SUMMARY_CLASS,
  STATUS_META,
  SUMMARY_CLASS,
  formatCardDate,
} from "../status-style";

export const dynamic = "force-dynamic";

/**
 * 2층 — 관측소 한 곳
 *
 * 예전 인덱스(/observatory)의 내용이 그대로 여기로 왔다. 섹션이 늘어도 이
 * 파일은 안 고친다 — 카탈로그에 섹션을 추가하면 경로가 자동으로 생긴다.
 *
 * ⚠ 지표 상세 URL 은 이 아래(/observatory/plumbing/rrp)가 아니라 평면
 *   (/observatory/rrp)이다. Next.js 가 정적 경로를 먼저 매칭하므로 둘이
 *   공존해도 안전하다. 다만 섹션 id 가 지표 슬러그와 겹치면 이 페이지가
 *   조용히 안 뜨므로, 카탈로그가 로드 시점에 충돌을 검사한다.
 */

// ⚠ Next.js 15: params 는 Promise 다
export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const { section: id } = await params;
  const section = findSection(id);
  if (!section) return { title: "관측소 | TockTock" };

  return {
    title: `${sectionTitle(section)} | TockTock`,
    description: section.subtitle,
  };
}

export default async function ObservatorySectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section: id } = await params;
  const section = findSection(id);
  // 동적 세그먼트라 아무 슬러그나 여기로 들어온다. 빈 페이지 대신 404 를 낸다.
  if (!section) notFound();

  // 이 섹션의 지표만 읽는다 (다른 관측소 지표까지 읽을 이유가 없다)
  const snapshots = await loadSnapshots(section.indicators.map((i) => i.key));

  const statusMap: ObservatoryStatusMap = Object.fromEntries(
    section.indicators.map((ind) => [ind.key, snapshots[ind.key]?.status ?? null])
  );
  // 1층 카드와 같은 함수를 부른다 — 두 화면의 문장이 어긋날 수 없게
  const summary = summarizeSection(section.id, statusMap);

  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      {/* 브레드크럼 — 목록으로 돌아가는 길 */}
      <nav aria-label="위치" className="mb-4 text-xs text-zinc-500">
        <Link href="/observatory" className="hover:underline hover:text-zinc-700 dark:hover:text-zinc-300">
          관측소
        </Link>
        <span className="mx-1.5 text-zinc-300 dark:text-zinc-700">›</span>
        <span className="font-semibold text-zinc-700 dark:text-zinc-300">
          {sectionTitle(section)}
        </span>
      </nav>

      {/* 섹션 헤더 */}
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          {sectionTitle(section)}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed">
          {section.subtitle}
        </p>
        <p className="text-xs text-zinc-400 mt-1.5">
          출처: FRED (Federal Reserve Bank of St. Louis)
        </p>
      </header>

      {/* 지표 카드 — 사슬 순서대로 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {section.indicators.map((ind) => {
          const snap = snapshots[ind.key] ?? EMPTY_SNAPSHOT;
          const meta = snap.status ? STATUS_META[snap.status] : null;

          return (
            <Link
              key={ind.key}
              href={ind.href}
              className="group block rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-5 transition-colors hover:border-zinc-400 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-zinc-400 mb-0.5">
                    {CIRCLED[ind.order - 1] ?? ind.order}
                  </div>
                  <div className="text-base font-bold text-zinc-900 dark:text-zinc-100 group-hover:underline">
                    {ind.name}
                  </div>
                </div>
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

              <div className="mt-3 flex items-baseline gap-2 flex-wrap">
                <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                  {snap.value?.main ?? "—"}
                </div>
                {snap.value?.note && (
                  <div className="text-xs text-zinc-500">({snap.value.note})</div>
                )}
                {snap.asOf && (
                  <div className="text-xs text-zinc-500">
                    {formatCardDate(snap.asOf)} 기준
                  </div>
                )}
              </div>

              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {ind.oneLiner}
              </p>

              {ind.lowerIsWorse && (
                <p className="mt-1.5 text-[11px] text-zinc-400">
                  이 지표는 값이 낮을수록 위험합니다
                </p>
              )}
            </Link>
          );
        })}
      </div>

      {/* 사슬 설명 + 자동 생성 요약 */}
      <p className="mt-4 text-sm text-zinc-500">{section.chainNote}</p>
      {summary && (
        <div
          className={`mt-2 rounded-lg border px-4 py-3 text-sm font-semibold ${
            summary.status ? SUMMARY_CLASS[summary.status] : NEUTRAL_SUMMARY_CLASS
          }`}
        >
          {summary.text}
        </div>
      )}

      <p className="mt-8 text-xs text-zinc-500">
        이 지표들은 시장 상황을 지켜보기 위한 참고 자료입니다. 투자 권유가 아니며,
        모든 투자 판단은 본인의 책임입니다.
      </p>
    </div>
  );
}
