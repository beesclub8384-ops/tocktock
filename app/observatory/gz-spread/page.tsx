import type { Metadata } from "next";
import { ObservatoryBreadcrumb } from "../breadcrumb";
import { FiringRateLine } from "../firing-rate";
import type { GzResponse } from "@/app/api/observatory/gz-spread/route";
import LevelChart from "../_level/LevelChart";
import { Disclaimer, fetchOwnApi, Notice, Section, StatusBadge } from "../_obs4/parts";

export const metadata: Metadata = {
  title: "관측소 · 회사채 신용 스프레드 (하이일드 대리) | TockTock",
  description:
    "미국 기업 회사채가 같은 만기의 국채보다 이자를 얼마나 더 주는지 봅니다. 하이일드 스프레드 대신 쓰는 대리 지표이고, 출처는 연준 이사회가 공개하는 GZ 신용 스프레드입니다.",
};

export const dynamic = "force-dynamic";

function Limitation() {
  return (
    <Notice>
      <p>
        하이일드(투자등급 아래) 스프레드 원지수가 아닙니다. 널리 쓰이는 하이일드·CCC 지수는 데이터 제공사의 사전 서면
        승인 없이는 공개할 수 없게 돼 있어 싣지 않았습니다. 대신 연준 이사회가 공개하는 GZ 신용 스프레드를 대리 지표로
        씁니다.
      </p>
      <p>
        GZ 스프레드는 투자등급 채권까지 섞인 미국 비금융 기업 회사채 전체의 평균이라, 하이일드 지수보다 덜 움직이고 가장
        약한 회사들의 사정은 묻혀 보일 수 있습니다. 월간 자료라 한 달 안의 급변도 보이지 않습니다.
      </p>
      <p>
        연준이 모형을 다시 추정하면 과거 값도 바뀔 수 있습니다. 아래 과거 판정은 당시 공개됐던 값이 아니라 지금 공개된
        값으로 계산한 것입니다. 또 연준은 2026년 9월 값부터 일부 채권 자료의 제공사를 바꿨다고 밝혔습니다(방법은 같고,
        그 전 값은 고치지 않았다고 합니다).
      </p>
    </Notice>
  );
}

export default async function Page() {
  const data = await fetchOwnApi<GzResponse>("/api/observatory/gz-spread");
  if (!data || !data.latest) {
    return (
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <ObservatoryBreadcrumb indicator="gz-spread" />
        <h1 className="text-2xl font-bold mb-4">회사채 신용 스프레드 (하이일드 대리)</h1>
        <Limitation />
        <p className="text-sm text-zinc-500">아직 데이터가 없습니다. 연준 자료 수집을 기다리는 중입니다.</p>
      </div>
    );
  }
  const { latest, thresholds } = data;
  const [y, m] = latest.month.split("-");
  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <ObservatoryBreadcrumb indicator="gz-spread" />
      <header className="mb-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          회사채 신용 스프레드 (하이일드 대리)
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed">
          미국 기업이 발행한 회사채가 같은 만기의 국채보다 이자를 얼마나 더 주는지입니다. 투자자가 기업의 부도를 걱정할수록
          웃돈을 더 요구해 이 값이 넓어집니다.
        </p>
        <p className="text-xs text-zinc-400 mt-1.5">
          출처: 연준 이사회 FEDS Notes GZ 신용 스프레드(Gilchrist·Zakrajšek 방식) · 월간 · 단위 %p (1%p = 100bp)
        </p>
      </header>

      <Limitation />

      <div className="mb-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-zinc-400 mb-1">
              {y}년 {Number(m)}월 스프레드
            </div>
            <div className="text-4xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
              {latest.spreadPct.toFixed(2)}%p
            </div>
          </div>
          <StatusBadge status={data.status} />
        </div>
        <dl className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-zinc-400">1973년 이후 순위</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
              {data.percentile === null ? "—" : `${Math.floor(data.percentile)}번째 백분위`}
            </dd>
            <dd className="text-xs text-zinc-500">
              현재 주의 {thresholds.cautionCut?.toFixed(3)}%p · 경보 {thresholds.alertCut?.toFixed(3)}%p
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">쌓인 자료</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">{thresholds.obs}개월</dd>
          </div>
        </dl>
      </div>

      <Section title="추이">
        <LevelChart
          data={data.series.map((p) => ({ x: p.month, v: p.spreadPct }))}
          unit="%p"
          digits={2}
          cautionCut={thresholds.cautionCut}
          alertCut={thresholds.alertCut}
          name="스프레드"
          ranges={[
            ["1973년 이후 전체", null],
            ["최근 10년", 120],
          ]}
        />
      </Section>

      <Section title="판정 기준">
        <p>스프레드는 해마다 커지는 값이 아니라 오르내리는 값이라 크기 그대로 봅니다.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            1973년부터 그 시점까지 쌓인 월 값 중 상위 {100 - thresholds.cautionPctile}% 안이면 주의, 상위{" "}
            {100 - thresholds.alertPctile}% 안이면 경보입니다.
          </li>
          <li>{thresholds.minObs}개월(10년)보다 적게 쌓인 동안은 판정 보류입니다.</li>
          <li>스프레드가 좁은 쪽은 위험 신호로 보지 않습니다.</li>
        </ul>
        <p>이 지표는 위기를 미리 알려 주는 용도로 검증된 것이 아닙니다.</p>
        <p className="text-zinc-500">
          지금 공개된 값으로, 각 시점까지의 자료만 써서 이 규칙을 적용해 보면 이렇습니다(2026년 10월 점검 기준).
          2008년 위기 때는 2007년 11월에 주의, 2008년 2월에 경보가 켜졌습니다. 2020년 코로나 때는 2020년 3월에 경보가
          켜졌습니다. 반면 1990~1991년 침체(미국경제연구소 기준) 때는 내내 정상이었고, 2023년 3월 지역은행 사태 때도
          정상이었습니다. 1999년 8월부터 2003년 5월까지는 거의 4년 동안 주의 이상이 이어졌습니다. 침체가 없을 때 켜진
          적도 있습니다. 1998년 8월에 주의, 9~10월에 경보가 켜졌고, 1986년·1987년·1989년·2011년·2016년에도 주의가
          켜졌습니다.
        </p>
        <FiringRateLine stats={data.firing} unit="개월" />
      </Section>

      <Section title="언제 반영되나요">
        <p className="text-zinc-500">
          연준은 매월 넷째 영업일 오전 10시(미 동부) 이후에 지난달 값을 올리겠다고 밝히고 있습니다(통화정책회의 전
          발언 자제 기간과 겹치면 그 뒤). 공식 통계가 아니라 연구 자료라 예고 없이 늦어질 수 있습니다. 이 사이트의 수집은
          한국 시각 밤 10시(미 동부 오전 9시 무렵)라 게시 시각보다 이르고, 보통 그다음 평일 수집에서 반영됩니다. 2026년
          9월 값은 10월 6일에 올라왔습니다. 과거 값이 고쳐질 수 있어 매번 전체를 다시 받습니다.
        </p>
      </Section>

      <Disclaimer />
    </div>
  );
}
