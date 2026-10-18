import { ObservatoryBreadcrumb } from "../breadcrumb";
import { FiringRateLine } from "../firing-rate";
import type { Metadata } from "next";
import { headers } from "next/headers";
import BasisTradeChart from "./BasisTradeChart";
import {
  formatChangeEok,
  formatContracts,
  formatContractsChange,
  formatNotional,
  formatNotionalEok,
  formatPct,
  formatReportDate,
} from "./format";
import type { BasisTradeResponse } from "@/app/api/observatory/basis-trade/route";
import type { ObservatoryStatus } from "@/lib/observatory-constants";

export const metadata: Metadata = {
  title: "관측소 · 국채 베이시스 트레이드 | TockTock",
  description:
    "헤지펀드가 국채 선물을 판 규모로 베이시스 트레이드가 얼마나 쌓였는지 짐작해 보는 대리 지표입니다. 출처는 CFTC TFF 보고서입니다.",
};

export const dynamic = "force-dynamic";

async function getData(): Promise<BasisTradeResponse | null> {
  // 절대 URL 구성 (서버 컴포넌트에서 자체 API 호출 시)
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  try {
    const res = await fetch(`${proto}://${host}/api/observatory/basis-trade`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as BasisTradeResponse;
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

/** 한계 문구 — 지표의 성격을 숫자보다 먼저 읽게 상단에 고정한다 */
function LimitationNotice() {
  return (
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <p>
        이 지표는 베이시스 트레이드 규모를 직접 잰 값이 아닙니다. CFTC가 공개하는 레버리지
        펀드의 국채 선물 순매도 포지션으로 짐작해 보는 대리 지표입니다.
      </p>
      <p className="mt-1">
        헤지펀드의 순매도에는 금리 상승에 거는 방향성 베팅이나 다른 헤지 거래도 섞여 있어,
        숫자 전체를 베이시스 트레이드로 볼 수는 없습니다.
      </p>
      <p className="mt-1">
        거래의 나머지 절반인 현물 국채 보유와 레포 차입 규모는 이 데이터에 나오지 않습니다.
      </p>
    </div>
  );
}

export default async function BasisTradePage() {
  const data = await getData();

  if (!data || !data.latest) {
    return (
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <ObservatoryBreadcrumb indicator="basis-trade" />
        <h1 className="text-2xl font-bold mb-4">국채 베이시스 트레이드 (대리 지표)</h1>
        <LimitationNotice />
        <p className="text-sm text-zinc-500">
          아직 데이터가 없습니다. CFTC 수집을 기다리는 중입니다.
        </p>
      </div>
    );
  }

  const { latest, thresholds } = data;
  const statusMeta = data.status ? STATUS_META[data.status] : PENDING_META;

  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <ObservatoryBreadcrumb indicator="basis-trade" />
      {/* 헤더 */}
      <header className="mb-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          국채 베이시스 트레이드 (대리 지표)
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed">
          헤지펀드가 현물 국채를 사고 국채 선물을 팔아 둘의 가격 차이를 먹는 거래입니다.
          레포로 돈을 빌려 크게 굴리기 때문에, 시장이 흔들리면 한꺼번에 청산될 수 있습니다.
        </p>
        <p className="text-xs text-zinc-400 mt-1.5">
          출처: CFTC Traders in Financial Futures (Futures Only, 데이터셋 {data.datasetId}) ·
          주간 (화요일 기준)
        </p>
      </header>

      <LimitationNotice />

      {/* 최신값 */}
      <div className="mb-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-zinc-400 mb-1">
              레버리지 펀드 국채 선물 순숏 (액면 명목)
            </div>
            <div className="text-4xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
              {formatNotional(latest.notionalBillions)}
            </div>
            <div className="text-sm text-zinc-500 mt-1 tabular-nums">
              {formatContracts(latest.netShortContracts)}
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
              {formatReportDate(latest.date)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">4주 변화</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
              {formatChangeEok(latest.change4wBillions)}
            </dd>
            <dd className="text-xs text-zinc-500">
              주의 {formatChangeEok(thresholds.cutoffs.caution4w)} · 경보{" "}
              {formatChangeEok(thresholds.cutoffs.alert4w)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">8주 변화</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
              {formatChangeEok(latest.change8wBillions)}
            </dd>
            <dd className="text-xs text-zinc-500">
              주의 {formatChangeEok(thresholds.cutoffs.caution8w)} · 경보{" "}
              {formatChangeEok(thresholds.cutoffs.alert8w)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">쏠림 구간 (참고)</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200">
              {data.concentrated === null
                ? "계산 불가"
                : data.concentrated
                  ? "쏠림 구간"
                  : "쏠림 아님"}
            </dd>
            <dd className="text-xs text-zinc-500">청산 신호가 켜질 때만 판정에 반영</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">최근 3년 백분위</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
              {data.percentile3y === null ? "—" : `${Math.floor(data.percentile3y)}번째`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">미결제약정 대비 순숏</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
              {formatPct(latest.netShortPctOfOi)}
            </dd>
          </div>
        </dl>
      </div>

      {/* 순숏 변화의 구성 — 판정과 무관한 참고 정보. 해석 문구 없이 숫자만 둔다 */}
      <section className="mb-6">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-1">
          순숏 변화의 구성
        </h2>
        <p className="text-xs text-zinc-500 mb-3">
          순숏 변화 = 숏 변화 − 롱 변화입니다. 액면 명목 기준이며, 미결제약정은 6개 만기 전체
          참가자의 계약 수 합계입니다.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[data.composition4w, data.composition8w].map((c, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4"
            >
              <div className="text-xs font-semibold text-zinc-400 mb-2">
                {idx === 0 ? thresholds.shortWeeks : thresholds.longWeeks}주 변화
                {c && (
                  <span className="font-normal">
                    {" "}
                    ({c.fromDate} → {c.toDate})
                  </span>
                )}
              </div>
              {c ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-zinc-400">숏 변화</dt>
                    <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
                      {formatChangeEok(c.shortChangeBillions)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-400">롱 변화</dt>
                    <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
                      {formatChangeEok(c.longChangeBillions)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-400">순숏 변화</dt>
                    <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
                      {formatChangeEok(c.netChangeBillions)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-400">미결제약정 변화</dt>
                    <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
                      {formatContractsChange(c.openInterestChange)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-zinc-500">계산할 수 없습니다 (데이터 부족)</p>
              )}
            </div>
          ))}
        </div>

        {/* 최근 8주 주간 구성 — 가장 최근 주가 위로.
            ⚠ 감싸개에 w-0 min-w-full 을 준다. 레이아웃의 main 이 flex 자식이라, 그냥 두면
              표의 최소 너비가 main 을 밀어 모바일에서 페이지 전체가 가로로 넘친다
              (실측: 390px 화면에서 문서 폭 554px). 이렇게 하면 표만 감싸개 안에서 스크롤된다. */}
        <div className="mt-4 w-0 min-w-full overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[520px] whitespace-nowrap text-sm tabular-nums">
            <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">보고일</th>
                <th className="px-3 py-2 text-right font-semibold">순숏 액면</th>
                <th className="px-3 py-2 text-right font-semibold">숏 액면</th>
                <th className="px-3 py-2 text-right font-semibold">롱 액면</th>
                <th className="px-3 py-2 text-right font-semibold">미결제약정</th>
              </tr>
            </thead>
            <tbody>
              {data.series
                .slice(-8)
                .reverse()
                .map((r) => (
                  <tr key={r.date} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-3 py-2 text-left text-zinc-700 dark:text-zinc-300">
                      {r.date}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-800 dark:text-zinc-200">
                      {formatNotionalEok(r.notionalBillions)}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">
                      {formatNotionalEok(r.shortNotionalBillions)}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">
                      {formatNotionalEok(r.longNotionalBillions)}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-300">
                      {formatContracts(r.openInterest)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 추이 */}
      <section className="mb-6">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-3">주간 추이</h2>
        <BasisTradeChart
          series={data.series}
          caution4wBillions={thresholds.cutoffs.caution4w}
          alert4wBillions={thresholds.cutoffs.alert4w}
          concentrationCutoffBillions={thresholds.concentrationCutoffBillions}
        />
      </section>

      {/* 판정 기준 */}
      <section className="mb-6">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-3">판정 기준</h2>
        <div className="space-y-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          <p>
            고정된 금액이 아니라 <strong>과거 분포 안에서의 위치</strong>로 판정합니다. 시장
            규모가 10년 사이 몇 배로 커져서, 고정 금액 기준은 금방 낡기 때문입니다.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>청산 신호</strong>: 액면 명목이 {thresholds.shortWeeks}주, {thresholds.longWeeks}
              주 동안 얼마나 줄었는지를 금액으로 봅니다. 각각 2016년 4월부터 그 시점까지 쌓인
              분포에서 하위 {thresholds.liquidationCautionPctile}% 이하면 주의, 하위{" "}
              {thresholds.liquidationAlertPctile}% 이하면 경보이고, 둘 중 더 나쁜 쪽을 씁니다.
              지금 기준선은 4주 {formatChangeEok(thresholds.cutoffs.caution4w)}(주의) ·{" "}
              {formatChangeEok(thresholds.cutoffs.alert4w)}(경보), 8주{" "}
              {formatChangeEok(thresholds.cutoffs.caution8w)}(주의) ·{" "}
              {formatChangeEok(thresholds.cutoffs.alert8w)}(경보)입니다.
            </li>
            <li>
              <strong>쏠림 구간</strong>: 액면 명목이 최근 {thresholds.lookbackWeeks}주(약 3년) 중
              상위 {100 - thresholds.concentrationPctile}% 안에 들면 쏠림 구간입니다. 지금
              기준선은{" "}
              {thresholds.concentrationCutoffBillions === null
                ? "—"
                : formatNotional(thresholds.concentrationCutoffBillions)}
              입니다. 쏠림 구간만으로는 주의를 켜지 않습니다. 청산 신호가 주의일 때 쏠림
              구간이면 경보로 한 단계 올립니다. 많이 쌓인 상태에서 풀리기 시작하는 쪽이 더
              위험하기 때문입니다.
            </li>
            <li>4주 변화와 8주 변화가 각각 157개보다 적게 쌓인 시점은 판정 보류로 둡니다(그래서 2019년 5월 말부터 판정합니다).</li>
          </ul>
          <p className="text-zinc-500">
            비율이 아니라 금액으로 보는 이유가 있습니다. 2021년 말에는 순숏이 0 근처까지 줄어
            비율이 수백 %씩 튀었습니다. 다만 금액 변화는 시장이 커질수록 폭도 커지는 경향이
            있어, 최근 연도에 신호가 더 쉽게 켜질 수 있습니다.
          </p>
          <p>
            이 지표는 순숏(숏에서 롱을 뺀 값)의 금액이 크게 줄어든 주를 알려 드립니다. 숏이
            줄어서 줄었는지, 롱이 늘어서 줄었는지는 위의 구성 영역에서 구분해서 보실 수
            있습니다. 롱이 늘어서 순숏이 줄어도 주의나 경보가 켜질 수 있습니다.
          </p>
          <p>
            2016년 4월 이후 주의 이상이 켜진 65주를 살펴보면(2026년 10월 점검 기준), 22주는 여러
            만기에서 숏이 함께 줄고 미결제약정도 줄어든 모습이었고, 나머지 대부분은 롱 증가나
            미결제약정 증가 등이 섞인 모습이었습니다.
          </p>
          <p>
            이 지표는 위기를 미리 알려 주는 용도로 검증된 것이 아닙니다. 2020년 3월에도 첫 경보
            기준일은 3월 10일이었고, 이 사이트에는 다음 주 월요일에 반영되기 때문에 위기와 같은
            시기에 나타났습니다.
          </p>
          <p className="text-zinc-500">
            과거 데이터에 이 규칙을 그 시점까지의 데이터로만 적용해 보면, 2020년 3월 코로나
            때는 3월 10일 보고분부터 경보가 켜졌습니다. 아래 발동 비율을 보고 기준을 다시 고치지는
            않았습니다.
          </p>
          <FiringRateLine stats={data.firing} unit="주" />
        </div>
      </section>

      {/* 보는 법 */}
      <section className="mb-6">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-3">보는 법</h2>
        <div className="space-y-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          <p>
            베이시스 트레이드는 같은 국채의 현물과 선물 사이에 생기는 작은 가격 차이를 먹는
            거래입니다. 차이가 작아서 <strong>빌린 돈으로 수십 배씩 키워야</strong> 돈이
            됩니다. 그래서 돈줄(레포)이 막히거나 가격이 튀면 한꺼번에 포지션을 정리하게 되고,
            그 매도가 국채 시장을 다시 흔듭니다.
          </p>
          <p>
            이 거래에서 헤지펀드는 선물을 <strong>파는 쪽</strong>에 섭니다. 그래서 CFTC가
            매주 공개하는 레버리지 펀드의 국채 선물 순매도(숏 − 롱)를 거래 규모의 그림자로
            봅니다. 2년·5년·10년·울트라 10년·30년·울트라 본드 6개 만기를 합쳤습니다.
          </p>
          <p>
            만기마다 계약 크기가 달라 계약 수를 그냥 더하지 않고 액면 금액으로 바꿔
            합쳤습니다. 2년물은 계약당 20만 달러, 나머지는 10만 달러입니다(CFTC 보고서의
            계약 단위 기준). 다만{" "}
            <strong>만기별 금리 민감도(듀레이션) 차이는 반영하지 못합니다.</strong> 같은 액면이라도
            30년물이 2년물보다 금리 변화에 훨씬 크게 움직입니다.
          </p>
          <p className="text-zinc-500">
            데이터는 화요일 기준이고 금요일 오후(미 동부 시간)에 공개됩니다. 이 사이트에는
            다음 주 월요일에 반영됩니다. 미국 연휴가 낀 주에는 하루 더 늦어질 수 있습니다.
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
