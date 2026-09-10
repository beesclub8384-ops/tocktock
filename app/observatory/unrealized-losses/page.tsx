import { ObservatoryBreadcrumb } from "../breadcrumb";
import type { Metadata } from "next";
import { headers } from "next/headers";
import UnrealizedLossesChart from "./UnrealizedLossesChart";
import { formatBillions, formatDate, formatQuarter, formatRatio } from "./format";
import type { UnrealizedLossesResponse } from "@/app/api/observatory/unrealized-losses/route";
import type { ObservatoryStatus } from "@/lib/observatory-constants";

export const metadata: Metadata = {
  title: "관측소 · 채권 미실현손실 비율 | TockTock",
  description:
    "은행들이 아직 팔지 않은 채권에 숨어 있는 손실(유령 손실)을 자기자본으로 나눈 값. 뱅크런이 오면 유령이 실물이 되면서 자본을 갉아먹습니다.",
};

export const dynamic = "force-dynamic";

async function getData(): Promise<UnrealizedLossesResponse | null> {
  // 절대 URL 구성 (서버 컴포넌트에서 자체 API 호출 시)
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  try {
    const res = await fetch(`${proto}://${host}/api/observatory/unrealized-losses`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as UnrealizedLossesResponse;
  } catch {
    return null;
  }
}

const STATUS_META: Record<
  ObservatoryStatus,
  { label: string; className: string; dot: string }
> = {
  normal: {
    label: "정상",
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
    dot: "bg-emerald-500",
  },
  caution: {
    label: "주의",
    className:
      "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
    dot: "bg-amber-500",
  },
  warning: {
    label: "경보",
    className:
      "bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800",
    dot: "bg-rose-500",
  },
};

export default async function UnrealizedLossesPage() {
  const data = await getData();

  if (!data || !data.latest) {
    return (
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <ObservatoryBreadcrumb indicator="unrealized-losses" />
        <h1 className="text-2xl font-bold mb-4">관측소 · 채권 미실현손실 비율</h1>
        <p className="text-sm text-zinc-500">
          아직 데이터가 없습니다. FDIC 분기 보고서 수집을 기다리는 중입니다.
        </p>
      </div>
    );
  }

  const { latest, previous, thresholds, meta } = data;
  const statusMeta = STATUS_META[data.status];
  const delta = previous ? latest.ratioPct - previous.ratioPct : null;

  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <ObservatoryBreadcrumb indicator="unrealized-losses" />
      {/* 헤더 */}
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          채권 미실현손실 비율
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed">
          은행들이 아직 팔지 않은 채권에 숨어 있는 손실(유령 손실)을 자기자본으로
          나눈 값입니다. 뱅크런이 오면 유령이 실물이 되면서 자본을 갉아먹습니다.
          금리가 오르면 유령이 커집니다.
        </p>
        <p className="text-xs text-zinc-400 mt-1.5">
          출처: FDIC 분기 은행실적보고서(QBP) · 분기 데이터 · {data.firstQuarter}부터
        </p>
      </header>

      {/* 최신값 */}
      <div className="mb-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-zinc-400 mb-1">
              가장 최근 분기
            </div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <div className="text-4xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                {formatRatio(latest.ratioPct)}
              </div>
              {delta !== null && (
                <div className="text-sm text-zinc-500 tabular-nums">
                  직전 분기 대비 {delta >= 0 ? "+" : ""}
                  {delta.toFixed(1)}%p
                </div>
              )}
            </div>
          </div>
          <div
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${statusMeta.className}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dot}`} />
            {statusMeta.label}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-zinc-400">기준 분기</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200">
              {formatQuarter(latest.quarter)}
            </dd>
            <dd className="text-xs text-zinc-500">{formatDate(latest.quarterEnd)} 기준</dd>
          </div>
          <div>
            {/* ⚠ FDIC 공식 발표일이 아니다 — 아래 각주 참고 */}
            <dt className="text-xs text-zinc-400">발표 확인일</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200">
              {meta?.confirmedAt ? formatDate(meta.confirmedAt) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">유령 손실 총액</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
              {formatBillions(latest.ghostBillions)}
            </dd>
            <dd className="text-xs text-zinc-500">
              AFS {latest.afsBillions.toFixed(1)} + HTM {latest.htmBillions.toFixed(1)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">자기자본</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
              {formatBillions(latest.equityBillions)}
            </dd>
            {data.pctOfPeak !== null && (
              <dd className="text-xs text-zinc-500">
                정점 대비 {data.pctOfPeak.toFixed(0)}%
              </dd>
            )}
          </div>
        </dl>
      </div>

      {/* 신호등이 노란불인 게 정상이라는 안내 */}
      {data.status === "caution" && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <strong>지금 노란불인 것은 버그가 아닙니다.</strong> 이 지표는{" "}
          {thresholds.cautionPct}% 미만이 초록, {thresholds.cautionPct}~
          {thresholds.alertPct}%가 노랑, {thresholds.alertPct}% 초과가 빨강입니다.
          현재 {formatRatio(latest.ratioPct)}는 노랑 구간이며, 2022~2023년의 30%대에서
          내려온 자리입니다.
        </div>
      )}

      {/* 추이 */}
      <section className="mb-6">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-3">
          분기별 추이
        </h2>
        <UnrealizedLossesChart
          series={data.series}
          peakPct={thresholds.peakPct}
          peakQuarter={thresholds.peakQuarter}
          svbQuarter={thresholds.svbQuarter}
          cautionPct={thresholds.cautionPct}
          alertPct={thresholds.alertPct}
        />
      </section>

      {/* 보는 법 */}
      <section className="mb-6">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-3">
          보는 법
        </h2>
        <div className="space-y-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          <p>
            <strong>
              이 지표는 분기 데이터라 매일 보는 계기판이 아니라 분기마다 갱신되는
              체온계입니다.
            </strong>{" "}
            금리 방향이 유령의 크기를 정합니다 — 금리 상승기엔 커지고 하락기엔
            녹습니다. 그래서 값이 며칠째 그대로여도 고장이 아닙니다.
          </p>
          <p>
            은행이 채권을 만기까지 들고 있으면 이 손실은 장부에 잡히지 않습니다.
            문제는 예금이 빠져나가 <strong>어쩔 수 없이 팔아야 할 때</strong>입니다.
            그 순간 유령이 실물 손실이 되어 자기자본을 깎습니다. SVB가 정확히 그
            경로로 무너졌습니다.
          </p>
          <p>
            비율로 보는 이유는 절대 금액만으로는 위험을 못 재기 때문입니다. 손실
            300십억 달러도 자기자본이 3,000십억이면 10%지만 1,000십억이면 30%입니다.
            <strong> 버틸 수 있느냐를 정하는 건 손실의 크기가 아니라 자본 대비
            비중입니다.</strong>
          </p>
        </div>
      </section>

      <p className="text-xs text-zinc-500 leading-relaxed">
        &ldquo;발표 확인일&rdquo;은 FDIC의 공식 발표일이 아니라 TockTock이 새 분기
        데이터를 처음 확인한 날입니다. FDIC 페이지에서 발표일을 기계적으로 읽을 방법이
        없어, 없는 정확도를 지어내는 대신 확인 시점을 그대로 적었습니다.
      </p>
      <p className="mt-2 text-xs text-zinc-500">
        이 지표는 시장 상황을 지켜보기 위한 참고 자료입니다. 투자 권유가 아니며, 모든
        투자 판단은 본인의 책임입니다.
      </p>
    </div>
  );
}
