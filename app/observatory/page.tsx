import type { Metadata } from "next";
import { headers } from "next/headers";
import SofrIorbChart from "./SofrIorbChart";
import type { SofrIorbResponse } from "@/app/api/observatory/sofr-iorb/route";
import type { ObservatoryStatus } from "@/lib/observatory-constants";

export const metadata: Metadata = {
  title: "관측소 · SOFR−IORB 스프레드 | TockTock",
  description:
    "레포 금리(SOFR)가 연준 지준 이자율(IORB) 위로 뜨는지 매일 지켜봅니다. 달러 자금시장이 빡빡해지는 신호를 먼저 보려고 만든 관측소입니다.",
};

export const dynamic = "force-dynamic";

async function getData(): Promise<SofrIorbResponse | null> {
  // 절대 URL 구성 (서버 컴포넌트에서 자체 API 호출 시)
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  try {
    const res = await fetch(`${proto}://${host}/api/observatory/sofr-iorb`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as SofrIorbResponse;
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
    label: "경고",
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

export default async function ObservatoryPage() {
  const data = await getData();

  if (!data || data.series.length === 0) {
    return (
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold mb-4">관측소 · SOFR−IORB 스프레드</h1>
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
          SOFR − IORB 스프레드
        </h1>
        <p className="text-sm text-zinc-500 mt-2">
          레포 금리(SOFR)가 연준이 은행 지급준비금에 주는 이자율(IORB) 위로 뜨는지
          매일 지켜봅니다. 출처: FRED (Federal Reserve Bank of St. Louis).
        </p>
        <p className="text-xs text-zinc-400 mt-1">
          마지막 업데이트: {formatKstDate(data.lastUpdated)}
        </p>
      </header>

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
            <div className="text-xs text-zinc-500">최신 스프레드</div>
            <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
              {latest
                ? `${latest.spreadBp > 0 ? "+" : ""}${latest.spreadBp.toFixed(1)}bp`
                : "—"}
            </div>
          </div>

          <div>
            <div className="text-xs text-zinc-500">기준일</div>
            <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              {latest ? formatDate(latest.date) : "—"}
            </div>
          </div>

          <div>
            <div className="text-xs text-zinc-500">SOFR / IORB</div>
            <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums mt-1">
              {latest ? `${latest.sofr.toFixed(2)}% / ${latest.iorb.toFixed(2)}%` : "—"}
            </div>
          </div>
        </div>

        <div className="mt-4 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          최근 {thresholds.positiveDaysWindow}영업일 중 스프레드가 양(+)인 날은{" "}
          <strong className="text-zinc-900 dark:text-zinc-100">
            {data.positiveDays}일
          </strong>
          입니다 ({thresholds.positiveDaysThreshold}일 이상이면 주의).
          {data.spikeDates.length > 0 ? (
            <>
              {" "}
              월말을 뺀 날 중 +{thresholds.spikeThresholdBp}bp 이상 급등한 날:{" "}
              <strong className="text-rose-600 dark:text-rose-400">
                {data.spikeDates.map(formatDate).join(", ")}
              </strong>
            </>
          ) : (
            <>
              {" "}
              월말을 뺀 날 중 +{thresholds.spikeThresholdBp}bp 이상 급등한 날은
              없습니다.
            </>
          )}
        </div>
      </section>

      {/* 차트 */}
      <section className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 sm:p-6 mb-6">
        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-3">
          스프레드 추이 (bp)
        </h2>
        <SofrIorbChart
          series={data.series}
          spikeThresholdBp={thresholds.spikeThresholdBp}
        />
      </section>

      {/* 보는 법 */}
      <section className="rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 p-5 sm:p-6">
        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-3">
          보는 법
        </h2>
        <div className="space-y-3 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          <p>
            <strong>SOFR</strong>는 은행들이 국채를 담보로 하루짜리 돈을 빌릴 때 내는
            금리입니다. <strong>IORB</strong>는 은행이 연준에 돈을 그냥 맡겨두기만 해도
            받는 이자율이고요.
          </p>
          <p>
            평소라면 시장에서 빌리는 게 연준에 맡기는 것보다 싸야 합니다. 그래서 이
            스프레드는 보통 <strong>음수(0 아래)</strong>에 머뭅니다.
          </p>
          <p>
            <strong className="text-zinc-900 dark:text-zinc-100">
              그런데 이 값이 0 위로 올라온다는 건, 시장에 도는 달러가 빡빡해졌다는
              뜻입니다.
            </strong>{" "}
            연준에 맡기면 편하게 받을 수 있는 이자보다 더 비싼 값을 치르고서라도 돈을
            구해야 하는 상황이라는 거니까요.
          </p>

          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <div className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
              그래서 무엇을 보나요
            </div>
            <ul className="space-y-2 list-disc pl-5">
              <li>
                <strong>양(+)으로 지속 전환</strong> — 하루 튀는 건 흔합니다. 최근{" "}
                {thresholds.positiveDaysWindow}영업일 중{" "}
                {thresholds.positiveDaysThreshold}일 이상 양수로 머무르면 일시적
                현상이 아니라고 보고 <strong>주의</strong>로 표시합니다.
              </li>
              <li>
                <strong>월말·분기말이 아닌 날의 급등</strong> — 월말과 분기말에는
                은행들이 결산 때문에 자금을 당겨쓰느라 스프레드가 튀는 게 정상입니다.
                그래서 각 월의 마지막 {thresholds.monthEndExcludeDays}영업일은 판정에서
                뺍니다. 그런 날이 아닌데도 +{thresholds.spikeThresholdBp}bp 이상
                뛰었다면 <strong>경고</strong>입니다.
              </li>
            </ul>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950 px-3 py-2">
              <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                정상
              </div>
              <div className="text-xs text-emerald-800 dark:text-emerald-200 mt-0.5">
                두 조건 모두 해당 없음
              </div>
            </div>
            <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 px-3 py-2">
              <div className="text-xs font-bold text-amber-700 dark:text-amber-300">
                주의
              </div>
              <div className="text-xs text-amber-800 dark:text-amber-200 mt-0.5">
                양(+) 지속 조건만 충족
              </div>
            </div>
            <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950 px-3 py-2">
              <div className="text-xs font-bold text-rose-700 dark:text-rose-300">
                경고
              </div>
              <div className="text-xs text-rose-800 dark:text-rose-200 mt-0.5">
                월말이 아닌 날에 급등 발생
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
