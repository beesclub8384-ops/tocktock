import type { Metadata } from "next";
import { ObservatoryBreadcrumb } from "../breadcrumb";
import { FiringRateLine } from "../firing-rate";
import type { CapexResponse } from "@/app/api/observatory/ai-capex/route";
import LevelChart from "../_level/LevelChart";
import { Disclaimer, fetchOwnApi, Notice, Section, StatusBadge } from "../_obs4/parts";

export const metadata: Metadata = {
  title: "관측소 · AI 설비투자 (대형 기술기업 5곳) | TockTock",
  description:
    "마이크로소프트·알파벳·아마존·메타·오라클의 분기 설비투자 합계가 1년 전보다 얼마나 빨리 늘었는지 봅니다. 출처는 미국 증권거래위원회(SEC) 공시 자료입니다.",
};

export const dynamic = "force-dynamic";

function Limitation() {
  return (
    <Notice>
      <p>
        이 지표는 AI에만 쓴 돈이 아닙니다. 다섯 회사가 현금흐름표에 적은 설비투자 전체(데이터센터, 물류센터, 사무실
        등)이며, AI 설비투자의 크기를 짐작해 보는 대리 지표입니다.
      </p>
      <p>
        돈을 빌려서 쓴 것인지 번 돈으로 쓴 것인지(조달 방식)는 이 숫자로 알 수 없습니다. 리스로 들인 설비는 이 항목에
        들어가지 않습니다. 오라클은 회계분기가 2·5·8·11월에 끝나 달력 분기와 한 달씩 어긋납니다.
      </p>
    </Notice>
  );
}

const quarterName = (q: string) => `${q.slice(0, 4)}년 ${q.slice(5)}분기`;

