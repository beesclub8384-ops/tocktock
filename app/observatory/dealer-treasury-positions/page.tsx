import type { Metadata } from "next";
import { ObservatoryBreadcrumb } from "../breadcrumb";
import { FiringRateLine } from "../firing-rate";
import type { DealerResponse } from "@/app/api/observatory/dealer-treasury-positions/route";
import LevelChart from "../_level/LevelChart";
import { formatDay } from "../_obs4/format";
import { Disclaimer, fetchOwnApi, Notice, Section, StatusBadge } from "../_obs4/parts";

export const metadata: Metadata = {
  title: "관측소 · 프라이머리 딜러 국채 보유 | TockTock",
  description:
    "국채 입찰에 꼭 참여해야 하는 프라이머리 딜러들이 국채를 4주 동안 얼마나 더 떠안았는지 봅니다. 출처는 뉴욕 연방준비은행입니다.",
};

export const dynamic = "force-dynamic";

function Limitation() {
  return (
    <Notice>
      <p>
        딜러들이 가진 국채에서 빌려 판 국채를 뺀 순포지션의 합계입니다. 보유가 늘어난 이유가 팔리지 않아 떠안은 것인지,
        일부러 사 모은 것인지는 이 숫자만으로 구분할 수 없습니다.
      </p>
      <p>
        뉴욕 연은은 보고 양식을 2015년 1월, 2022년 1월, 2024년 7월에 바꿨습니다. 이 사이트는 4주 변화를 계산할 때 이 경계를
        넘는 값끼리는 빼지 않습니다. 2013년 4월 이전 자료는 다른 양식이라 쓰지 않았습니다.
        보유 규모가 커지면서 4주 변화의 크기도 커졌는데, 기준은 2013년부터 쌓인 전체 분포라 최근일수록 신호가 자주
        켜집니다. 전체 발동 비율은 15% 아래지만 2018년(29%), 2023년(21%), 2024년(23%), 2025년(19%)은 15%를
        넘었습니다(2026년 10월 점검 기준). 뉴욕 연은 API 설명에는 물가연동국채
        (TIPS)가 빠졌다고 적혀 있지만, 실제 값은 TIPS를 포함한 합계입니다.
      </p>
    </Notice>
  );
}

export default async function Page() {
  const data = await fetchOwnApi<DealerResponse>("/api/observatory/dealer-treasury-positions");
  if (!data || !data.latest) {
    return (
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <ObservatoryBreadcrumb indicator="dealer-treasury-positions" />
        <h1 className="text-2xl font-bold mb-4">프라이머리 딜러 국채 보유</h1>
        <Limitation />
        <p className="text-sm text-zinc-500">아직 데이터가 없습니다. 뉴욕 연은 자료 수집을 기다리는 중입니다.</p>
      </div>
    );
  }
  const { latest, thresholds } = data;
  const ch = latest.change4wBillions;
  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <ObservatoryBreadcrumb indicator="dealer-treasury-positions" />
      <header className="mb-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">프라이머리 딜러 국채 보유</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed">
          프라이머리 딜러는 국채 입찰에 꼭 참여하고, 시장에서 사고팔 상대가 없을 때 국채를 받아 주는 은행·증권사입니다.
          짧은 기간에 딜러가 국채를 크게 떠안으면, 최종 투자자가 사지 않거나 팔고 있다는 뜻일 수 있습니다.
        </p>
        <p className="text-xs text-zinc-400 mt-1.5">
          출처: 뉴욕 연방준비은행 프라이머리 딜러 통계(FR 2004) · 시리즈 PDPOSGST-TOT · 주간(수요일 기준) · 단위 십억 달러
        </p>
      </header>

      <Limitation />

      <div className="mb-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-zinc-400 mb-1">4주 변화</div>
            <div className="text-4xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
              {ch === null ? "—" : `${ch > 0 ? "+" : ""}${ch.toFixed(1)}십억 달러`}
            </div>
          </div>
          <StatusBadge status={data.status} />
        </div>
        <dl className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-zinc-400">기준일</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200">{formatDay(latest.date)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">순포지션</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
              {latest.netBillions.toFixed(1)}십억 달러
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">4주 변화 순위</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
              {data.percentile === null ? "—" : `${Math.floor(data.percentile)}번째 백분위`}
            </dd>
            <dd className="text-xs text-zinc-500">
              현재 주의 {thresholds.cautionCut?.toFixed(2)} · 경보 {thresholds.alertCut?.toFixed(2)}십억 달러
            </dd>
          </div>
        </dl>
      </div>

      <Section title="순포지션 추이 (십억 달러)">
        <LevelChart
          data={data.series.map((r) => ({ x: r.date, v: r.netBillions }))}
          unit="십억 달러"
          digits={1}
          cautionCut={null}
          alertCut={null}
          name="순포지션"
          ranges={[
            ["2013년 이후 전체", null],
            ["최근 3년", 157],
          ]}
        />
      </Section>

      <Section title="4주 변화 (십억 달러)">
        <LevelChart
          data={data.series.map((r) => ({ x: r.date, v: r.change4wBillions }))}
          unit="십억 달러"
          digits={1}
          cautionCut={thresholds.cautionCut}
          alertCut={thresholds.alertCut}
          name="4주 변화"
          ranges={[
            ["2013년 이후 전체", null],
            ["최근 3년", 157],
          ]}
        />
      </Section>

      <Section title="판정 기준">
        <p>
          보유액은 국채 발행이 늘면서 커지고, 0 근처까지 내려간 적도 있어(2014년 말 7.8십억 달러) 비율 대신 4주 동안 몇
          십억 달러가 늘었는지로 봅니다.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            그 시점까지 쌓인 4주 변화 중 상위 {100 - thresholds.cautionPctile}% 안이면 주의, 상위{" "}
            {100 - thresholds.alertPctile}% 안이면 경보입니다. {thresholds.minObs}주보다 적게 쌓인 동안은 판정 보류입니다.
          </li>
          <li>줄어드는 쪽은 위험 신호로 보지 않습니다.</li>
        </ul>
        <p>이 지표는 위기를 미리 알려 주는 용도로 검증된 것이 아닙니다.</p>
        <p className="text-zinc-500">
          판정을 시작한 2016년 5월 이후, 2020년 3월 11일·18일 기준이 경보였습니다. 반면 2023년 3월 지역은행 사태와 2025년
          4월 관세 충격 때는 정상이었습니다. 2018년 하반기, 2024년 11~12월처럼 국채 발행이 크게 늘던 때에도 경보가 여러 번
          켜졌습니다(2026년 10월 점검 기준).
        </p>
        <FiringRateLine stats={data.firing} unit="주" />
      </Section>

      <Section title="언제 반영되나요">
        <p className="text-zinc-500">
          뉴욕 연은은 수요일 기준 값을 다음 주에 공개합니다(2026년 10월 18일 확인 때 최신 값은 10월 7일 기준). 이 사이트는
          평일 한국 시각 밤 10시 수집에서 반영하고, 과거 값이 고쳐질 수 있어 매번 전체를 다시 받습니다.
        </p>
      </Section>
      <Disclaimer />
    </div>
  );
}
