import { ObservatoryBreadcrumb } from "../breadcrumb";
import type { Metadata } from "next";
import { headers } from "next/headers";
import NbfiLoansChart from "./NbfiLoansChart";
import {
  formatLoans,
  formatLoansChange,
  formatShare,
  formatWeekDate,
  formatYoy,
} from "./format";
import type { NbfiLoansResponse } from "@/app/api/observatory/nbfi-loans/route";
import type { ObservatoryStatus } from "@/lib/observatory-constants";

export const metadata: Metadata = {
  title: "관측소 · 은행의 비예금 금융기관 대출 | TockTock",
  description:
    "은행이 은행이 아닌 금융회사에 빌려준 대출입니다. 그림자금융에 대한 은행의 노출이 얼마나 빠르게 커지는지 짐작해 보는 대리 지표입니다. 출처는 연방준비제도 H.8입니다.",
};

export const dynamic = "force-dynamic";

async function getData(): Promise<NbfiLoansResponse | null> {
  // 절대 URL 구성 (서버 컴포넌트에서 자체 API 호출 시)
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  try {
    const res = await fetch(`${proto}://${host}/api/observatory/nbfi-loans`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as NbfiLoansResponse;
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

const PENDING_META = {
  label: "판정 보류",
  className:
    "bg-zinc-50 text-zinc-600 border-zinc-300 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-700",
  dot: "bg-zinc-400",
};

/**
 * 한계 문구 — 숫자보다 먼저 읽게 상단에 고정한다.
 * 기관 목록은 H.8 발표문 각주의 NDFI 대출 정의(2026-10 확인)를 그대로 옮겼다.
 */
function LimitationNotice() {
  return (
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <p>
        이 지표는 사모신용만 따로 잰 값이 아닙니다. 연방준비제도가 은행이 아닌 금융회사에 빌려준
        대출로 분류한 은행 대출 전체입니다.
      </p>
      <p className="mt-1">
        H.8 정의에 따르면 여기에는 주택·기업·소비자 신용 중개회사, 사모펀드, 보험사, 정부 지원
        대출기관, 다른 예금기관의 지주회사, 은행 자체 신탁 부서, 상장 투자펀드와 사모 자본펀드,
        헤지펀드, 연기금, 유동화 기구에 대한 대출이 들어갑니다.
      </p>
      <p className="mt-1">
        사모신용의 규모나 부실을 직접 보여 주는 값이 아니라, 그림자금융에 대한 은행의 노출이
        얼마나 빠르게 커지는지 짐작해 보는 대리 지표입니다.
      </p>
    </div>
  );
}

export default async function NbfiLoansPage() {
  const data = await getData();

  if (!data || !data.latest) {
    return (
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <ObservatoryBreadcrumb indicator="nbfi-loans" />
        <h1 className="text-2xl font-bold mb-4">은행의 비예금 금융기관 대출</h1>
        <LimitationNotice />
        <p className="text-sm text-zinc-500">
          아직 데이터가 없습니다. FRED 수집을 기다리는 중입니다.
        </p>
      </div>
    );
  }

  const { latest, thresholds } = data;
  const statusMeta = data.status ? STATUS_META[data.status] : PENDING_META;

  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <ObservatoryBreadcrumb indicator="nbfi-loans" />
      <header className="mb-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          은행의 비예금 금융기관 대출
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed">
          미국 상업은행이 은행이 아닌 금융회사에 빌려준 돈입니다. 그림자금융이 은행 돈을 얼마나
          끌어다 쓰고 있는지, 반대로 보면 은행이 그림자금융에 얼마나 물려 있는지를 보여 줍니다.
        </p>
        <p className="text-xs text-zinc-400 mt-1.5">
          출처: 연방준비제도 H.8 (FRED 시리즈 {data.seriesId}, 비교용 총대출 {data.totalLoansSeriesId}) ·
          주간 (수요일 기준) · 계절조정
        </p>
      </header>

      <LimitationNotice />

      {/* 최신값 */}
      <div className="mb-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-zinc-400 mb-1">현재 규모</div>
            <div className="text-4xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
              {formatLoans(latest.loansBillions)}
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
            <dt className="text-xs text-zinc-400">기준일</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200">
              {formatWeekDate(latest.date)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">전년 대비 증가율</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
              {formatYoy(latest.yoyPct)}
            </dd>
            <dd className="text-xs text-zinc-500">
              주의 {formatYoy(thresholds.cautionCutoffPct)} · 경보{" "}
              {formatYoy(thresholds.alertCutoffPct)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">전 기간 증가율 백분위</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
              {data.yoyPercentile === null ? "—" : `${data.yoyPercentile.toFixed(0)}번째`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">{thresholds.changeWeeks}주 변화 (참고)</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
              {formatLoansChange(latest.change13wBillions)}
            </dd>
            <dd className="text-xs text-zinc-500">판정에는 쓰지 않습니다</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">총대출 대비 비중 (참고)</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
              {formatShare(latest.shareOfTotalPct)}
            </dd>
          </div>
        </dl>
      </div>

      {/* 추이 */}
      <section className="mb-6">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-3">주간 추이</h2>
        <NbfiLoansChart
          series={data.series}
          cautionCutoffPct={thresholds.cautionCutoffPct}
          alertCutoffPct={thresholds.alertCutoffPct}
        />
      </section>

      {/* 재분류 안내 — H.8 공식 주석(h8notes)에서 확인한 날짜·금액만 적는다 */}
      <section className="mb-6">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-3">
          분류 변경에 주의해 주세요
        </h2>
        <div className="space-y-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          <p>
            연방준비제도는 보고 지침을 바꾸면서 2025년부터 다른 대출 항목에 있던 금액을 이
            항목으로 여러 차례 옮겼습니다. H.8 주석에 적힌 이동 금액은 아래와 같습니다.
          </p>
          <div className="w-0 min-w-full overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full min-w-[420px] whitespace-nowrap text-sm tabular-nums">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">기준 주</th>
                  <th className="px-3 py-2 text-left font-semibold">은행 구분</th>
                  <th className="px-3 py-2 text-right font-semibold">옮겨진 금액</th>
                </tr>
              </thead>
              <tbody>
                {RECLASSIFICATIONS.map((r) => (
                  <tr key={r.week + r.who} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-3 py-1.5 text-left">{r.week}</td>
                    <td className="px-3 py-1.5 text-left">{r.who}</td>
                    <td className="px-3 py-1.5 text-right">{r.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            <strong>
              옮겨진 금액도 잔액에 그대로 들어가 있어서, 2025년 한 해의 전년 대비 증가율은 실제로
              새로 빌려준 돈보다 크게 나옵니다.
            </strong>{" "}
            이 사이트는 이 값을 보정하지 않았습니다.
          </p>
        </div>
      </section>

      {/* 판정 기준 */}
      <section className="mb-6">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-3">판정 기준</h2>
        <div className="space-y-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          <p>
            잔액은 해마다 커지는 값이라, 크기 자체로 판정하면 늘 경보가 됩니다. 그래서{" "}
            <strong>전년 대비 증가율</strong>({thresholds.yoyWeeks}주 전 대비)로 봅니다.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              2015년 이후 그 시점까지 쌓인 증가율 분포에서 상위{" "}
              {100 - thresholds.cautionPctile}% 안이면 주의, 상위 {100 - thresholds.alertPctile}%
              안이면 경보입니다. 지금 기준선은 주의 {formatYoy(thresholds.cautionCutoffPct)}, 경보{" "}
              {formatYoy(thresholds.alertCutoffPct)}입니다 (증가율{" "}
              {thresholds.yoyObs.toLocaleString("en-US")}개 기준).
            </li>
            <li>
              증가율이 {thresholds.minYoyObs}개(약 3년)보다 적게 쌓인 시점은 판정 보류로 둡니다.
            </li>
            <li>
              대출이 줄어드는 쪽은 판정에 쓰지 않습니다. {thresholds.changeWeeks}주 변화는 참고로만
              보여 드립니다.
            </li>
          </ul>
          <p>
            이 지표는 위기를 미리 알려 주는 용도로 검증된 것이 아닙니다.
          </p>
          <p className="text-zinc-500">
            과거 데이터에 이 규칙을 그 시점까지의 데이터로만 적용해 보면, 2020년 3월에는 3월 18일
            기준일부터 경보가 켜졌습니다. 2023년 3월 SVB 때는 정상이었습니다. 2025년에는 거의 매주
            경보였는데, 위의 분류 변경분이 증가율에 섞인 영향이 큽니다. 판정할 수 있었던 406주 중
            약 26%에서 주의 이상이 켜져, 신호가 자주 나오는 편입니다. 이 결과를 보고 기준을 고치지는
            않았습니다.
          </p>
        </div>
      </section>

      {/* 보는 법 */}
      <section className="mb-6">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-3">보는 법</h2>
        <div className="space-y-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          <p>
            사모신용 펀드나 헤지펀드 같은 그림자금융 회사도 결국 은행에서 돈을 빌려 굴립니다.
            그래서 은행이 이런 회사들에 빌려준 돈이 빠르게 늘면, 그림자금융에서 문제가 생겼을 때
            은행까지 번질 수 있는 통로가 넓어진다고 볼 수 있습니다.
          </p>
          <p>
            총대출 대비 비중은 은행 대출 전체에서 이 대출이 차지하는 몫입니다. 증가율과 함께 보면,
            은행 대출 전체가 늘어서 같이 늘어난 것인지, 이쪽만 유독 빨리 늘어난 것인지 구분할 수
            있습니다.
          </p>
          <p className="text-zinc-500">
            H.8은 매주 금요일 오후(미 동부 시간)에 발표되고, 그 전주 수요일 기준 값이 담깁니다.
            이 사이트에는 발표 다음 주 월요일에 반영됩니다. 그래서 화면의 기준일은 반영일보다 약
            12일 앞섭니다. 주간 값은 나중에 분기 보고서에 맞춰 고쳐지기도 해서, 이 사이트는 매번
            전체 이력을 다시 받아 바꿔 둡니다.
          </p>
        </div>
      </section>

      <p className="text-xs text-zinc-500">
        이 지표는 시장 상황을 지켜보기 위한 참고 자료입니다. 투자 권유가 아니며, 모든 투자
        판단은 본인의 책임입니다.
      </p>
    </div>
  );
}

/**
 * H.8 주석(federalreserve.gov/releases/h8/h8notes.htm, 2026-10-18 확인)에 적힌,
 * 다른 항목에서 "loans to nondepository financial institutions" 로 옮겨진 금액.
 * 2026-04-01 주 재분류는 NDFI 가 아니라 "loans not elsewhere classified" 로 간 것이라 뺐다.
 */
const RECLASSIFICATIONS: { week: string; who: string; amount: string }[] = [
  { week: "2025-01-01", who: "국내 은행", amount: "113.5십억 달러" },
  { week: "2025-01-01", who: "외국계 은행", amount: "131.6십억 달러" },
  { week: "2025-04-02", who: "국내 은행", amount: "51.6십억 달러" },
  { week: "2025-04-02", who: "외국계 은행", amount: "15.5십억 달러" },
  { week: "2025-07-02", who: "국내 은행", amount: "41.7십억 달러" },
  { week: "2025-07-02", who: "외국계 은행", amount: "28.1십억 달러" },
  { week: "2025-10-01", who: "국내 은행", amount: "9.8십억 달러" },
  { week: "2025-12-31", who: "국내 은행", amount: "7.3십억 달러" },
  { week: "2026-07-01", who: "외국계 은행", amount: "6.1십억 달러" },
];
