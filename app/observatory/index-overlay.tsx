"use client";

/**
 * 관측소 차트 공용 — 주가지수 오버레이
 *
 * SRF 사용량 차트와 RRP 잔액 차트가 같은 방식으로 나스닥·S&P 500 을 겹쳐 그린다.
 * 두 차트에서 달라지는 건 왼쪽 축 값의 포맷터 하나뿐이라 나머지를 여기 모았다.
 * (날짜 합집합 · 시리즈별 정규화 · 토글 · 기준일 표기 툴팁/캡션)
 *
 * ⚠ 이 파일은 차트(클라이언트 컴포넌트)에서만 import 한다.
 *   서버 컴포넌트인 page.tsx 에서 부르면 안 된다 — "use client" 파일의 함수를
 *   서버에서 호출하면 클라이언트 참조 프록시가 잡혀 런타임 예외가 난다.
 *   (각 지표 폴더의 format.ts 가 "use client" 를 안 넣는 이유와 같은 함정)
 */

import type { MarketIndexPoint } from "@/lib/observatory-market-index";

/**
 * 지수 색은 페이지가 달라도 같아야 한다.
 * SRF 차트에서 파랑=나스닥으로 익힌 사람이 RRP 차트에서 다른 색을 보면 헷갈린다.
 * 그래서 지표 쪽 선 색을 이 둘과 겹치지 않게 고른다 (RRP 는 청록으로 바꿨다).
 */
export const INDEX_COLORS = {
  nasdaq: "#2563eb",
  sp500: "#7c3aed",
} as const;

/** 차트 한 행 — 지표값(value) + 지수 원값 + 정규화 상대값 */
export interface OverlayRow {
  date: string;
  /** 그 차트의 주인공 값 (SRF 사용량 / RRP 잔액 …) */
  value?: number;
  nasdaq?: number;
  sp500?: number;
  nasdaqRel?: number;
  sp500Rel?: number;
}

/** 정규화 기준 (그 구간에서 처음 값이 있는 날) */
export interface OverlayBaselines {
  nasdaqDate: string | null;
  sp500Date: string | null;
}

export interface OverlayResult {
  rows: OverlayRow[];
  baselines: OverlayBaselines;
}

/** N개월 전 날짜 문자열. months 가 null 이면 자르지 않는다는 뜻 */
export function cutoffFromMonths(months: number | null): string | null {
  if (months === null) return null;
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return cutoff.toISOString().slice(0, 10);
}

/**
 * 지표 시계열과 지수 시계열을 한 표로 합치고, 지수를 구간 시작=100 으로 정규화한다.
 *
 * ⚠ 날짜 합집합으로 만든다. 지표와 지수는 거래일이 완전히 같지 않다
 *   (휴장일 처리가 다르고 최신일도 며칠 어긋난다). 어느 한쪽을 기준으로 잡으면
 *   다른 쪽 끝이 잘린다.
 *
 * ⚠ 다만 **지표가 시작하기 전 구간은 버린다**. 지수는 2000년부터 있는데 RRP 는
 *   2003년부터라, 그냥 합치면 앞쪽 3년이 지수만 있는 빈 구간으로 남고 정규화
 *   기준일도 그쪽으로 밀린다. 비교하려고 겹쳐 그리는 것이니 지표가 있는
 *   구간에서만 맞춘다. (뒤쪽은 자르지 않는다 — 지수가 하루이틀 앞서는 건
 *   최신 흐름이라 보여주는 편이 낫다)
 *
 * ⚠ 정규화 기준은 **시리즈마다 따로** 잡는다. FRED 가 S&P 500 을 최근 10년만
 *   제공해서, 전체 구간을 그리면 나스닥은 2000년부터인데 S&P 는 2016년부터다.
 *   "구간 첫날" 하나로 묶으면 S&P 기준값이 아예 없다.
 */
export function buildOverlayRows(
  points: { date: string; value: number }[],
  indices: MarketIndexPoint[],
  cutoffStr: string | null
): OverlayResult {
  // 지표 시계열의 시작일 (호출부에서 날짜 오름차순으로 넘긴다)
  const indicatorStart = points.length > 0 ? points[0].date : null;

  const inRange = (d: string) => cutoffStr === null || d >= cutoffStr;
  const afterIndicatorStart = (d: string) =>
    indicatorStart === null || d >= indicatorStart;

  const byDate = new Map<string, OverlayRow>();
  for (const p of points) {
    if (!inRange(p.date)) continue;
    byDate.set(p.date, { date: p.date, value: p.value });
  }
  for (const p of indices) {
    if (!inRange(p.date) || !afterIndicatorStart(p.date)) continue;
    const row = byDate.get(p.date) ?? { date: p.date };
    if (p.nasdaq !== undefined) row.nasdaq = p.nasdaq;
    if (p.sp500 !== undefined) row.sp500 = p.sp500;
    byDate.set(p.date, row);
  }

  const rows = Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const firstNasdaq = rows.find((r) => typeof r.nasdaq === "number");
  const firstSp500 = rows.find((r) => typeof r.sp500 === "number");
  const baseNasdaq = firstNasdaq?.nasdaq;
  const baseSp500 = firstSp500?.sp500;

  for (const r of rows) {
    if (typeof r.nasdaq === "number" && baseNasdaq) {
      r.nasdaqRel = (r.nasdaq / baseNasdaq) * 100;
    }
    if (typeof r.sp500 === "number" && baseSp500) {
      r.sp500Rel = (r.sp500 / baseSp500) * 100;
    }
  }

  return {
    rows,
    baselines: {
      nasdaqDate: firstNasdaq?.date ?? null,
      sp500Date: firstSp500?.date ?? null,
    },
  };
}

