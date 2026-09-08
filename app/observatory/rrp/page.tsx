import type { Metadata } from "next";
import { headers } from "next/headers";
import RrpChart from "./RrpChart";
import { formatRrp, formatTrillion } from "./format";
import type { RrpResponse } from "@/app/api/observatory/rrp/route";
import type { ObservatoryStatus } from "@/lib/observatory-constants";

export const metadata: Metadata = {
  title: "관측소 · 역레포(RRP) 잔액 | TockTock",
  description:
    "시스템의 여유 현금 쿠션. MMF들이 굴릴 데 없는 돈을 연준에 하룻밤 맡겨두는 곳 — 잔액이 마르면 다음은 은행 지급준비금 본체가 마릅니다.",
};

export const dynamic = "force-dynamic";

async function getData(): Promise<RrpResponse | null> {
  // 절대 URL 구성 (서버 컴포넌트에서 자체 API 호출 시)
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  try {
    const res = await fetch(`${proto}://${host}/api/observatory/rrp`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as RrpResponse;
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

export default async function RrpPage() {
  const data = await getData();

  if (!data || data.series.length === 0) {
    return (
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold mb-4">관측소 · 역레포(RRP) 잔액</h1>
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
          역레포(RRP) 잔액
        </h1>
        <p className="text-sm text-zinc-500 mt-2">
          시스템의 여유 현금 쿠션. MMF들이 굴릴 데 없는 돈을 연준에 하룻밤 맡겨두는
          곳 — 잔액이 마르면 다음은 은행 지급준비금 본체가 마릅니다.
        </p>
        <p className="text-xs text-zinc-400 mt-1">
          출처: FRED (Federal Reserve Bank of St. Louis), 시리즈 {data.seriesId} ·
          일간(영업일)
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
              {latest ? formatRrp(latest.balanceBillions) : "—"}
            </div>
          </div>

          <div>
            <div className="text-xs text-zinc-500">기준일</div>
            <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
              {latest ? formatDate(latest.date) : "—"}
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">
              {data.daysSinceLatest !== null ? `${data.daysSinceLatest}일 전 값` : "—"}
            </div>
          </div>

          <div>
            <div className="text-xs text-zinc-500">직전 영업일</div>
            <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums mt-1">
              {data.previous ? formatRrp(data.previous.balanceBillions) : "—"}
            </div>
          </div>

          <div>
            <div className="text-xs text-zinc-500">2022년 정점 대비</div>
            <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums mt-1">
              {data.pctOfPeak !== null ? `${data.pctOfPeak.toFixed(2)}%` : "—"}
            </div>
          </div>
        </div>

        <div className="mt-4 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          {latest ? (
            <>
              2022년 말 정점은 {formatTrillion(thresholds.peakBillions)}(
              {formatDate(thresholds.peakDate)})였습니다. 지금은 그 돈이 거의 다
              빠져나간 상태입니다. {thresholds.normalBillions}십억 달러를 넘으면
              정상, {thresholds.alertBillions}십억 달러 밑이면 경보로 봅니다.
            </>
          ) : (
            "—"
          )}
        </div>
      </section>

      {/* 방향 안내 — 다른 관측소 지표와 반대라 먼저 짚어둔다 */}
      <section className="rounded-2xl border border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950 p-4 sm:p-5 mb-6">
        <div className="text-sm text-sky-900 dark:text-sky-200 leading-relaxed">
          <strong>이 지표는 방향이 반대입니다.</strong> 관측소의 다른 지표들은 값이
          클수록 위험하지만, RRP는 여유 현금 쿠션이라{" "}
          <strong>낮을수록 위험</strong>합니다. 숫자가 작다고 안심하시면 안 됩니다.
        </div>
      </section>

      {/* 차트 */}
      <section className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 sm:p-6 mb-6">
        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-3">
          잔액 추이 (십억 달러)
        </h2>
        <RrpChart
          series={data.series}
          peakBillions={thresholds.peakBillions}
          peakDate={thresholds.peakDate}
          normalBillions={thresholds.normalBillions}
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
            <strong>역레포(RRP)</strong>는 연준이 돈을 하룻밤 맡아주는 창구입니다.
            주로 <strong>MMF(머니마켓펀드)</strong>가 씁니다. 굴릴 데가 마땅치 않은
            돈을 연준에 넣어두고 이자를 받는 거죠.
          </p>
          <p>
            그래서 이 잔액은{" "}
            <strong className="text-zinc-900 dark:text-zinc-100">
              시스템에 남아도는 현금의 크기
            </strong>
            로 읽습니다. 여기 돈이 쌓여 있다는 건 갈 곳 없는 돈이 그만큼 있다는
            뜻이니까요.
          </p>
          <p>
            반대로 이 잔액이 줄어든다는 건 그 돈이 국채나 은행 예금 같은 다른 데로
            빠져나가고 있다는 뜻입니다. 여기까진 정상입니다. 문제는{" "}
            <strong className="text-zinc-900 dark:text-zinc-100">
              쿠션이 다 마른 뒤입니다. 그다음에 빠지는 건 은행 지급준비금 본체거든요.
            </strong>{" "}
            그래서 이 지표는 <strong>지급준비금 총량</strong> 지표와 같이 봐야
            합니다.
          </p>

          <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950 p-4">
            <div className="font-semibold text-rose-800 dark:text-rose-200 mb-2">
              지금 빨간불인 건 버그가 아닙니다
            </div>
            <p className="text-rose-900 dark:text-rose-200">
              2026년 현재 이 지표는 <strong>쿠션 소진 상태가 지속 중</strong>입니다.
              2022년 말 {formatTrillion(thresholds.peakBillions)}까지 쌓였던 잔액이
              2023~2024년에 걸쳐 거의 다 빠졌고, 그 뒤로 0 부근에 붙어 있습니다.
            </p>
            <p className="mt-2 text-rose-900 dark:text-rose-200">
              그래서 페이지를 여는 순간부터 경보가 떠 있는 게 정상입니다. 데이터가
              잘못 들어온 게 아니라, 실제로 쿠션이 없는 상태가 이어지고 있다는
              뜻입니다. 여기서 중요한 건 &ldquo;경보가 떴나&rdquo;가 아니라{" "}
              <strong>&ldquo;쿠션이 없는 채로 지급준비금이 어떻게 되고
              있나&rdquo;</strong>입니다.
            </p>
          </div>

          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <div className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
              차트가 두 개인 이유
            </div>
            <p>
              위 차트는 세로축을 2022년 정점(
              {formatTrillion(thresholds.peakBillions)})까지 열어둡니다. 얼마나
              쌓였다가 얼마나 빠졌는지가 이 지표의 이야기 전부라서요. 대신 지금
              잔액은 한 자릿수라 바닥에 붙어 보입니다.
            </p>
            <p className="mt-2">
              그래서 아래에 <strong>확대 차트</strong>를 따로 뒀습니다. 판정선(정상
              하한 {thresholds.normalBillions} / 경보 {thresholds.alertBillions})도
              그쪽 축에서만 읽힙니다.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950 px-3 py-2">
              <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                정상
              </div>
              <div className="text-xs text-emerald-800 dark:text-emerald-200 mt-0.5">
                잔액 {thresholds.normalBillions}십억 달러 초과
              </div>
            </div>
            <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 px-3 py-2">
              <div className="text-xs font-bold text-amber-700 dark:text-amber-300">
                주의
              </div>
              <div className="text-xs text-amber-800 dark:text-amber-200 mt-0.5">
                {thresholds.alertBillions}~{thresholds.normalBillions}십억 달러
              </div>
            </div>
            <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950 px-3 py-2">
              <div className="text-xs font-bold text-rose-700 dark:text-rose-300">
                경보
              </div>
              <div className="text-xs text-rose-800 dark:text-rose-200 mt-0.5">
                잔액 {thresholds.alertBillions}십억 달러 미만 (쿠션 사실상 소진)
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
