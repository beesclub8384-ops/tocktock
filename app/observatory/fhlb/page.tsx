import { ObservatoryBreadcrumb } from "../breadcrumb";
import { displaySeriesId } from "@/lib/observatory-origin";
import { isOriginSource } from "@/lib/observatory-source-config";
import { CriteriaNote } from "../criteria-note";
import { LimitsNote } from "../limits-note";
import { FredNotice } from "../source-notices";
import { FiringRateLine } from "../firing-rate";
import type { Metadata } from "next";
import { headers } from "next/headers";
import FhlbChart from "./FhlbChart";
import { formatAdvances, formatQoq, formatQuarter } from "./format";
import type { FhlbResponse } from "@/app/api/observatory/fhlb/route";
import type { ObservatoryStatus } from "@/lib/observatory-constants";

export const metadata: Metadata = {
  title: "관측소 · FHLB 차입 잔액 | TockTock",
  description:
    "은행들이 연준 창구보다 먼저, 낙인 없이 조용히 쓰는 자금줄. 차입이 갑자기 늘면 은행들이 돈줄을 찾고 있다는 신호일 수 있습니다.",
};

export const dynamic = "force-dynamic";

async function getData(): Promise<FhlbResponse | null> {
  // 절대 URL 구성 (서버 컴포넌트에서 자체 API 호출 시)
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  try {
    const res = await fetch(`${proto}://${host}/api/observatory/fhlb`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as FhlbResponse;
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

export default async function FhlbPage() {
  const data = await getData();

  if (!data || !data.latest) {
    return (
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <ObservatoryBreadcrumb indicator="fhlb" />
        <h1 className="text-2xl font-bold mb-4">관측소 · FHLB 차입 잔액</h1>
        <p className="text-sm text-zinc-500">
          아직 데이터가 없습니다. 연준 자료 수집을 기다리는 중입니다.
        </p>
      </div>
    );
  }

  const { latest, previous, thresholds } = data;
  const statusMeta = STATUS_META[data.status];

  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <ObservatoryBreadcrumb indicator="fhlb" />
      {/* 헤더 */}
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          FHLB 차입 잔액
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed">
          은행들이 연준 창구보다 먼저, 낙인 없이 조용히 쓰는 자금줄입니다. 차입이
          갑자기 늘면 은행들이 돈줄을 찾고 있다는 신호일 수 있습니다.
        </p>
        <p className="text-xs text-zinc-400 mt-1.5">
          출처: 연준 이사회 금융계정(Z.1), 시리즈 {displaySeriesId(data.seriesId, isOriginSource(data.seriesId))} ·
          분기(분기 말 기준)
        </p>
      </header>

      {/* 최신값 */}
      <div className="mb-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-zinc-400 mb-1">
              가장 최근 분기
            </div>
            <div className="text-4xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
              {formatAdvances(latest.advancesBillions)}
            </div>
          </div>
          <div
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${statusMeta.className}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dot}`} />
            {statusMeta.label}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-zinc-400">기준 분기</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200">
              {formatQuarter(latest.quarter)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">전분기 대비</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
              {formatQoq(latest.qoqChangePct)}
            </dd>
            <dd className="text-xs text-zinc-500">
              주의 {thresholds.warnQoqPct}% · 경보 {thresholds.alertQoqPct}%
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">직전 분기</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
              {previous ? formatAdvances(previous.advancesBillions) : "—"}
            </dd>
            {previous && (
              <dd className="text-xs text-zinc-500">
                {formatQuarter(previous.quarter)}
              </dd>
            )}
          </div>
        </dl>
      </div>

      {/* 추이 */}
      <section className="mb-6">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-3">
          분기별 추이
        </h2>
        <FhlbChart
          series={data.series}
          warnQoqPct={thresholds.warnQoqPct}
          alertQoqPct={thresholds.alertQoqPct}
        />
      </section>

      {/* 보는 법 */}
      <section className="mb-6">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-3">
          보는 법
        </h2>
        <div className="space-y-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          <p>
            FHLB(연방주택대출은행)는 은행들이 담보를 맡기고 돈을 빌리는 곳입니다.
            연준의 재할인 창구와 비슷하지만 결정적으로 다른 점이 있습니다.{" "}
            <strong>
              재할인 창구는 &ldquo;저 은행 급하다&rdquo;는 낙인이 찍혀 평시엔 아무도
              안 쓰지만, FHLB는 평상시에도 쓰는 곳이라 급할 때 먼저 손이 갑니다.
            </strong>{" "}
            그래서 연준 창구보다 <strong>앞서</strong> 움직일 수 있습니다.
          </p>
          <p>
            특정 은행이나 지역의 차입이 갑자기 늘면 은행들이 돈줄을 찾고 있다는 신호일 수 있습니다.
            실제로 <strong>2007년 3분기(+28%), 2020년 1분기(+25%), 2023년 1분기(+27%)</strong>에
            이 잔액이 크게 늘었습니다. 차트의 세로 점선이 그 시점들입니다. 다만 2022년 2분기(+40%)처럼
            큰 위기 없이 급증한 때도 있어, 급증이 곧 위기라는 뜻은 아닙니다.
          </p>
          <p>
            잔액 자체보다 <strong>전분기 대비 증가율</strong>을 봅니다. 은행 자산이
            커지면 차입도 따라 커지므로 절대 금액은 추세적으로 올라갑니다. 갑자기
            꺾여 올라가는 순간이 신호입니다. 반대로 잔액이 급감하는 건 위기가 지나가고
            빌린 돈을 갚았다는 뜻이라 경보로 보지 않습니다.
          </p>
          <p className="text-zinc-500">
            분기 데이터라 매일 움직이지 않습니다. 값이 며칠째 그대로여도 고장이
            아닙니다.
          </p>
        </div>
      </section>
      <div className="mb-2 text-xs"><FiringRateLine stats={data.firing} unit="분기" /></div>
      <LimitsNote
        limits="연방주택대출은행(FHLB)이 빌려준 돈 전체라, 대출이 늘어난 이유가 은행들의 돈줄 압박인지 평소 사업 확대인지는 이 숫자만으로 구분할 수 없습니다."
        timing="연준의 금융계정(Z.1)으로 분기마다 나옵니다. 실측으로는 분기가 끝나고 약 10주 뒤에 공개됐습니다(2026년 2분기 값은 9월 11일). 이 사이트는 평일 한국 시각 밤 10시에 수집합니다(미 동부 시각으로 서머타임 때 오전 9시, 11~3월에는 오전 8시)."
      />

      <CriteriaNote>전분기 대비 15% 이상 늘면 주의, 30% 이상 늘면 경보입니다.</CriteriaNote>
      <FredNotice keys={["fhlb"]} />
      <p className="text-xs text-zinc-500">
        이 지표는 시장 상황을 지켜보기 위한 참고 자료입니다. 투자 권유가 아니며, 모든
        투자 판단은 본인의 책임입니다.
      </p>
    </div>
  );
}
