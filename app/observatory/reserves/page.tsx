import type { Metadata } from "next";
import { headers } from "next/headers";
import ReservesChart from "./ReservesChart";
import { formatChange, formatReserves, formatTrillion } from "./format";
import type { ReservesResponse } from "@/app/api/observatory/reserves/route";
// 오버레이용 주가지수는 "지표" 가 아니라 참고 데이터라 API 응답에 섞지 않는다.
// 서버 컴포넌트에서 Redis 를 직접 읽어 차트에만 넘긴다.
import { loadMarketIndex } from "@/lib/observatory-market-index";
import type { ObservatoryStatus } from "@/lib/observatory-constants";

export const metadata: Metadata = {
  title: "관측소 · 지급준비금 총량 | TockTock",
  description:
    "미국 은행 전체가 연준 계좌에 가진 돈의 총합 — 시스템이 굴러가는 연료의 총량. RRP 쿠션이 소진된 지금, 시장이 가장 긴장하며 보는 숫자입니다.",
};

export const dynamic = "force-dynamic";

async function getData(): Promise<ReservesResponse | null> {
  // 절대 URL 구성 (서버 컴포넌트에서 자체 API 호출 시)
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  try {
    const res = await fetch(`${proto}://${host}/api/observatory/reserves`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ReservesResponse;
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

export default async function ReservesPage() {
  const [data, indices] = await Promise.all([
    getData(),
    // 지수 수집이 아직이거나 실패해도 준비금 페이지는 그대로 떠야 한다
    loadMarketIndex().catch(() => []),
  ]);

  if (!data || data.series.length === 0) {
    return (
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold mb-4">관측소 · 지급준비금 총량</h1>
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
      {/* 헤더 */}
      <header className="mb-6">
        <div className="text-xs font-semibold text-zinc-500 mb-1">관측소</div>
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          지급준비금 총량
        </h1>
        <p className="text-sm text-zinc-500 mt-2">
          미국 은행 전체가 연준 계좌에 가진 돈의 총합 — 시스템이 굴러가는 연료의
          총량. RRP 쿠션이 소진된 지금, 시장이 가장 긴장하며 보는 숫자입니다.
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
            <div className="text-xs text-zinc-500">최신 총량</div>
            <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
              {latest ? formatReserves(latest.balanceBillions) : "—"}
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">
              {latest ? formatTrillion(latest.balanceBillions) : "—"}
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
              {data.weekOverWeekChange !== null
                ? formatChange(data.weekOverWeekChange)
                : "—"}
            </div>
          </div>

          <div>
            <div className="text-xs text-zinc-500">2019년 발작 수준 대비</div>
            <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums mt-1">
              {data.multipleOf2019 !== null
                ? `${data.multipleOf2019.toFixed(2)}배`
                : "—"}
            </div>
          </div>
        </div>

        <div className="mt-4 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          {latest ? (
            <>
              {thresholds.normalBillions.toLocaleString("en-US")}십억 달러를 넘으면
              정상, {thresholds.alertBillions.toLocaleString("en-US")}십억 달러 밑이면
              경보로 봅니다. 2019년 레포 발작 당시 수준은{" "}
              <strong className="text-zinc-900 dark:text-zinc-100">
                {thresholds.crisis2019Billions.toLocaleString("en-US")}십억 달러
              </strong>
              였습니다.
            </>
          ) : (
            "—"
          )}
        </div>
      </section>

      {/* 방향 안내 — 다른 관측소 지표와 반대라 먼저 짚어둔다 */}
      <section className="rounded-2xl border border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950 p-4 sm:p-5 mb-6">
        <div className="text-sm text-sky-900 dark:text-sky-200 leading-relaxed">
          <strong>이 지표는 방향이 반대입니다.</strong> SOFR·SRF·재할인 창구는 값이
          클수록 위험하지만, 지급준비금은 시스템의 연료라{" "}
          <strong>낮을수록 위험</strong>합니다.
        </div>
      </section>

      {/* 차트 */}
      <section className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 sm:p-6 mb-6">
        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-3">
          총량 추이 (십억 달러)
        </h2>
        <ReservesChart
          series={data.series}
          crisis2019Billions={thresholds.crisis2019Billions}
          crisis2019Date={thresholds.crisis2019Date}
          normalBillions={thresholds.normalBillions}
          alertBillions={thresholds.alertBillions}
          indices={indices}
        />
      </section>

      {/* 보는 법 */}
      <section className="rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 p-5 sm:p-6">
        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-3">
          보는 법
        </h2>
        <div className="space-y-3 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          <p>
            <strong>지급준비금</strong>은 은행들이 연준에 열어둔 계좌에 넣어둔
            돈입니다. 은행끼리 돈을 주고받을 때 실제로 오가는 게 이 돈이고요.
            그래서 이 총량은{" "}
            <strong className="text-zinc-900 dark:text-zinc-100">
              금융 시스템이 굴러가는 연료의 총량
            </strong>
            이라고 볼 수 있습니다.
          </p>
          <p>
            연료가 넉넉하면 은행들은 서로 편하게 돈을 빌려줍니다. 그런데 이게
            빠듯해지면 갑자기 아무도 돈을 안 내놓습니다.{" "}
            <strong className="text-zinc-900 dark:text-zinc-100">
              2019년 9월에 실제로 그런 일이 벌어졌습니다.
            </strong>{" "}
            하루짜리 금리가 갑자기 튀었고, 연준이 몇 년 만에 처음으로 돈을 직접 밀어
            넣어야 했습니다.
          </p>
          <p>
            지금 이 숫자가 특히 중요한 이유가 있습니다.{" "}
            <strong className="text-zinc-900 dark:text-zinc-100">
              완충재 역할을 하던 RRP 쿠션이 이미 다 빠졌기 때문입니다.
            </strong>{" "}
            예전엔 돈이 빠져나가도 RRP에서 먼저 빠졌지만, 이제 그럴 여유분이
            없습니다. 다음에 줄어드는 건 이 본체입니다.
          </p>

          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <div className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
              임계값은 어떻게 정했나요
            </div>
            <p>
              <strong className="text-zinc-900 dark:text-zinc-100">
                &ldquo;충분(ample)&rdquo;의 정확한 바닥은 아무도 모릅니다.
              </strong>{" "}
              연준도 모릅니다. 지나고 나서야 &ldquo;그때가 바닥이었구나&rdquo; 하고
              알게 되는 종류의 숫자입니다.
            </p>
            <p className="mt-2">
              2019년엔{" "}
              <strong>
                {thresholds.crisis2019Billions.toLocaleString("en-US")}십억 달러
              </strong>
              에서 발작이 터졌습니다. 하지만 그 뒤로 경제 규모가 커졌고, 은행들이
              들고 있어야 할 돈의 크기도 같이 올라왔습니다. 그러니{" "}
              <strong>그때 바닥이 지금 바닥은 아닙니다. 지금 바닥은 더 위에</strong>{" "}
              있습니다.
            </p>
            <p className="mt-2">
              그래서 이 페이지의 임계값(정상{" "}
              {thresholds.normalBillions.toLocaleString("en-US")} / 경보{" "}
              {thresholds.alertBillions.toLocaleString("en-US")}십억 달러)은{" "}
              <strong>보수적 추정치</strong>입니다. 정답이 아니라 &ldquo;이쯤부터는
              긴장하고 보자&rdquo;는 선으로 읽어주세요. 차트의 회색 점선(
              {thresholds.crisis2019Billions.toLocaleString("en-US")})은 역사적
              위험 구간을 표시한 눈금입니다.
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
              인 게 정상입니다. {thresholds.staleDays}일이 넘도록 새 값이 안
              들어오면 발표를 한 번 통째로 놓친 것으로 보고{" "}
              <strong>데이터 지연</strong>을 따로 표시합니다.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950 px-3 py-2">
              <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                정상
              </div>
              <div className="text-xs text-emerald-800 dark:text-emerald-200 mt-0.5">
                {thresholds.normalBillions.toLocaleString("en-US")}십억 달러 초과
              </div>
            </div>
            <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 px-3 py-2">
              <div className="text-xs font-bold text-amber-700 dark:text-amber-300">
                주의
              </div>
              <div className="text-xs text-amber-800 dark:text-amber-200 mt-0.5">
                {thresholds.alertBillions.toLocaleString("en-US")}~
                {thresholds.normalBillions.toLocaleString("en-US")}십억 달러
              </div>
            </div>
            <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950 px-3 py-2">
              <div className="text-xs font-bold text-rose-700 dark:text-rose-300">
                경보
              </div>
              <div className="text-xs text-rose-800 dark:text-rose-200 mt-0.5">
                {thresholds.alertBillions.toLocaleString("en-US")}십억 달러 미만
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
