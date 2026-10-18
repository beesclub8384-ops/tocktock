import type { Metadata } from "next";
import { ObservatoryBreadcrumb } from "../breadcrumb";
import { FiringRateLine } from "../firing-rate";
import type { ScoosResponse } from "@/app/api/observatory/scoos-hedge-fund/route";
import LevelChart from "../_level/LevelChart";
import { Disclaimer, fetchOwnApi, Notice, Section, StatusBadge } from "../_obs4/parts";

export const metadata: Metadata = {
  title: "관측소 · 헤지펀드 자금조달 조건 (레포 헤어컷 대리) | TockTock",
  description:
    "딜러들이 헤지펀드에 돈을 빌려줄 때 담보 조건(헤어컷 등)을 조이고 있는지 묻는 연준 설문의 응답 비율입니다. 레포 헤어컷·마진 대신 쓰는 대리 지표입니다.",
};

export const dynamic = "force-dynamic";

function Limitation() {
  return (
    <Notice>
      <p>
        헤어컷(담보를 맡길 때 깎이는 비율) 숫자가 아닙니다. 연준이 딜러 20곳 안팎에 &ldquo;지난 3개월 동안 헤지펀드에
        대한 비가격 조건(헤어컷, 최장 만기, 약정 등)을 조였는지&rdquo; 묻는 설문에서, 조였다는 답의 비율에서 풀었다는 답의
        비율을 뺀 값입니다. 그래서 레포 헤어컷·마진의 대리 지표입니다.
      </p>
      <p>
        응답 딜러가 적어 한 곳의 답이 바뀌어도 5%p쯤 움직입니다. 이 설문에는 국채를 담보로 한 헤어컷 문항이 따로 없어,
        국채 베이시스 트레이드의 조건과 바로 이어지지는 않습니다.
      </p>
    </Notice>
  );
}

export default async function Page() {
  const data = await fetchOwnApi<ScoosResponse>("/api/observatory/scoos-hedge-fund");
  if (!data || !data.latest) {
    return (
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <ObservatoryBreadcrumb indicator="scoos-hedge-fund" />
        <h1 className="text-2xl font-bold mb-4">헤지펀드 자금조달 조건 (레포 헤어컷 대리)</h1>
        <Limitation />
        <p className="text-sm text-zinc-500">아직 데이터가 없습니다. 연준 자료 수집을 기다리는 중입니다.</p>
      </div>
    );
  }
  const { latest, thresholds } = data;
  const qName = (q: string) => `${q.slice(0, 4)}년 ${["3", "6", "9", "12"][Number(q.slice(5)) - 1]}월 조사`;
  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <ObservatoryBreadcrumb indicator="scoos-hedge-fund" />
      <header className="mb-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          헤지펀드 자금조달 조건 (레포 헤어컷 대리)
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed">
          헤지펀드는 딜러에게 채권을 담보로 맡기고 돈을 빌려 레버리지를 키웁니다. 딜러가 담보 조건을 조이면 같은 담보로
          빌릴 수 있는 돈이 줄어, 레버리지를 줄이려는 매도가 나올 수 있습니다.
        </p>
        <p className="text-xs text-zinc-400 mt-1.5">
          출처: 연준 이사회 딜러 금융조건 설문(SCOOS) · 시리즈 EXH_E1_C5.Q5.NP · 분기 · 단위 %p(조였다는 응답 % − 풀었다는 응답 %)
        </p>
      </header>

      <Limitation />

      <div className="mb-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-zinc-400 mb-1">{qName(latest.quarter)} 순강화 비율</div>
            <div className="text-4xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
              {latest.netPct > 0 ? "+" : ""}
              {latest.netPct.toFixed(1)}%p
            </div>
          </div>
          <StatusBadge status={data.status} />
        </div>
        <dl className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-zinc-400">2011년 이후 순위</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
              {data.percentile === null ? "—" : `${Math.floor(data.percentile)}번째 백분위`}
            </dd>
            <dd className="text-xs text-zinc-500">
              현재 주의 {thresholds.cautionCut?.toFixed(2)}%p · 경보 {thresholds.alertCut?.toFixed(2)}%p
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">쌓인 자료</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">{thresholds.obs}분기</dd>
          </div>
        </dl>
      </div>

      <Section title="추이 (2011년 이후)">
        <LevelChart
          data={data.series.map((p) => ({ x: p.quarter, v: p.netPct }))}
          unit="%p"
          digits={1}
          cautionCut={thresholds.cautionCut}
          alertCut={thresholds.alertCut}
          name="순강화 비율"
          bars
        />
      </Section>

      <Section title="판정 기준">
        <p>설문 응답 비율은 해마다 커지는 값이 아니라 오르내리는 값이라 크기 그대로 봅니다.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            2011년부터 그 시점까지 쌓인 분기 값 중 상위 {100 - thresholds.cautionPctile}% 안이면 주의, 상위{" "}
            {100 - thresholds.alertPctile}% 안이면 경보입니다.
          </li>
          <li>{thresholds.minObs}분기보다 적게 쌓인 동안은 판정 보류입니다(그래서 2021년 2분기부터 판정했습니다).</li>
          <li>조건을 푸는 쪽(음수)은 위험 신호로 보지 않습니다.</li>
        </ul>
        <p>이 지표는 위기를 미리 알려 주는 용도로 검증된 것이 아닙니다.</p>
        <p className="text-zinc-500">
          판정을 시작한 2021년 2분기 이후, 2022년 12월 조사(+35.0%p)가 경보였고 2021년 9·12월, 2022년 6·9월, 2023년 6월
          조사가 주의였습니다(2026년 10월 점검 기준). 가장 크게 조인 때는 2020년 6월 조사(+78.3%p, 코로나 충격 직후)였지만,
          판정 시작 전이라 판정하지 않았습니다. 판정할 수 있는 기간이 짧고 응답 딜러가 적어 값이 계단처럼 움직입니다.
        </p>
        <FiringRateLine stats={data.firing} unit="분기" />
      </Section>

      <Section title="언제 반영되나요">
        <p className="text-zinc-500">
          연준은 이 설문을 분기마다(3·6·9·12월) 실시해 공개합니다. 2026년 9월 조사 결과 파일은 9월 23일에 만들어졌습니다.
          이 사이트는 평일 한국 시각 밤 10시 수집에서 새 조사를 확인하면 반영합니다. 과거 값이 고쳐질 수 있어 매번 전체를
          다시 받습니다.
        </p>
      </Section>

      <Disclaimer />
    </div>
  );
}
