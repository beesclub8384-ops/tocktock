import type { Metadata } from "next";
import { headers } from "next/headers";
import SrfChart, { formatUsage } from "./SrfChart";
import type { SrfResponse } from "@/app/api/observatory/srf/route";
import type { ObservatoryStatus } from "@/lib/observatory-constants";

export const metadata: Metadata = {
  title: "관측소 · SRF 사용량 | TockTock",
  description:
    "연준의 응급 창구가 실제로 쓰이고 있는지 매일 지켜봅니다. 평소엔 0이고, 0에서 벗어나면 돈을 못 구하는 기관이 생겼다는 신호입니다.",
};

export const dynamic = "force-dynamic";

async function getData(): Promise<SrfResponse | null> {
  // 절대 URL 구성 (서버 컴포넌트에서 자체 API 호출 시)
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  try {
    const res = await fetch(`${proto}://${host}/api/observatory/srf`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as SrfResponse;
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

export default async function SrfPage() {
  const data = await getData();

  if (!data || data.series.length === 0) {
    return (
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold mb-4">관측소 · SRF 사용량</h1>
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
          SRF 사용량
        </h1>
        <p className="text-sm text-zinc-500 mt-2">
          연준이 열어둔 응급 창구가 하루에 얼마나 쓰였는지 봅니다. 출처: FRED
          (Federal Reserve Bank of St. Louis), 시리즈 {data.seriesId}.
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
            <div className="text-xs text-zinc-500">최신 사용량</div>
            <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
              {latest ? formatUsage(latest.usageBillions) : "—"}
            </div>
          </div>

          <div>
            <div className="text-xs text-zinc-500">기준일</div>
            <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              {latest ? formatDate(latest.date) : "—"}
            </div>
          </div>

          <div>
            <div className="text-xs text-zinc-500">
              최근 {thresholds.lookbackDays}영업일 최대
            </div>
            <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums mt-1">
              {formatUsage(data.maxUsage)}
            </div>
          </div>
        </div>

        <div className="mt-4 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          최근 {thresholds.lookbackDays}영업일 중 창구가 쓰인 날은{" "}
          <strong className="text-zinc-900 dark:text-zinc-100">
            {data.usedDays}일
          </strong>
          입니다 ({thresholds.warnDays}일 이상이면 주의,{" "}
          {thresholds.alertDays}일 이상이면 경고).
        </div>
      </section>

      {/* 차트 */}
      <section className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 sm:p-6 mb-6">
        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-3">
          하루 사용량 추이
        </h2>
        <SrfChart series={data.series} />
      </section>

      {/* 보는 법 */}
      <section className="rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 p-5 sm:p-6">
        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-3">
          보는 법
        </h2>
        <div className="space-y-3 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
          <p>
            <strong>SRF(상설 레포 창구)</strong>는 연준이 만들어 둔 응급 창구입니다.
            은행이 시장에서 하루짜리 돈을 못 구할 때, 국채를 맡기고 연준에서 바로
            빌려 갈 수 있게 열어둔 통로입니다.
          </p>
          <p>
            <strong className="text-zinc-900 dark:text-zinc-100">
              평소엔 아무도 쓰지 않아서 0입니다.
            </strong>{" "}
            시장에서 빌리는 게 더 싸기 때문입니다. 굳이 연준 창구까지 갈 이유가
            없습니다.
          </p>
          <p>
            그래서 이 값이{" "}
            <strong className="text-zinc-900 dark:text-zinc-100">
              0에서 벗어나 며칠씩 이어지면
            </strong>
            , 시장에서 돈을 못 구하는 기관이 나타났다는 신호로 읽습니다. 한 번
            튀는 것보다, 계속 쓰이기 시작하는 흐름이 중요합니다.
          </p>

          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <div className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
              2021년 이전 구간은 무엇인가요
            </div>
            <p>
              SRF는 2021년 7월에 생겼습니다. 그 이전 막대는 연준이 그때그때
              집어넣은 <strong>임시 레포 투입</strong> 기록입니다. 같은 창구는
              아니지만 &ldquo;연준이 급전을 대준 규모&rdquo;라는 점에서 이어서
              볼 수 있습니다.
            </p>
            <p className="mt-2">
              그래서 <strong>2019년 9월 레포 발작</strong> 때의 긴급 투입이 이
              차트에 그대로 보입니다. 당시 하루짜리 금리가 갑자기 튀자 연준이
              몇 년 만에 처음으로 돈을 직접 밀어 넣었던 사건입니다. 2020년 3월
              코로나 국면의 투입도 함께 보입니다. 지금 수치가 역사적으로 어느
              수준인지 견주는 눈금으로 쓰시면 됩니다.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950 px-3 py-2">
              <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                정상
              </div>
              <div className="text-xs text-emerald-800 dark:text-emerald-200 mt-0.5">
                최근 {thresholds.lookbackDays}영업일 내내 0
              </div>
            </div>
            <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 px-3 py-2">
              <div className="text-xs font-bold text-amber-700 dark:text-amber-300">
                주의
              </div>
              <div className="text-xs text-amber-800 dark:text-amber-200 mt-0.5">
                쓰인 날 {thresholds.warnDays}일 이상
              </div>
            </div>
            <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950 px-3 py-2">
              <div className="text-xs font-bold text-rose-700 dark:text-rose-300">
                경고
              </div>
              <div className="text-xs text-rose-800 dark:text-rose-200 mt-0.5">
                쓰인 날 {thresholds.alertDays}일 이상
              </div>
            </div>
          </div>

          <p className="text-xs text-zinc-500 pt-1">
            연준은 최근 이 창구의 이름을 SRP(상설 레포 운영)로 바꿔 부르고
            있습니다. 이 페이지에서는 익숙한 이름인 SRF로 씁니다.
          </p>
          <p className="text-xs text-zinc-500">
            이 지표는 시장 상황을 지켜보기 위한 참고 자료입니다. 투자 권유가
            아니며, 모든 투자 판단은 본인의 책임입니다.
          </p>
        </div>
      </section>
    </div>
  );
}
