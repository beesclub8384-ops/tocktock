import type { Metadata } from "next";
import { headers } from "next/headers";
import InflationChart from "./InflationChart";
import { VixCard } from "@/components/vix-card";
import type { InflationData } from "@/app/api/inflation/data/route";

export const metadata: Metadata = {
  title: "미국 인플레이션 | TockTock",
  description: "Headline CPI, Core CPI, Core PCE 전년 대비 추이",
};

export const dynamic = "force-dynamic";

async function getData(): Promise<InflationData | null> {
  // 절대 URL 구성 (서버 컴포넌트에서 자체 API 호출 시)
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const url = `${proto}://${host}/api/inflation/data`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as InflationData;
  } catch {
    return null;
  }
}

function formatKstDate(iso: string): string {
  try {
    const d = new Date(iso);
    const kst = new Date(d.getTime() + 9 * 3600 * 1000);
    const y = kst.getUTCFullYear();
    const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
    const day = String(kst.getUTCDate()).padStart(2, "0");
    const hh = String(kst.getUTCHours()).padStart(2, "0");
    const mm = String(kst.getUTCMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${hh}:${mm} KST`;
  } catch {
    return iso;
  }
}

function formatReleaseMonth(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월`;
}

interface CardProps {
  title: string;
  subtitle: string;
  value: number | null;
  date: string | null;
  prevValue: number | null;
  emphasized?: boolean;
}

function LatestCard({ title, subtitle, value, date, prevValue, emphasized }: CardProps) {
  const diff =
    value !== null && prevValue !== null
      ? Math.round((value - prevValue) * 10) / 10
      : null;
  const diffLabel =
    diff === null
      ? "전월 데이터 없음"
      : diff > 0
        ? `▲ ${diff.toFixed(1)}%p`
        : diff < 0
          ? `▼ ${Math.abs(diff).toFixed(1)}%p`
          : "변동 없음";
  const diffColor =
    diff === null
      ? "text-zinc-400"
      : diff > 0
        ? "text-rose-600"
        : diff < 0
          ? "text-blue-600"
          : "text-zinc-500";

  return (
    <div
      className={`rounded-xl p-4 sm:p-5 bg-white dark:bg-zinc-900 border ${
        emphasized
          ? "border-blue-300 dark:border-blue-600 shadow-[0_0_0_1px_rgba(37,99,235,0.2)]"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {title}
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5 leading-snug">
            {subtitle}
          </div>
        </div>
        {emphasized && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 whitespace-nowrap">
            Fed 선호
          </span>
        )}
      </div>
      <div className="mt-3 text-3xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
        {value === null ? "—" : `${value.toFixed(1)}%`}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-zinc-500">
          {date ? formatReleaseMonth(date) : "발표 미정"}
        </span>
        <span className={diffColor}>{diffLabel}</span>
      </div>
    </div>
  );
}

export default async function InflationPage() {
  const data = await getData();

  if (!data) {
    return (
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold mb-4">미국 인플레이션 한눈에 보기</h1>
        <div className="rounded-lg border border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950 p-4 text-sm text-rose-800 dark:text-rose-200">
          데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      {/* 헤더 */}
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          미국 인플레이션 한눈에 보기
        </h1>
        <p className="text-sm text-zinc-500 mt-2">
          Headline CPI · Core CPI · Core PCE 의 전년 동월 대비 변화율(YoY)
          추이입니다. 출처: FRED (Federal Reserve Bank of St. Louis).
        </p>
        <p className="text-xs text-zinc-400 mt-1">
          마지막 업데이트: {formatKstDate(data.lastUpdated)}
        </p>
      </header>

      {/* 물가 지표 */}
      <section className="mb-6">
        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-3">
          물가 지표 (Inflation Indicators)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <LatestCard
            title="Headline CPI"
            subtitle="전체 소비자물가 (식료품·에너지 포함)"
            value={data.latest.headline.value}
            date={data.latest.headline.date}
            prevValue={data.latest.headline.prevValue}
          />
          <LatestCard
            title="Core CPI"
            subtitle="소비자물가 (식료품·에너지 제외)"
            value={data.latest.core.value}
            date={data.latest.core.date}
            prevValue={data.latest.core.prevValue}
          />
          <LatestCard
            title="Core PCE"
            subtitle="개인소비지출물가 (식료품·에너지 제외)"
            value={data.latest.corePce.value}
            date={data.latest.corePce.date}
            prevValue={data.latest.corePce.prevValue}
            emphasized
          />
        </div>

        {/* YoY 추이 차트 */}
        <div className="mt-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-5">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
            전년 동월 대비(YoY) 추이
          </h3>
          <p className="text-xs text-zinc-500 mb-4">
            Fed 목표 2% 가로 점선 기준. 기간 버튼으로 확대/축소.
          </p>
          <InflationChart series={data.series} />
        </div>
      </section>

      {/* 그룹 디바이더 */}
      <div
        className="border-t border-zinc-200 dark:border-zinc-800 my-8"
        aria-hidden="true"
      />

      {/* 시장 변동성 */}
      <section className="mb-6">
        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-3">
          시장 변동성 (Market Volatility)
        </h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,320px))] gap-3 sm:gap-4">
          <VixCard />
        </div>
      </section>
    </div>
  );
}
