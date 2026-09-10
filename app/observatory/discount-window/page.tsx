import { ObservatoryBreadcrumb } from "../breadcrumb";
import type { Metadata } from "next";
import { headers } from "next/headers";
import DiscountWindowChart from "./DiscountWindowChart";
import { formatBalance } from "./format";
import type { DiscountWindowResponse } from "@/app/api/observatory/discount-window/route";
import type { ObservatoryStatus } from "@/lib/observatory-constants";

export const metadata: Metadata = {
  title: "관측소 · 재할인 창구 대출 잔액 | TockTock",
  description:
    "은행들의 최후 비상구. 낙인 때문에 평시엔 아무도 안 쓰는 창구라, 잔액 급증은 가짜 양성이 없는 경보입니다.",
};

export const dynamic = "force-dynamic";

async function getData(): Promise<DiscountWindowResponse | null> {
  // 절대 URL 구성 (서버 컴포넌트에서 자체 API 호출 시)
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  try {
    const res = await fetch(`${proto}://${host}/api/observatory/discount-window`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as DiscountWindowResponse;
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

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

function formatKstDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default async function DiscountWindowPage() {
  const data = await getData();

  if (!data || data.series.length === 0) {
    return (
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold mb-4">관측소 · 재할인 창구 대출 잔액</h1>
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950 p-4 text-sm text-amber-800 dark:text-amber-200">
          아직 수집된 데이터가 없습니다. 평일 밤 10시(KST)에 자동으로 채워집니다.
        </div>
      </div>
    );
  }

  const meta = STATUS_META[data.status];
  const latest = data.latest;
  const { thresholds } = data;

  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <ObservatoryBreadcrumb indicator="discount-window" />
      {/* 헤더 */}
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          재할인 창구 대출 잔액
        </h1>
        <p className="text-sm text-zinc-500 mt-2">
          은행들의 최후 비상구. 낙인 때문에 평시엔 아무도 안 쓰는 창구라, 잔액
          급증은 가짜 양성이 없는 경보입니다.
        </p>
        <p className="text-xs text-zinc-400 mt-1">
          출처: FRED (Federal Reserve Bank of St. Louis), 시리즈 {data.seriesId} ·
          주간(매주 수요일 기준, 목요일 갱신)
        </p>
        <p className="text-xs text-zinc-400 mt-1">
          마지막 업데이트: {formatKstDate(data.lastUpdated)}
        </p>
      </header>

      {/* 데이터 지연 알림 — FRED 갱신이 막혀 마지막 성공값을 그대로 보여주는 상태 */}
      {data.dataDelayed && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <strong>데이터 지연</strong> — FRED에서 새 값을 받지 못하고 있습니다.
          아래 숫자는 마지막으로 받아둔 {latest ? formatDate(latest.date) : "—"}{" "}
          기준값이며, {data.daysSinceLatest}일 전 값입니다.
        </div>
      )}

      {/* 현재 상태 */}
      <section className="rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/30 border border-zinc-300 dark:border-zinc-700 p-5 sm:p-6 mb-6">
        <div className="flex flex-wrap items-center gap-4 sm:gap-8">
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-bold ${meta.className}`}
          >
            <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
            {meta.label}
          </div>

          <div>
            <div className="text-xs text-zinc-500">최신 잔액</div>
            <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
              {latest ? formatBalance(latest.balanceBillions) : "—"}
            </div>
          </div>

          <div>
            <div className="text-xs text-zinc-500">기준일 (수요일)</div>
            <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              {latest ? formatDate(latest.date) : "—"}
            </div>
            {/* 주간 데이터라 최신값이 최대 7일 전인 게 정상이다. 오해 없게 명시 */}
            <div className="text-xs text-zinc-500 mt-0.5">
              {data.daysSinceLatest !== null ? `${data.daysSinceLatest}일 전 값` : "—"}
            </div>
          </div>

          <div>
            <div className="text-xs text-zinc-500">전주 대비</div>
            <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums mt-1">
              {data.previous ? formatBalance(data.previous.balanceBillions) : "—"}
              {data.weekOverWeekMultiple !== null && (
                <span
                  className={
                    data.surged
                      ? "ml-2 text-amber-600 dark:text-amber-400"
                      : "ml-2 text-zinc-500"
                  }
                >
                  ×{data.weekOverWeekMultiple.toFixed(2)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          {latest ? (
            <>
              현재 잔액은 2023년 3월 피크(
              {formatBalance(thresholds.peakBillions)})의{" "}
              <strong className="text-zinc-900 dark:text-zinc-100">
                {((latest.balanceBillions / thresholds.peakBillions) * 100).toFixed(1)}%
              </strong>{" "}
              수준입니다. {thresholds.cautionBillions}십억 달러 이상이면 주의,{" "}
              {thresholds.alertBillions}십억 달러를 넘으면 경보로 봅니다.
            </>
          ) : (
            "—"
          )}
          {data.surged && (
            <>
              {" "}
              <strong className="text-amber-600 dark:text-amber-400">
                전주 대비 {thresholds.surgeMultiple}배 이상 급증했습니다.
              </strong>
            </>
          )}
        </div>
      </section>

      {/* 차트 */}
      <section className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 sm:p-6 mb-6">
        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-3">
          잔액 추이 (십억 달러)
        </h2>
        <DiscountWindowChart
          series={data.series}
          peakBillions={thresholds.peakBillions}
          peakDate={thresholds.peakDate}
          cautionBillions={thresholds.cautionBillions}
          alertBillions={thresholds.alertBillions}
        />
      </section>

      {/* 보는 법 */}
      <section className="rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 p-5 sm:p-6">
        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-3">
          보는 법
        </h2>
        <div className="space-y-3 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          <p>
            <strong>재할인 창구(Discount Window)</strong>는 연준이 은행에게 직접 돈을
            빌려주는 창구입니다. 그중 <strong>1차 신용(Primary Credit)</strong>은
            건전한 은행이 쓰는 통로고요.
          </p>
          <p>
            그런데 은행들은 이 창구를 쓰기를 꺼립니다.{" "}
            <strong className="text-zinc-900 dark:text-zinc-100">
              &ldquo;저기서 돈을 빌렸다&rdquo;는 사실 자체가 &ldquo;저 은행 돈이
              말랐다&rdquo;는 낙인이 되기 때문입니다.
            </strong>{" "}
            시장에서 조금 더 비싸게라도 구할 수 있으면 그쪽을 씁니다.
          </p>
          <p>
            그래서 이 지표는 반대로 읽기 좋습니다. 낙인을 감수하고서라도 쓴다는 건
            다른 방법이 없었다는 뜻이니까요.{" "}
            <strong className="text-zinc-900 dark:text-zinc-100">
              평시엔 아무도 안 쓰는 창구라 가짜 양성(괜히 튀는 경보)이 거의
              없습니다.
            </strong>
          </p>

          <p>
            다만 &ldquo;전주 대비 {thresholds.surgeMultiple}배&rdquo;는 잔액이 아주
            적을 때 의미가 없습니다. 100만 달러가 5,700만 달러가 되어도 배수로는
            57배니까요.{" "}
            <strong className="text-zinc-900 dark:text-zinc-100">
              그래서 전주 잔액이 {thresholds.surgeMinBillions}십억 달러 미만이면
              급증 판정을 하지 않습니다.
            </strong>{" "}
            이걸 걸러내지 않으면 잡음이 경보로 올라와, 정작 진짜 사건이 났을 때
            구분이 안 됩니다.
          </p>

          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <div className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
              2023년 3월 점선은 무엇인가요
            </div>
            <p>
              실리콘밸리은행(SVB) 파산으로 은행 예금이 한꺼번에 빠져나가던 주입니다.
              그 주({formatDate(thresholds.peakDate)} 기준) 잔액이{" "}
              <strong>{formatBalance(thresholds.peakBillions)}</strong>까지
              뛰었습니다. 평소 5십억 달러 안팎이던 창구가 30배로 부풀었던 거죠.
            </p>
            <p className="mt-2">
              차트의 점선은 그때 높이입니다. 지금 값이 역사적으로 어느 수준인지
              견주는 눈금으로 쓰시면 됩니다. 평시 잔액은 한 자릿수라 이 눈금 아래
              바닥에 붙어 보이는데, 그게 정상입니다. 최근 변화는 아래{" "}
              <strong>확대 차트</strong>에서 보시면 됩니다.
            </p>
          </div>

          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <div className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
              날짜가 며칠 전인데 괜찮나요
            </div>
            <p>
              이 지표는 <strong>주간 데이터</strong>입니다. 매주 수요일 잔액을 그 주
              목요일에 발표합니다. 그래서 최신값이{" "}
              <strong className="text-zinc-900 dark:text-zinc-100">
                최대 7일 전 값
              </strong>
              인 게 정상입니다. 매일 갱신되는 SOFR·SRF 지표와 다릅니다.
            </p>
            <p className="mt-2">
              위에 기준일과 &ldquo;며칠 전 값&rdquo;을 같이 적어둔 이유입니다.{" "}
              {thresholds.staleDays}일이 넘도록 새 값이 안 들어오면 발표를 한 번
              통째로 놓친 것으로 보고 <strong>데이터 지연</strong>을 따로 표시합니다.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950 px-3 py-2">
              <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                정상
              </div>
              <div className="text-xs text-emerald-800 dark:text-emerald-200 mt-0.5">
                잔액 {thresholds.cautionBillions}십억 달러 미만
              </div>
            </div>
            <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 px-3 py-2">
              <div className="text-xs font-bold text-amber-700 dark:text-amber-300">
                주의
              </div>
              <div className="text-xs text-amber-800 dark:text-amber-200 mt-0.5">
                {thresholds.cautionBillions}~{thresholds.alertBillions}십억 달러,
                또는 전주 대비 {thresholds.surgeMultiple}배 이상 급증(전주 잔액{" "}
                {thresholds.surgeMinBillions}십억 달러 이상일 때)
              </div>
            </div>
            <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950 px-3 py-2">
              <div className="text-xs font-bold text-rose-700 dark:text-rose-300">
                경보
              </div>
              <div className="text-xs text-rose-800 dark:text-rose-200 mt-0.5">
                잔액 {thresholds.alertBillions}십억 달러 초과
              </div>
            </div>
          </div>

          <p className="text-xs text-zinc-500 pt-1">
            이 지표는 시장 상황을 지켜보기 위한 참고 자료입니다. 투자 권유가 아니며,
            모든 투자 판단은 본인의 책임입니다.
          </p>
        </div>
      </section>
    </div>
  );
}
