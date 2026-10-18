import type { Metadata } from "next";
import { ObservatoryBreadcrumb } from "../breadcrumb";
import { FiringRateLine } from "../firing-rate";
import type { RateVolResponse } from "@/app/api/observatory/rate-volatility/route";
import RateVolChart from "../_obs4/RateVolChart";
import { formatDay } from "../_obs4/format";
import { Disclaimer, fetchOwnApi, Notice, Section, StatusBadge } from "../_obs4/parts";

export const metadata: Metadata = {
  title: "관측소 · 10년물 금리 변동성 (MOVE 대리) | TockTock",
  description:
    "10년 국채 금리가 최근 20영업일 동안 하루에 얼마나 흔들렸는지 봅니다. MOVE 지수가 아니라 실제 움직임으로 계산한 대리 지표입니다. 출처는 FRED DGS10입니다.",
};

export const dynamic = "force-dynamic";

function Limitation() {
  return (
    <Notice>
      <p>
        이 지표는 MOVE 지수가 아닙니다. MOVE는 국채 옵션 가격에 담긴 앞으로의 변동성 기대인데, 무료로 공개된
        출처를 찾지 못했습니다.
      </p>
      <p>
        대신 10년 국채 금리의 하루 변화로, 최근 20영업일 동안 실제로 얼마나 흔들렸는지(실현변동성)를 계산했습니다.
        이미 일어난 움직임이라 MOVE보다 늦게 반응하고, 10년물 하나만 봅니다.
      </p>
    </Notice>
  );
}

export default async function Page() {
  const data = await fetchOwnApi<RateVolResponse>("/api/observatory/rate-volatility");
  if (!data || !data.latest || data.latest.rv20Bp === null) {
    return (
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <ObservatoryBreadcrumb indicator="rate-volatility" />
        <h1 className="text-2xl font-bold mb-4">10년물 금리 변동성 (MOVE 대리)</h1>
        <Limitation />
        <p className="text-sm text-zinc-500">아직 데이터가 없습니다. FRED 수집을 기다리는 중입니다.</p>
      </div>
    );
  }
  const { latest, thresholds } = data;
  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <ObservatoryBreadcrumb indicator="rate-volatility" />
      <header className="mb-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          10년물 금리 변동성 (MOVE 대리)
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed">
          국채 금리가 크게 출렁이면 국채를 담보로 돈을 빌린 곳들이 담보를 더 내야 하고, 딜러는 물량을 받아 주기를
          꺼리게 됩니다. 금리가 얼마나 거칠게 움직이는지가 국채시장의 긴장도를 보여 줍니다.
        </p>
        <p className="text-xs text-zinc-400 mt-1.5">
          출처: FRED {data.seriesId} (10년 만기 국채 금리, 원자료는 연방준비제도 H.15) · 일간
        </p>
      </header>

      <Limitation />

      <div className="mb-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-zinc-400 mb-1">최근 20영업일 실현변동성 (하루 변화의 표준편차)</div>
            <div className="text-4xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
              {latest.rv20Bp!.toFixed(1)}bp
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
            <dt className="text-xs text-zinc-400">최근 10년 중 순위</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
              {data.percentile === null ? "—" : `${data.percentile.toFixed(0)}번째 백분위`}
            </dd>
            <dd className="text-xs text-zinc-500">
              주의 {thresholds.cautionCutBp?.toFixed(1)}bp · 경보 {thresholds.alertCutBp?.toFixed(1)}bp
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">10년물 금리</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">{latest.yieldPct.toFixed(2)}%</dd>
            <dd className="text-xs text-zinc-500">
              하루 변화 {latest.changeBp === null ? "—" : `${latest.changeBp > 0 ? "+" : ""}${latest.changeBp.toFixed(0)}bp`}
            </dd>
          </div>
        </dl>
      </div>

      <Section title="추이">
        <RateVolChart series={data.series} cautionCutBp={thresholds.cautionCutBp} alertCutBp={thresholds.alertCutBp} />
      </Section>

      <Section title="판정 기준">
        <p>
          변동성은 해마다 커지는 값이 아니라 오르내리는 값이라 크기 그대로 봅니다. 다만 금리 수준 자체가 달랐던 옛날과
          섞이지 않도록 <strong>최근 10년(2,520영업일) 안에서의 순위</strong>로 판정합니다.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            그 시점까지의 최근 10년 안에서 상위 {100 - thresholds.cautionPctile}% 안이면 주의, 상위{" "}
            {100 - thresholds.alertPctile}% 안이면 경보입니다. 값이 {thresholds.minObs}개(약 3년)보다 적게 쌓인 동안은
            판정 보류입니다.
          </li>
          <li>변동성이 낮은 쪽은 위험 신호가 아니라서 판정에 쓰지 않습니다.</li>
        </ul>
        <p>이 지표는 위기를 미리 알려 주는 용도로 검증된 것이 아닙니다.</p>
        <p className="text-zinc-500">
          과거에 이 규칙을 그 시점까지의 자료로만 적용해 보면, 2020년 3월에는 9일에 주의, 10일부터 경보였습니다. 2023년
          10월에는 21영업일 중 14일, 11월에는 모든 영업일이 주의 이상이었습니다. 2025년 4월 4일~11일은 금리가 크게 움직였지만 20영업일 평균으로는 주의 기준에
          닿지 않아 정상이었습니다. 2022년에는 대부분의 날이 주의 이상이었습니다(2026년 10월 점검 기준).
        </p>
        <FiringRateLine stats={data.firing} unit="영업일" />
      </Section>

      <Section title="언제 반영되나요">
        <p className="text-zinc-500">
          10년물 금리는 FRED에 보통 다음 영업일에 올라옵니다. 이 사이트에는 그 뒤 첫 평일 수집(한국 시각 밤 10시)에서
          반영됩니다. 그래서 화면의 기준일은 보통 1~3영업일 전입니다.
        </p>
      </Section>

      <Disclaimer />
    </div>
  );
}
