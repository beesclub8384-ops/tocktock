import type { Metadata } from "next";
import { ObservatoryBreadcrumb } from "../breadcrumb";
import type { TicResponse } from "@/app/api/observatory/foreign-holdings/route";
import TicChart from "../_obs4/TicChart";
import { formatBillions, formatMonth } from "../_obs4/format";
import { Disclaimer, fetchOwnApi, Notice, Section, StatusBadge } from "../_obs4/parts";

export const metadata: Metadata = {
  title: "관측소 · 해외 보유 국채 | TockTock",
  description:
    "외국이 가진 미국 국채의 합계가 1년 전보다 얼마나 늘거나 줄었는지 봅니다. 출처는 미 재무부 TIC입니다.",
};

export const dynamic = "force-dynamic";

function Limitation() {
  return (
    <Notice>
      <p>
        합계의 대부분을 차지하는 국채 채권·노트는 시가(그때의 시장 가격) 기준입니다. 그래서 금리가 오르면 외국이 한 장도
        팔지 않아도 보유액이 줄어듭니다. &ldquo;외국이 팔았다&rdquo;와 &ldquo;가격이 떨어졌다&rdquo;를 이 숫자만으로는
        나눌 수 없습니다.
      </p>
      <p>
        재무부도 밝히듯, 해외 보관 계좌에 맡긴 국채는 실제 주인 나라가 아니라 보관 기관이 있는 나라로 잡힐 수 있습니다.
        그래서 나라별 숫자 대신 전체 합계만 봅니다.
      </p>
    </Notice>
  );
}

export default async function Page() {
  const data = await fetchOwnApi<TicResponse>("/api/observatory/foreign-holdings");
  if (!data || !data.latest) {
    return (
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <ObservatoryBreadcrumb indicator="foreign-holdings" />
        <h1 className="text-2xl font-bold mb-4">해외 보유 국채</h1>
        <Limitation />
        <p className="text-sm text-zinc-500">아직 데이터가 없습니다. 재무부 자료 수집을 기다리는 중입니다.</p>
      </div>
    );
  }
  const { latest, thresholds } = data;
  const yoy = latest.yoyPct;
  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <ObservatoryBreadcrumb indicator="foreign-holdings" />
      <header className="mb-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">해외 보유 국채</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed">
          외국 정부와 투자자가 가진 미국 국채의 합계입니다. 미국은 국채의 큰 몫을 해외에 팔아 왔기 때문에, 밖에서 사 주는
          힘이 빠지면 금리가 오르기 쉬워집니다.
        </p>
        <p className="text-xs text-zinc-400 mt-1.5">
          출처: 미 재무부 TIC, Major Foreign Holders of Treasury Securities (SLT Table 5 · 과거 표 mfhhis01) · 월간 · 월말 기준
        </p>
      </header>

      <Limitation />

      <div className="mb-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-zinc-400 mb-1">해외 보유 합계 · {formatMonth(latest.month)} 말</div>
            <div className="text-4xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
              {formatBillions(latest.totalBillions)}
            </div>
          </div>
          <StatusBadge status={data.status} />
        </div>
        <dl className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-zinc-400">12개월 증가율</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
              {yoy === null ? "—" : `${yoy > 0 ? "+" : ""}${yoy.toFixed(1)}%`}
            </dd>
            <dd className="text-xs text-zinc-500">
              주의 {thresholds.cautionCutPct?.toFixed(1)}% · 경보 {thresholds.alertCutPct?.toFixed(1)}%
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">12개월 변화</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
              {latest.yoyChangeBillions === null
                ? "—"
                : `${latest.yoyChangeBillions > 0 ? "+" : ""}${formatBillions(latest.yoyChangeBillions)}`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">전 기간 증가율 백분위</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
              {data.percentile === null ? "—" : `${data.percentile.toFixed(0)}번째`}
            </dd>
          </div>
        </dl>
      </div>

      <Section title="추이 (2012년 이후)">
        <TicChart series={data.series} cautionCutPct={thresholds.cautionCutPct} alertCutPct={thresholds.alertCutPct} />
      </Section>

      <Section title="판정 기준">
        <p>
          보유액은 해마다 커지는 값이라, 크기 그대로 보면 늘 최고치 근처에 있게 됩니다. 그래서{" "}
          <strong>1년 전보다 몇 % 늘었는지(12개월 증가율)</strong>로 봅니다.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            그 시점까지 쌓인 증가율 분포에서 하위 {thresholds.cautionPctile}% 안이면 주의, 하위 {thresholds.alertPctile}%
            안이면 경보입니다. 증가율이 {thresholds.minObs}개(3년)보다 적게 쌓인 동안은 판정 보류입니다.
          </li>
          <li>늘어나는 쪽은 해외 수요가 탄탄하다는 뜻이라 판정에 쓰지 않습니다.</li>
        </ul>
        <p>이 지표는 위기를 미리 알려 주는 용도로 검증된 것이 아닙니다.</p>
        <p className="text-zinc-500">
          과거에 이 규칙을 그 시점까지의 자료로만 적용해 보면, 2020년 3월은 정상이었고 2022년 9월~2023년 2월에 경보가
          이어졌습니다. 이때는 금리가 크게 올라 국채 가격이 떨어진 시기라, 실제로 판 것과 가격 하락이 섞여 있습니다. 판정할
          수 있었던 달 중 약 13%에서 주의 이상이 켜졌습니다.
        </p>
      </Section>

      <Section title="자료의 단절">
        <p>
          재무부 과거 표에는 2000~2011년에 시리즈가 끊긴 곳이 여러 번 있습니다(표 주석 6~17번). 대부분 연례 조사 기준이 바뀐
          것이고, 2011년 9월과 12월은 월간 보고 양식(SLT)으로 바뀐 것입니다. 이 사이트는 마지막 단절 뒤인{" "}
          {formatMonth(thresholds.startMonth)}부터만 씁니다. 연례 조사로 과거 값이 조금씩 고쳐지기 때문에 매번
          전체를 다시 받아 바꿔 둡니다.
        </p>
      </Section>

      <Section title="언제 반영되나요">
        <p className="text-zinc-500">
          재무부는 보통 매달 중순에 두 달 전 월말 값을 발표합니다(2026년 10월 16일 갱신분이 8월 말 값). 이 사이트에는
          발표 뒤 첫 평일 수집(한국 시각 밤 10시)에서 반영됩니다.
        </p>
      </Section>

      <Disclaimer />
    </div>
  );
}