/** 지수 포인트 표기 (26421.41 → "26,421.41") */
export function formatIndexValue(v: number): string {
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** 지수 오버레이 토글 버튼 2개 (기간 버튼과 같은 알약 스타일) */
export function IndexToggles({
  showNasdaq,
  showSp500,
  onToggleNasdaq,
  onToggleSp500,
}: {
  showNasdaq: boolean;
  showSp500: boolean;
  onToggleNasdaq: () => void;
  onToggleSp500: () => void;
}) {
  const items = [
    {
      on: showNasdaq,
      toggle: onToggleNasdaq,
      color: INDEX_COLORS.nasdaq,
      label: "나스닥 종합",
    },
    {
      on: showSp500,
      toggle: onToggleSp500,
      color: INDEX_COLORS.sp500,
      label: "S&P 500",
    },
  ];

  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {items.map(({ on, toggle, color, label }) => (
        <button
          key={label}
          type="button"
          onClick={toggle}
          aria-pressed={on}
          className={`inline-flex items-center gap-1.5 px-3 py-1 text-sm rounded-md border transition-colors ${
            on
              ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border-zinc-400 dark:border-zinc-500"
              : "bg-zinc-50 dark:bg-zinc-950 text-zinc-400 dark:text-zinc-600 border-zinc-200 dark:border-zinc-800"
          }`}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: on ? color : "#d4d4d8" }}
          />
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * 툴팁 안의 지수 두 줄.
 *
 * 원값과 정규화 상대값을 함께 보여주고, 기준일을 같이 적는다.
 * 전체 뷰에서는 두 지수의 기준일이 다르므로 툴팁만 봐도 그게 드러나야 한다.
 */
export function IndexTooltipRows({
  row,
  baselines,
}: {
  row: OverlayRow;
  baselines: OverlayBaselines;
}) {
  return (
    <>
      {typeof row.nasdaq === "number" && (
        <div style={{ color: INDEX_COLORS.nasdaq, marginTop: 2 }}>
          나스닥: {formatIndexValue(row.nasdaq)}
          {typeof row.nasdaqRel === "number" && baselines.nasdaqDate && (
            <>
              {" "}
              ({baselines.nasdaqDate}=100 기준 {row.nasdaqRel.toFixed(1)})
            </>
          )}
        </div>
      )}
      {typeof row.sp500 === "number" && (
        <div style={{ color: INDEX_COLORS.sp500, marginTop: 2 }}>
          S&P 500: {formatIndexValue(row.sp500)}
          {typeof row.sp500Rel === "number" && baselines.sp500Date && (
            <>
              {" "}
              ({baselines.sp500Date}=100 기준 {row.sp500Rel.toFixed(1)})
            </>
          )}
        </div>
      )}
    </>
  );
}

/** 차트 아래 축 설명 + 이 구간의 정규화 기준일 */
export function OverlayCaption({
  leftAxisLabel,
  baselines,
  hasIndices,
  extra,
}: {
  /** 예: "SRF 사용량(십억 달러)" */
  leftAxisLabel: string;
  baselines: OverlayBaselines;
  hasIndices: boolean;
  /** 차트별로 덧붙일 문구 (없으면 생략) */
  extra?: string;
}) {
  return (
    <>
      <p className="mt-2 text-[11px] text-zinc-500">
        왼쪽 축: {leftAxisLabel}
        {hasIndices && (
          <>
            {" "}
            · 오른쪽 축: 주가지수, 각 지수가 이 구간에서 처음 값을 갖는 날 = 100
            으로 맞춘 상대값
          </>
        )}
        {extra ? ` · ${extra}` : ""}
      </p>
      {hasIndices && baselines.nasdaqDate && baselines.sp500Date && (
        <p className="mt-1 text-[11px] text-zinc-500">
          이 구간 기준일 — 나스닥 {baselines.nasdaqDate} · S&amp;P 500{" "}
          {baselines.sp500Date}
          {baselines.nasdaqDate !== baselines.sp500Date && (
            <> (FRED가 S&amp;P 500을 최근 10년만 제공해 두 기준일이 다릅니다)</>
          )}
        </p>
      )}
    </>
  );
}
