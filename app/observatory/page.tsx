import type { Metadata } from "next";
import Link from "next/link";
import {
  OBSERVATORY_SECTIONS,
  summarizeSection1,
  type ObservatoryIndicatorKey,
  type ObservatoryStatusMap,
} from "@/lib/observatory-catalog";
import {
  evaluateDiscountWindow,
  evaluateReserves,
  evaluateRrp,
  evaluateSofrIorb,
  evaluateSrf,
  type ObservatoryStatus,
} from "@/lib/observatory-constants";
import { loadSofrIorb } from "@/lib/observatory-sofr-iorb";
import { loadSrf } from "@/lib/observatory-srf";
import { loadDiscountWindow } from "@/lib/observatory-discount-window";
import { loadRrp } from "@/lib/observatory-rrp";
import { loadReserves } from "@/lib/observatory-reserves";
// 카드 표기는 다섯 지표를 나란히 놓고 읽는 화면이라 단위를 십억 달러로
// 통일한다 (상세 페이지 포맷터는 지표별로 단위를 바꿔서 카드에는 안 맞는다).
// 자세한 이유는 card-format.ts 상단 주석 참고.
import { formatCardBillions, formatCardBp, type CardValue } from "./card-format";

export const metadata: Metadata = {
  title: "관측소 | TockTock",
  description:
    "금융 부실 조기경보 관측소. 시스템 전체의 현금 사정을 재는 자금시장 배관 지표들을 한 화면에서 봅니다.",
};

export const dynamic = "force-dynamic";

/** 카드 한 장에 필요한 실측 정보 */
interface IndicatorSnapshot {
  status: ObservatoryStatus | null;
  /** 현재값 표시. 데이터 없으면 null */
  value: CardValue | null;
  /** 기준일 YYYY-MM-DD. 데이터 없으면 null */
  asOf: string | null;
}

const EMPTY: IndicatorSnapshot = { status: null, value: null, asOf: null };

/**
 * 다섯 지표의 현재 상태를 Redis 에서 직접 읽는다.
 *
 * 상세 페이지처럼 자기 API 를 HTTP 로 부르지 않는다. 인덱스는 지표 5개를
 * 한꺼번에 봐야 해서, HTTP 로 가면 한 번 그리는 데 서버리스 호출이 5번 붙고
 * 전체 시계열(SRF 만 7천 건)을 직렬화했다 되파싱하게 된다.
 * 수집·판정 로직은 그대로 두고 호출만 직접 한다.
 */
async function loadSnapshots(): Promise<Record<ObservatoryIndicatorKey, IndicatorSnapshot>> {
  const [sofrIorb, srf, discountWindow, rrp, reserves] = await Promise.all([
    loadSofrIorb().catch(() => []),
    loadSrf().catch(() => []),
    loadDiscountWindow().catch(() => []),
    loadRrp().catch(() => []),
    loadReserves().catch(() => []),
  ]);

  const sofrVerdict = evaluateSofrIorb(sofrIorb);
  const srfVerdict = evaluateSrf(srf);
  const dwVerdict = evaluateDiscountWindow(discountWindow);
  const rrpVerdict = evaluateRrp(rrp);
  const reservesVerdict = evaluateReserves(reserves);

  return {
    "sofr-iorb": sofrVerdict.latest
      ? {
          status: sofrVerdict.status,
          value: formatCardBp(sofrVerdict.latest.spreadBp),
          asOf: sofrVerdict.latest.date,
        }
      : EMPTY,
    srf: srfVerdict.latest
      ? {
          status: srfVerdict.status,
          value: formatCardBillions(srfVerdict.latest.usageBillions),
          asOf: srfVerdict.latest.date,
        }
      : EMPTY,
    "discount-window": dwVerdict.latest
      ? {
          status: dwVerdict.status,
          value: formatCardBillions(dwVerdict.latest.balanceBillions),
          asOf: dwVerdict.latest.date,
        }
      : EMPTY,
    rrp: rrpVerdict.latest
      ? {
          status: rrpVerdict.status,
          value: formatCardBillions(rrpVerdict.latest.balanceBillions),
          asOf: rrpVerdict.latest.date,
        }
      : EMPTY,
    reserves: reservesVerdict.latest
      ? {
          status: reservesVerdict.status,
          value: formatCardBillions(reservesVerdict.latest.balanceBillions),
          asOf: reservesVerdict.latest.date,
        }
      : EMPTY,
  };
}

