import { ObservatoryBreadcrumb } from "../breadcrumb";
import { CriteriaNote } from "../criteria-note";
import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  ConcentrationChart,
  InvestorDelinquencyChart,
  SizeSplitChart,
} from "./CreCharts";
import {
  formatBucket,
  formatConcentration,
  formatDelinq,
  formatPp,
  formatQuarter,
} from "./format";
import type { CreResponse } from "@/app/api/observatory/cre/route";
import type { ObservatoryStatus } from "@/lib/observatory-constants";

export const metadata: Metadata = {
  title: "관측소 · 상업용 부동산 익스포저 | TockTock",
  description:
    "연체율은 대형은행이 높고 집중도는 지역은행이 훨씬 높습니다. 아픈 곳과 물린 곳이 다릅니다.",
};

export const dynamic = "force-dynamic";

async function getData(): Promise<CreResponse | null> {
  // 절대 URL 구성 (서버 컴포넌트에서 자체 API 호출 시)
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  try {
    const res = await fetch(`${proto}://${host}/api/observatory/cre`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as CreResponse;
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

export default async function CrePage() {
  const data = await getData();

  if (!data || (!data.latestDelinquency && !data.latestConcentration)) {
    return (
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <ObservatoryBreadcrumb indicator="cre" />
        <h1 className="text-2xl font-bold mb-4">관측소 · 상업용 부동산 익스포저</h1>
        <p className="text-sm text-zinc-500">
          아직 데이터가 없습니다. 수집을 기다리는 중입니다.
        </p>
      </div>
    );
  }

  const {
    latestDelinquency,
    latestSizeSplit,
    latestConcentration,
    regionalConcentrationPct,
    thresholds,
    regionalBucket,
  } = data;

  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <ObservatoryBreadcrumb indicator="cre" />
      {/* 헤더 */}
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          상업용 부동산 익스포저
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed">
          은행이 상업용 부동산에 얼마나 물려 있고, 그게 실제로 얼마나 곪고 있는지
          봅니다.
        </p>
        <p className="text-xs text-zinc-400 mt-1.5">
          출처: FDIC 분기 은행실적보고서(QBP) 및 FRED (시리즈{" "}
          {data.seriesIds.top100} · {data.seriesIds.other})
        </p>
      </header>

      {/* 핵심 그림 — 통념과 다른 부분을 먼저 못박는다 */}
      <div className="mb-6 rounded-2xl border border-zinc-300 bg-zinc-50 p-5 dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          먼저 알아둘 것: 아픈 곳과 물린 곳이 다릅니다
        </h2>
        <div className="space-y-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          <p>
            흔히 &ldquo;지역은행이 상업용 부동산 때문에 위험하다&rdquo;고 하지만,
            데이터는 한 겹 더 복잡합니다.
          </p>
          <ul className="space-y-1.5 pl-1">
            <li className="flex gap-2">
              <span className="text-violet-600 dark:text-violet-400 font-bold">·</span>
              <span>
                <strong>연체율은 대형은행이 높습니다.</strong>{" "}
                {latestSizeSplit && latestSizeSplit.top100Pct !== null && latestSizeSplit.otherPct !== null ? (
                  <>
                    상위 100대 {formatDelinq(latestSizeSplit.top100Pct)} vs 100대 밖{" "}
                    {formatDelinq(latestSizeSplit.otherPct)}.{" "}
                  </>
                ) : null}
                대도시 오피스 타워처럼 가장 크게 망가진 물건을 대형은행이 들고 있기
                때문입니다.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-rose-600 dark:text-rose-400 font-bold">·</span>
              <span>
                <strong>집중도는 지역은행이 압도적입니다.</strong>{" "}
                {regionalConcentrationPct !== null && latestConcentration ? (
                  <>
                    {formatBucket(regionalBucket)} 은행은 총자산의{" "}
                    {formatConcentration(regionalConcentrationPct)}가 상업용
                    부동산인데, 2,500억 달러 초과 대형은행은{" "}
                    {formatConcentration(
                      latestConcentration.byBucket["Assets > $250 Billion"] ?? 0
                    )}
                    입니다.{" "}
                  </>
                ) : null}
                맞았을 때 흔들리는 정도가 다릅니다.
              </span>
            </li>
          </ul>
          <p className="pt-1">
            <strong>
              대형은 이미 아프지만 견딜 체력이 있고, 지역은 아직 덜 아프지만 물린 양이
              훨씬 많습니다.
            </strong>{" "}
            둘은 다른 이야기라 하나로 합치지 않고 따로 봅니다.
          </p>
        </div>
      </div>

      {/* 세 판정 */}
      <div className="mb-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs font-semibold text-zinc-400">
              연체율 (아픈 정도)
            </div>
            <StatusBadge status={data.delinquencyStatus} />
          </div>
          <div className="mt-2 text-3xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
            {latestDelinquency
              ? formatDelinq(latestDelinquency.investorNoncurrentPct)
              : "—"}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            임대용 비주거 CRE · 주의 {thresholds.warnDelinqPct}% / 경보{" "}
            {thresholds.alertDelinqPct}%
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs font-semibold text-zinc-400">
              상승 속도 (얼마나 빨리)
            </div>
            <StatusBadge status={data.momentumStatus} />
          </div>
          <div className="mt-2 text-3xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
            {latestDelinquency ? formatPp(latestDelinquency.yoyChangePp) : "—"}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            전년 대비 · 주의 +{thresholds.warnDelinqYoyPp} / 경보 +
            {thresholds.alertDelinqYoyPp}
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs font-semibold text-zinc-400">
              집중도 (물린 양)
            </div>
            <StatusBadge status={data.concentrationStatus} />
          </div>
          <div className="mt-2 text-3xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
            {regionalConcentrationPct !== null
              ? formatConcentration(regionalConcentrationPct)
              : "—"}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            지역은행 총자산 대비 · 주의 {thresholds.warnConcentrationPct}% / 경보{" "}
            {thresholds.alertConcentrationPct}%
          </p>
        </div>
      </div>

      {/* 집중도가 경보를 켠 상태면 그게 정상이라는 안내 */}
      {data.concentrationStatus === "warning" && (
        <div className="mb-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <strong>집중도가 경보인 것은 버그가 아닙니다.</strong> 지역은행의 상업용
          부동산 집중도는 지금 <strong>역대 최고 부근</strong>입니다(1984년 이후 범위
          11.4~34.6%). 이건 사건이 아니라 쌓여 있는 취약성이라, 무슨 일이 터지지
          않아도 계속 켜져 있습니다.
        </div>
      )}

      {/* 차트 1 — 주 신호 */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-1">
          임대용 상업용 부동산 연체율
        </h2>
        <p className="text-xs text-zinc-500 mb-3">
          자가사용(사업체가 쓰는 자기 건물)을 걷어낸 투자 목적 부동산.{" "}
          {latestDelinquency
            ? `${formatQuarter(latestDelinquency.quarter)} 기준.`
            : ""}
        </p>
        <InvestorDelinquencyChart
          series={data.delinquency}
          warnPct={thresholds.warnDelinqPct}
          alertPct={thresholds.alertDelinqPct}
          warnYoy={thresholds.warnDelinqYoyPp}
          alertYoy={thresholds.alertDelinqYoyPp}
        />
      </section>

      {/* 차트 2 — 규모별 연체율 */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-1">
          은행 규모별 CRE 연체율
        </h2>
        <p className="text-xs text-zinc-500 mb-3">
          상위 100대 은행과 그 밖의 은행. 격차는 보여주기만 하고 판정에는 쓰지
          않습니다 — 아래 &ldquo;보는 법&rdquo; 참고.
        </p>
        <SizeSplitChart series={data.sizeSplit} />
      </section>

      {/* 차트 3 — 집중도 */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-1">
          자산 규모별 CRE 집중도
        </h2>
        <p className="text-xs text-zinc-500 mb-3">
          총자산 대비 상업용 부동산 대출 비중.
        </p>
        <ConcentrationChart
          latest={latestConcentration}
          buckets={data.buckets}
          regionalBucket={regionalBucket}
          warnPct={thresholds.warnConcentrationPct}
          alertPct={thresholds.alertConcentrationPct}
        />
      </section>

      {/* 보는 법 */}
      <section className="mb-6">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-3">
          보는 법
        </h2>
        <div className="space-y-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          <p>
            <strong>수준과 속도를 같이 봅니다.</strong> 연체율이 몇 %인지만 보면
            늦습니다. 2024년 초 지역은행 상업용 부동산 충격 때 수준은 아직 주의선
            아래였지만 <strong>상승 속도는 역대 최대</strong>였습니다. 그래서 전년
            대비 상승폭을 따로 재고, 둘 중 나쁜 쪽을 따릅니다.
          </p>
          <p>
            <strong>집중도는 사건이 아니라 체질입니다.</strong> 연체율이 &ldquo;지금
            얼마나 아픈가&rdquo;라면 집중도는 &ldquo;맞으면 얼마나 크게
            다치는가&rdquo;입니다. 천천히 움직이고 오래 켜져 있습니다.
          </p>
          <p>
            <strong>규모별 격차는 판정에 쓰지 않습니다.</strong> 격차가 좁혀지는 데는
            정반대인 두 가지 이유가 있습니다 — 대형이 회복 중이거나, 지역이 나빠지는
            중이거나. 격차 하나로는 둘을 구분할 수 없어 경보 근거가 되지 못합니다.
            (지금은 실제로 둘 다 일어나는 중입니다) 그래서 차트로 보여만 줍니다.
          </p>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="font-semibold text-zinc-800 dark:text-zinc-200 mb-1.5">
              이 페이지에 없는 것
            </p>
            <p className="text-zinc-600 dark:text-zinc-400">
              <strong>오피스만 뗀 숫자는 없습니다.</strong> 은행 감독 보고서가 상업용
              부동산을 오피스·리테일·물류로 나누지 않기 때문입니다. 공개 통계로 갈 수
              있는 가장 가까운 자리가 &ldquo;임대용 비주거&rdquo;라 그것을 씁니다.
              오피스보다 넓은 범위라는 점을 감안해서 읽어야 합니다.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 mt-2">
              <strong>2026~27년 만기 도래 벽도 없습니다.</strong> 그 수치는 민간
              조사기관이 유료로 파는 자료라 여기서 쓸 수 없습니다. 대신 만기 벽의
              예상 대신 그 <strong>결과</strong>인 연체율 추이를 봅니다. 재융자가
              막히면 결국 연체로 나타나기 때문입니다.
            </p>
          </div>

          <p className="text-zinc-500">
            분기 데이터라 매일 움직이지 않습니다. 값이 며칠째 그대로여도 고장이
            아닙니다.
          </p>
        </div>
      </section>

      <CriteriaNote>연체율 1.5% 이상 주의, 2.5% 이상 경보, 1년 상승폭 +0.5%p 이상 주의, +0.75%p 이상 경보, 지역은행 집중도 30% 이상 주의, 34% 이상 경보입니다. 상승 속도를 함께 보기로 한 것은 2010년·2023년 사례를 보고 정했지만, 0.5%p·0.75%p라는 값 자체의 근거는 따로 없습니다.</CriteriaNote>
      <p className="text-xs text-zinc-500">
        이 지표는 시장 상황을 지켜보기 위한 참고 자료입니다. 투자 권유가 아니며, 모든
        투자 판단은 본인의 책임입니다.
      </p>
    </div>
  );
}
