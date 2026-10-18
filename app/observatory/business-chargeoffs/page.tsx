import type { Metadata } from "next";
import { ObservatoryBreadcrumb } from "../breadcrumb";
import { FiringRateLine } from "../firing-rate";
import type { ChargeOffResponse } from "@/app/api/observatory/business-chargeoffs/route";
import LevelChart from "../_level/LevelChart";
import { Disclaimer, fetchOwnApi, Notice, Section, StatusBadge } from "../_obs4/parts";

export const metadata: Metadata = {
  title: "관측소 · 기업대출 상각률 (부도율 대리) | TockTock",
  description:
    "미국 은행이 기업대출을 회수할 수 없다고 보고 털어 낸 비율입니다. 회사채 부도율 대신 쓰는 대리 지표입니다. 출처는 FRED(연방준비제도)입니다.",
};

export const dynamic = "force-dynamic";

function Limitation() {
  return (
    <Notice>
      <p>
        이 지표는 회사채 부도율이 아닙니다. 신용평가사는 연간 보고서로 부도율 숫자를 공개하지만, 매번 자동으로 받아 올
        수 있는 무료 시계열은 없습니다. 그래서 미국 상업은행이 기업대출을 회수 불능으로 보고 장부에서 지운 비율(상각률)을
        대리 지표로 씁니다.
      </p>
      <p>
        회사채가 아니라 은행 대출이고, 부도가 난 시점이 아니라 은행이 손실로 처리한 시점이라 실제 부도보다 늦게
        움직입니다.
      </p>
    </Notice>
  );
}

export default async function Page() {
  const data = await fetchOwnApi<ChargeOffResponse>("/api/observatory/business-chargeoffs");
  if (!data || !data.latest) {
    return (
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <ObservatoryBreadcrumb indicator="business-chargeoffs" />
        <h1 className="text-2xl font-bold mb-4">기업대출 상각률 (부도율 대리)</h1>
        <Limitation />
        <p className="text-sm text-zinc-500">아직 데이터가 없습니다. FRED 수집을 기다리는 중입니다.</p>
      </div>
    );
  }
  const { latest, thresholds } = data;
  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <ObservatoryBreadcrumb indicator="business-chargeoffs" />
      <header className="mb-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          기업대출 상각률 (부도율 대리)
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed">
          기업이 빚을 못 갚기 시작하면 은행이 그 대출을 손실로 털어 냅니다. 이 비율이 오르면 갚지 못하는 회사가
          늘고 있다는 뜻입니다.
        </p>
        <p className="text-xs text-zinc-400 mt-1.5">
          출처: FRED {data.seriesId} (Charge-Off Rate on Business Loans, All Commercial Banks, 연방준비제도) · 분기 ·
          계절조정 · 단위 %
        </p>
      </header>

      <Limitation />

      <div className="mb-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-zinc-400 mb-1">
              {latest.quarter.replace("Q", "년 ")}분기 상각률
            </div>
            <div className="text-4xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
              {latest.ratePct.toFixed(2)}%
            </div>
          </div>
          <StatusBadge status={data.status} />
        </div>
        <dl className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-zinc-400">1985년 이후 순위</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
              {data.percentile === null ? "—" : `${Math.floor(data.percentile)}번째 백분위`}
            </dd>
            <dd className="text-xs text-zinc-500">
              현재 주의 {thresholds.cautionCut?.toFixed(3)}% · 경보 {thresholds.alertCut?.toFixed(3)}%
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">쌓인 자료</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">{thresholds.obs}분기</dd>
          </div>
        </dl>
      </div>

      <Section title="추이 (1985년 이후)">
        <LevelChart
          data={data.series.map((p) => ({ x: p.quarter, v: p.ratePct }))}
          unit="%"
          digits={2}
          cautionCut={thresholds.cautionCut}
          alertCut={thresholds.alertCut}
          name="상각률"
        />
      </Section>

      <Section title="판정 기준">
        <p>상각률은 비율이라 해마다 커지지 않습니다. 그래서 크기 그대로 봅니다.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            1985년부터 그 시점까지 쌓인 분기 값 중 상위 {100 - thresholds.cautionPctile}% 안이면 주의, 상위{" "}
            {100 - thresholds.alertPctile}% 안이면 경보입니다.
          </li>
          <li>
            {thresholds.minObs}분기(10년)보다 적게 쌓인 동안은 판정 보류입니다. 분기 자료는 3년치(12개)로는 상위 3%가
            사실상 최댓값 하나라 10년으로 정했습니다.
          </li>
          <li>낮은 쪽은 위험 신호로 보지 않습니다.</li>
        </ul>
        <p>이 지표는 위기를 미리 알려 주는 용도로 검증된 것이 아닙니다.</p>
        <p className="text-zinc-500">
          지금 공개된 값으로, 각 시점까지의 자료만 써서 이 규칙을 적용해 보면(이 시리즈는 사후에 고쳐질 수 있어 당시
          실제로 공개됐던 값과는 다를 수 있습니다), 2001년 침체(미국경제연구소 기준) 때는 2001년 4분기부터
          주의, 2002년 2분기 경보였고, 2008~2009년 침체 때는 2009년 1분기 주의, 2분기부터 경보였습니다. 둘 다 침체가
          시작된 뒤에 켜졌습니다. 2020년 코로나 침체 때는 상각률이 0.36%(2019년 4분기)에서 0.59%(2020년 2분기)로 올랐지만 주의 기준에 못 미쳐 정상이었습니다. 1990~1991년 침체는
          판정이 시작된 1994년 4분기보다 앞이라 판정하지 않았습니다(2026년 10월 점검 기준).
        </p>
        <FiringRateLine stats={data.firing} unit="분기" />
      </Section>

      <Section title="언제 반영되나요">
        <p className="text-zinc-500">
          FRED 갱신 기록을 보면 분기가 끝나고 약 7~8주 뒤에 새 값이 올라옵니다(2026년 2분기 값은 8월 25일). 이
          사이트에는 그 뒤 첫 평일 수집(한국 시각 밤 10시)에서 반영됩니다. 과거 값이 고쳐질 수 있어 매번 전체를 다시
          받습니다.
        </p>
      </Section>

      <Disclaimer />
    </div>
  );
}
