import { ObservatoryBreadcrumb } from "../breadcrumb";
import { CriteriaNote } from "../criteria-note";
import { LimitsNote } from "../limits-note";
import { FiringRateLine } from "../firing-rate";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { QuarterlyChart, WeeklyChart } from "./DepositFlightCharts";
import {
  formatBillions,
  formatChangePp,
  formatDate,
  formatQuarter,
  formatSharePct,
  formatUninsuredPct,
} from "./format";
import type { DepositFlightResponse } from "@/app/api/observatory/deposit-flight/route";
import type { ObservatoryStatus } from "@/lib/observatory-constants";

export const metadata: Metadata = {
  title: "관측소 · 예금 유출 | TockTock",
  description:
    "예금이 소형 은행에서 대형으로 옮겨가는 흐름과, 그 예금 중 보험으로 보호되지 않는 돈의 비중을 함께 봅니다.",
};

export const dynamic = "force-dynamic";

async function getData(): Promise<DepositFlightResponse | null> {
  // 절대 URL 구성 (서버 컴포넌트에서 자체 API 호출 시)
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  try {
    const res = await fetch(`${proto}://${host}/api/observatory/deposit-flight`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as DepositFlightResponse;
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

function StatusBadge({ status }: { status: ObservatoryStatus }) {
  const meta = STATUS_META[status];
  return (
    <div
      className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${meta.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </div>
  );
}

export default async function DepositFlightPage() {
  const data = await getData();

  if (!data || (!data.latestWeekly && !data.latestQuarterly)) {
    return (
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <ObservatoryBreadcrumb indicator="deposit-flight" />
        <h1 className="text-2xl font-bold mb-4">관측소 · 예금 유출</h1>
        <p className="text-sm text-zinc-500">
          아직 데이터가 없습니다. 수집을 기다리는 중입니다.
        </p>
      </div>
    );
  }

  const { latestWeekly, latestQuarterly, thresholds } = data;

  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <ObservatoryBreadcrumb indicator="deposit-flight" />
      {/* 헤더 */}
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          예금 유출
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed">
          예금이 어디서 빠져 어디로 가는지, 그리고 그 예금이 보험으로 보호되지 않는
          돈일수록 더 빨리 도망간다는 것을 함께 봅니다.
        </p>
        <p className="text-xs text-zinc-400 mt-1.5">
          출처: FRED (시리즈 {data.seriesIds.small} · {data.seriesIds.large}) 및 FDIC
          분기 은행실적보고서(QBP)
        </p>
      </header>

      {/* 성격이 다른 두 지표 — 같은 눈높이로 나란히 */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* 주간 */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-0.5">
                매주 갱신되는 흐름
              </div>
              <div className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                소형 → 대형 은행 이동
              </div>
            </div>
            <StatusBadge status={data.weeklyStatus} />
          </div>

          {latestWeekly ? (
            <>
              <div className="mt-3 flex items-baseline gap-2 flex-wrap">
                <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                  {formatChangePp(latestWeekly.weeklyChangePp)}
                </div>
                <div className="text-xs text-zinc-500">1주 변화</div>
              </div>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-zinc-500">소형 은행 비중</dt>
                  <dd className="font-semibold tabular-nums">
                    {formatSharePct(latestWeekly.smallSharePct)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">소형 / 대형 (십억 달러)</dt>
                  <dd className="font-semibold tabular-nums">
                    {formatBillions(latestWeekly.smallBillions)} /{" "}
                    {formatBillions(latestWeekly.largeBillions)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">기준</dt>
                  <dd className="font-semibold">{formatDate(latestWeekly.date)}</dd>
                </div>
              </dl>
              <p className="mt-3 text-[11px] text-zinc-400 leading-relaxed">
                비중이 {thresholds.warnWeeklyPp}%p 이하로 빠지면 주의,{" "}
                {thresholds.alertWeeklyPp}%p 이하면 경보입니다. 늘어나는 쪽은 경보로
                보지 않습니다.
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">수집 대기</p>
          )}
        </div>

        {/* 분기 */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-violet-600 dark:text-violet-400 mb-0.5">
                분기에 한 번 나오는 체온계
              </div>
              <div className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                무보험 예금 비중
              </div>
            </div>
            <StatusBadge status={data.quarterlyStatus} />
          </div>

          {latestQuarterly ? (
            <>
              <div className="mt-3 flex items-baseline gap-2 flex-wrap">
                <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                  {formatUninsuredPct(latestQuarterly.uninsuredSharePct)}
                </div>
                <div className="text-xs text-zinc-500">국내 예금 대비</div>
              </div>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-zinc-500">무보험 예금</dt>
                  <dd className="font-semibold tabular-nums">
                    {formatBillions(
                      latestQuarterly.domesticDepositsBillions -
                        latestQuarterly.insuredDepositsBillions
                    )}
                    십억 달러
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">국내 예금 총액</dt>
                  <dd className="font-semibold tabular-nums">
                    {formatBillions(latestQuarterly.domesticDepositsBillions)}십억 달러
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">기준</dt>
                  <dd className="font-semibold">
                    {formatQuarter(latestQuarterly.quarter)}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-[11px] text-zinc-400 leading-relaxed">
                {thresholds.warnUninsuredPct}% 이상이면 주의,{" "}
                {thresholds.alertUninsuredPct}% 이상이면 경보입니다. 이쪽은 높을수록
                위험이라 주간과 방향이 반대입니다.
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">수집 대기</p>
          )}
        </div>
      </div>

      {/* 주간 차트 */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-1">
          소형 은행 예금 비중 (주간)
        </h2>
        <p className="text-xs text-zinc-500 mb-3">
          소형·대형 국내 상업은행 예금 중 소형이 차지하는 비중. 매주 수요일 기준.
        </p>
        <WeeklyChart
          series={data.weekly}
          warnPp={thresholds.warnWeeklyPp}
          alertPp={thresholds.alertWeeklyPp}
        />
      </section>

      {/* 분기 차트 */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-1">
          무보험 예금 비중 (분기)
        </h2>
        <p className="text-xs text-zinc-500 mb-3">
          국내 예금 중 예금보험 한도를 넘어 보호받지 못하는 몫.
        </p>
        <QuarterlyChart
          series={data.quarterly}
          warnPct={thresholds.warnUninsuredPct}
          alertPct={thresholds.alertUninsuredPct}
          comparableFrom={data.quarterlyComparableFrom}
        />
      </section>

      {/* 보는 법 */}
      <section className="mb-6">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-3">
          보는 법
        </h2>
        <div className="space-y-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          <p>
            이 페이지는 <strong>성격이 다른 두 가지</strong>를 함께 봅니다. 하나는
            매주 갱신되는 <strong>흐름</strong>이고, 다른 하나는 분기에 한 번 나오는{" "}
            <strong>체온계</strong>입니다. 앞은 지금 벌어지는 일이고, 뒤는 터졌을 때의
            화력입니다.
          </p>
          <p>
            <strong>소형 → 대형 이동.</strong> 불안해진 예금자는 작은 은행에서 돈을
            빼 큰 은행으로 옮깁니다. 큰 은행은 망해도 정부가 그냥 두지 않을 거라고
            믿기 때문입니다. 그래서 소형 은행 예금 비중이 한 주 만에 뚝 떨어지면,
            어딘가에서 줄이 서기 시작했다는 뜻입니다.
          </p>
          <p>
            <strong>무보험 예금 비중.</strong> 예금보험 한도를 넘는 돈은 은행이
            무너지면 돌려받는다는 보장이 없습니다.{" "}
            <strong>보험 밖에 있는 돈일수록 더 빨리 도망갑니다.</strong> 이 비중이
            높다는 건 불이 붙었을 때 탈 수 있는 연료가 많다는 뜻입니다.
          </p>
          <p>
            둘을 함께 보는 이유가 여기 있습니다. 무보험 비중이 높아진 상태에서 주간
            이동이 터지면, 같은 충격이라도 훨씬 크게 번집니다. 실제로 2023년 3월
            SVB가 무너진 주에 소형 은행 비중이 한 주 만에 0.9%p 빠졌는데, 그 직전
            2년간 무보험 비중은 45%를 넘나들고 있었습니다.
          </p>
          <p className="text-zinc-500">
            주간 값은 계절조정을 하지 않은 원계열입니다. 연말·연초처럼 자금이
            정기적으로 움직이는 시기에는 판정과 무관한 잔물결이 보일 수 있습니다.
          </p>
        </div>
      </section>
      <div className="mb-2 text-xs"><p className="text-zinc-500">주간 판정(소형 은행 예금 비중 변화):</p><FiringRateLine stats={data.firingWeekly} unit="주" /><p className="mt-1 text-zinc-500">분기 판정(무보험 예금 비중):</p><FiringRateLine stats={data.firingQuarterly} unit="분기" /></div>
      <LimitsNote
        limits="소형·대형 은행 구분은 연준 통계의 분류를 따릅니다. 주간 예금은 세금 납부일이나 계절에 따라 흔들릴 수 있고, 무보험 예금 비중은 분기 자료라 늦습니다."
        timing="주간 예금(H.8)은 수요일 값이 9일 뒤 금요일에 발표됩니다. 발표가 이 사이트 수집 시각보다 늦어 그다음 평일(보통 월요일) 밤에 반영됩니다. 무보험 예금 비중은 FDIC 분기 보고서(분기가 끝나고 두세 달 뒤 발표, 이 사이트는 3·6·9·12월 1일부터 평일마다 확인)를 따릅니다. 이 사이트는 평일 한국 시각 밤 10시에 수집합니다(미 동부 시각으로 서머타임 때 오전 9시, 11~3월에는 오전 8시)."
      />

      <CriteriaNote>소형 은행 예금 비중이 한 주에 0.4%p 이상 줄면 주의, 0.7%p 이상 줄면 경보입니다. 무보험 예금 비중은 43% 이상이면 주의, 45% 이상이면 경보입니다.</CriteriaNote>
      <p className="text-xs text-zinc-500">
        이 지표는 시장 상황을 지켜보기 위한 참고 자료입니다. 투자 권유가 아니며, 모든
        투자 판단은 본인의 책임입니다.
      </p>
    </div>
  );
}