// 상세 페이지들과 같은 배지 스타일
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

/** 요약 문장 줄의 색 — 가장 나쁜 상태를 따라간다 */
const SUMMARY_CLASS: Record<ObservatoryStatus, string> = {
  normal:
    "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  caution:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  warning:
    "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200",
};

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"];

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}

export default async function ObservatoryIndexPage() {
  const snapshots = await loadSnapshots();

  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          관측소
        </h1>
        <p className="text-sm text-zinc-500 mt-2">
          금융 시스템에 금이 가는지 지켜보는 곳입니다. 출처: FRED (Federal Reserve
          Bank of St. Louis).
        </p>
      </header>

      {OBSERVATORY_SECTIONS.map((section) => {
        const statusMap: ObservatoryStatusMap = Object.fromEntries(
          section.indicators.map((ind) => [ind.key, snapshots[ind.key]?.status ?? null])
        );
        // 요약 문장은 섹션마다 성격이 달라 섹션 id 로 고른다.
        // 관측소 2·4 가 붙으면 여기에 그 섹션의 요약 함수를 더한다.
        const summary =
          section.id === "plumbing" ? summarizeSection1(statusMap) : null;

        return (
          <section key={section.id} className="mb-10">
            {/* 섹션 헤더 */}
            <div className="mb-4">
              <h2 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-zinc-100">
                {section.title}
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1.5 leading-relaxed">
                {section.subtitle}
              </p>
            </div>

            {/* 지표 카드 — 사슬 순서대로 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {section.indicators.map((ind) => {
                const snap = snapshots[ind.key] ?? EMPTY;
                const meta = snap.status ? STATUS_META[snap.status] : null;

                return (
                  <Link
                    key={ind.key}
                    href={ind.href}
                    className="group block rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-5 transition-colors hover:border-zinc-400 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-zinc-400 mb-0.5">
                          {CIRCLED[ind.order - 1] ?? ind.order}
                        </div>
                        <div className="text-base font-bold text-zinc-900 dark:text-zinc-100 group-hover:underline">
                          {ind.name}
                        </div>
                      </div>
                      {meta ? (
                        <div
                          className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${meta.className}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </div>
                      ) : (
                        <div className="shrink-0 rounded-full border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 text-xs font-bold text-zinc-500">
                          수집 대기
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex items-baseline gap-2 flex-wrap">
                      <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                        {snap.value?.main ?? "—"}
                      </div>
                      {snap.value?.note && (
                        <div className="text-xs text-zinc-500">({snap.value.note})</div>
                      )}
                      {snap.asOf && (
                        <div className="text-xs text-zinc-500">
                          {formatDate(snap.asOf)} 기준
                        </div>
                      )}
                    </div>

                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      {ind.oneLiner}
                    </p>

                    {ind.lowerIsWorse && (
                      <p className="mt-1.5 text-[11px] text-zinc-400">
                        이 지표는 값이 낮을수록 위험합니다
                      </p>
                    )}
                  </Link>
                );
              })}
            </div>

            {/* 사슬 설명 + 자동 생성 요약 */}
            <p className="mt-4 text-sm text-zinc-500">{section.chainNote}</p>
            {summary && (
              <div
                className={`mt-2 rounded-lg border px-4 py-3 text-sm font-semibold ${
                  summary.status
                    ? SUMMARY_CLASS[summary.status]
                    : "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
                }`}
              >
                {summary.text}
              </div>
            )}
          </section>
        );
      })}

      <p className="text-xs text-zinc-500">
        이 지표들은 시장 상황을 지켜보기 위한 참고 자료입니다. 투자 권유가 아니며,
        모든 투자 판단은 본인의 책임입니다.
      </p>
    </div>
  );
}