export default async function Page() {
  const data = await fetchOwnApi<CapexResponse>("/api/observatory/ai-capex");
  if (!data || !data.latest) {
    return (
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <ObservatoryBreadcrumb indicator="ai-capex" />
        <h1 className="text-2xl font-bold mb-4">AI 설비투자 (대형 기술기업 5곳)</h1>
        <Limitation />
        <p className="text-sm text-zinc-500">아직 데이터가 없습니다. 공시 자료 수집을 기다리는 중입니다.</p>
      </div>
    );
  }
  const { latest, thresholds } = data;
  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <ObservatoryBreadcrumb indicator="ai-capex" />
      <header className="mb-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          AI 설비투자 (대형 기술기업 5곳)
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed">
          대형 기술기업 다섯 곳의 설비투자가 얼마나 빨리 늘어나는지 봅니다. 이 회사들은 AI 데이터센터 투자를 늘린다고
          밝혀 왔지만, 이 숫자에는 다른 설비도 섞여 있습니다. 투자가 너무 빨리 늘면 그 돈을 대기 위한 차입과, 투자가
          멈췄을 때의 충격이 함께 커질 수 있습니다.
        </p>
        <p className="text-xs text-zinc-400 mt-1.5">
          출처: 미국 증권거래위원회(SEC) XBRL 공시 (
          {data.companies.map((c) => `${c.name} ${c.ticker}`).join(" · ")}) · 분기 · 현금흐름표 유형자산 취득 지출
        </p>
      </header>

      <Limitation />

      <div className="mb-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-zinc-400 mb-1">{quarterName(latest.quarter)} 5곳 합계</div>
            <div className="text-3xl sm:text-4xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums whitespace-nowrap">
              {latest.totalBillions.toFixed(1)}십억 달러
            </div>
          </div>
          <StatusBadge status={data.status} pendingReason={data.status === null ? "표본 부족" : undefined} />
        </div>
        <dl className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-zinc-400">전년 같은 분기 대비</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
              {latest.yoyPct === null ? "—" : `${latest.yoyPct > 0 ? "+" : ""}${latest.yoyPct.toFixed(1)}%`}
            </dd>
            <dd className="text-xs text-zinc-500">
              현재 주의 {thresholds.cautionCut === null ? "—" : `${thresholds.cautionCut.toFixed(2)}%`} · 경보{" "}
              {thresholds.alertCut === null ? "—" : `${thresholds.alertCut.toFixed(2)}%`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">증가율 순위</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
              {data.percentile === null ? "—" : `${Math.floor(data.percentile)}번째 백분위`}
            </dd>
          </div>
          {Object.entries(latest.byCompany).map(([t, v]) => (
            <div key={t}>
              <dt className="text-xs text-zinc-400">{data.companies.find((c) => c.ticker === t)?.name ?? t}</dt>
              <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">{v.toFixed(1)}십억 달러</dd>
            </div>
          ))}
        </dl>
      </div>

      <Section title="5곳 합계 추이 (십억 달러)">
        <LevelChart
          data={data.series.map((r) => ({ x: r.quarter, v: r.totalBillions }))}
          unit="십억 달러"
          digits={1}
          cautionCut={null}
          alertCut={null}
          name="합계"
          bars
        />
      </Section>

      <Section title="전년 같은 분기 대비 증가율 (%)">
        <LevelChart
          data={data.series.map((r) => ({ x: r.quarter, v: r.yoyPct }))}
          unit="%"
          digits={1}
          cautionCut={thresholds.cautionCut}
          alertCut={thresholds.alertCut}
          name="증가율"
          bars
        />
      </Section>

      <Section title="판정 기준">
        <p>합계는 해마다 커지는 값이라, 크기 대신 전년 같은 분기보다 몇 % 늘었는지로 봅니다.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            그 시점까지 쌓인 증가율 중 상위 {100 - thresholds.cautionPctile}% 안이면 주의, 상위{" "}
            {100 - thresholds.alertPctile}% 안이면 경보입니다. 증가율이 {thresholds.minObs}개(10년)보다 적게 쌓인 동안은
            판정 보류입니다.
          </li>
          <li>
            자료가 2017년부터라 증가율이 아직 {thresholds.obs}개뿐입니다. 그래서 지금은 판정하지 않고 값만 보여 드립니다.
            증가율이 2018년 3분기부터 쌓였기 때문에, 2028년 2분기 값부터 판정할 수 있습니다.
          </li>
          <li>
            빨라지는 쪽만 봅니다. 투자가 갑자기 줄어드는 것도 위험이지만, 이 지표는 &ldquo;투자가 너무 빨리 불어나 조달
            부담이 쌓이는가&rdquo;를 묻습니다.
          </li>
        </ul>
        <p>이 지표는 위기를 미리 알려 주는 용도로 검증된 것이 아닙니다.</p>
        <p className="text-zinc-500">
          처음에는 증가율 20개(5년)부터 판정했고, 그 기준으로는 2023년 2분기부터 13분기 중 8분기에 주의·경보가
          켜졌습니다(2024년 2분기 이후 증가율 50~90%대). 2026년 10월에 모든 지표의 최소 표본을 &ldquo;40개 이상이면서
          3년 이상&rdquo;으로 맞추면서 이 지표는 판정을 멈췄습니다.
        </p>
        {data.firing.evaluable === 0 ? (
          <p className="text-zinc-500">표본 부족으로 판정하지 않습니다.</p>
        ) : (
          <FiringRateLine stats={data.firing} unit="분기" />
        )}
      </Section>

      <Section title="자료의 단절">
        <p>
          아마존은 2017년 연간 보고서부터 설비투자를 인센티브를 빼기 전 총액으로 적기 시작했고, 2016년 연간 값도
          6.7십억 달러에서 7.8십억 달러로 고쳐 적었습니다. 기준이 다른 값을 이어 붙이지 않으려고 총액 기준만 썼고,
          지금 쓰는 공시 항목으로 분기 값을 만들 수 있는 2017년 3분기부터 5곳 합계를 냅니다.
        </p>
        <p>
          회사들이 나중에 과거 값을 고쳐 적는 경우가 있습니다. 연간 값만 고쳐지고 분기 누적 값은 그대로인 경우가 있어,
          고친 값을 섞으면 차이가 4분기에 몰립니다. 그래서 모든 분기를 처음 공시된 값으로 계산합니다.
        </p>
      </Section>

      <Section title="언제 반영되나요">
        <p className="text-zinc-500">
          각 회사가 분기 보고서(10-Q)나 연간 보고서(10-K)를 내면 SEC 공시 자료에 실립니다. 이런 대형 상장사는 분기가
          끝나고 40일 안에 분기 보고서를, 회계연도가 끝나고 60일 안에 연간 보고서를 내야 합니다. 다섯 회사가 모두 낸
          분기만 합계에 넣기 때문에, 가장 늦게 내는 회사의 공시 뒤 첫 평일 수집(한국 시각 밤 10시)에서 반영됩니다.
          과거 값이 정정될 수 있어 매번 전체를 다시 받습니다.
        </p>
      </Section>

      <Disclaimer />
    </div>
  );
}
