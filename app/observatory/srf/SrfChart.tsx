"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { SrfPoint } from "@/lib/observatory-constants";
import type { MarketIndexPoint } from "@/lib/observatory-market-index";
import { formatUsage } from "./format";

interface Props {
  series: SrfPoint[];
  /**
   * 오버레이용 주가지수 (참고 데이터). 아직 수집 전이면 빈 배열이 온다 —
   * 그때는 지수 토글과 우축을 아예 그리지 않는다.
   */
  indices?: MarketIndexPoint[];
}

type Range = "3M" | "1Y" | "전체";

const RANGE_MONTHS: Record<Range, number | null> = {
  "3M": 3,
  "1Y": 12,
  전체: null,
};

// CSS 변수 대신 hex 하드코딩 (recharts 는 CSS 변수를 해석하지 못한다)
const COLORS = {
  bar: "#dc2626",
  nasdaq: "#2563eb",
  sp500: "#7c3aed",
  axis: "#9ca3af",
  tick: "#6b7280",
} as const;

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

/** 지수 포인트 표기 (26421.41 → "26,421.41") */
function formatIndex(v: number): string {
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** 차트 한 행 — SRF 막대 + 지수 원값 + 정규화 상대값 */
interface ChartRow {
  date: string;
  usageBillions?: number;
  nasdaq?: number;
  sp500?: number;
  nasdaqRel?: number;
  sp500Rel?: number;
}

/** 정규화 기준 (그 구간에서 처음 값이 있는 날) */
interface Baselines {
  nasdaqDate: string | null;
  sp500Date: string | null;
}

interface TooltipPayloadEntry {
  value?: number | string;
  dataKey?: string;
  payload?: ChartRow;
}

function ChartTooltip({
  active,
  payload,
  label,
  baselines,
}: {
  active?: boolean;
  label?: string;
  payload?: TooltipPayloadEntry[];
  baselines: Baselines;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.97)",
        border: "1px solid #e5e7eb",
        borderRadius: 6,
        padding: "8px 10px",
        fontSize: 12,
        boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4, color: "#111827" }}>
        {label ? formatDate(label) : ""}
      </div>
      <div style={{ color: COLORS.bar }}>
        사용량:{" "}
        {typeof row.usageBillions === "number" ? formatUsage(row.usageBillions) : "-"}
      </div>
      {/* 지수는 원값과 정규화 상대값을 함께 보여준다. 전체 뷰에서는 두 지수의
          기준일이 다르므로(S&P 는 FRED 가 최근 10년만 준다) 기준일을 같이 적는다 */}
      {typeof row.nasdaq === "number" && (
        <div style={{ color: COLORS.nasdaq, marginTop: 2 }}>
          나스닥: {formatIndex(row.nasdaq)}
          {typeof row.nasdaqRel === "number" && baselines.nasdaqDate && (
            <> ({baselines.nasdaqDate}=100 기준 {row.nasdaqRel.toFixed(1)})</>
          )}
        </div>
      )}
      {typeof row.sp500 === "number" && (
        <div style={{ color: COLORS.sp500, marginTop: 2 }}>
          S&P 500: {formatIndex(row.sp500)}
          {typeof row.sp500Rel === "number" && baselines.sp500Date && (
            <> ({baselines.sp500Date}=100 기준 {row.sp500Rel.toFixed(1)})</>
          )}
        </div>
      )}
    </div>
  );
}

export default function SrfChart({ series, indices = [] }: Props) {
  const [range, setRange] = useState<Range>("전체");
  const [showNasdaq, setShowNasdaq] = useState(true);
  const [showSp500, setShowSp500] = useState(true);

  const hasIndices = indices.length > 0;

  const { rows, baselines } = useMemo(() => {
    const months = RANGE_MONTHS[range];
    let cutoffStr: string | null = null;
    if (months !== null) {
      const cutoff = new Date();
      cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
      cutoffStr = cutoff.toISOString().slice(0, 10);
    }
    const inRange = (d: string) => cutoffStr === null || d >= cutoffStr;

    // SRF 와 지수는 거래일이 완전히 같지는 않다 (SRF 는 주중 전 영업일 행이 있고,
    // 지수는 휴장일이 빠진다. 최신일도 며칠 어긋난다).
    // 어느 한쪽을 기준으로 잡으면 다른 쪽 끝이 잘리므로 날짜 합집합으로 만든다.
    const byDate = new Map<string, ChartRow>();
    for (const p of series) {
      if (!inRange(p.date)) continue;
      byDate.set(p.date, { date: p.date, usageBillions: p.usageBillions });
    }
    for (const p of indices) {
      if (!inRange(p.date)) continue;
      const row = byDate.get(p.date) ?? { date: p.date };
      if (p.nasdaq !== undefined) row.nasdaq = p.nasdaq;
      if (p.sp500 !== undefined) row.sp500 = p.sp500;
      byDate.set(p.date, row);
    }

    const sorted = Array.from(byDate.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    // 정규화 기준은 시리즈마다 따로 잡는다.
    // 전체 뷰에서 나스닥은 2000년부터, S&P 는 FRED 제약으로 2016년부터라
    // "구간 첫날" 하나로 묶으면 S&P 기준값이 아예 없다.
    const firstNasdaq = sorted.find((r) => typeof r.nasdaq === "number");
    const firstSp500 = sorted.find((r) => typeof r.sp500 === "number");
    const baseNasdaq = firstNasdaq?.nasdaq;
    const baseSp500 = firstSp500?.sp500;

    for (const r of sorted) {
      if (typeof r.nasdaq === "number" && baseNasdaq) {
        r.nasdaqRel = (r.nasdaq / baseNasdaq) * 100;
      }
      if (typeof r.sp500 === "number" && baseSp500) {
        r.sp500Rel = (r.sp500 / baseSp500) * 100;
      }
    }

    return {
      rows: sorted,
      baselines: {
        nasdaqDate: firstNasdaq?.date ?? null,
        sp500Date: firstSp500?.date ?? null,
      } as Baselines,
    };
  }, [range, series, indices]);

  const dateTickFormatter = (val: string) => {
    const d = new Date(`${val}T00:00:00Z`);
    // 전체 구간은 연도만, 짧은 구간은 연.월
    return range === "전체"
      ? String(d.getUTCFullYear())
      : `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };

  const anyIndexShown = hasIndices && (showNasdaq || showSp500);

  return (
    <div className="w-full">
      {/* 기간 선택 버튼 */}
      <div className="flex flex-wrap gap-2 mb-3">
        {(Object.keys(RANGE_MONTHS) as Range[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={`px-3 py-1 text-sm rounded-md border transition-colors ${
              range === r
                ? "bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100"
                : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* 지수 오버레이 토글 — SRF 막대만 보고 싶을 때 끌 수 있다 */}
      {hasIndices && (
        <div className="flex flex-wrap gap-2 mb-3">
          {(
            [
              { on: showNasdaq, set: setShowNasdaq, color: COLORS.nasdaq, label: "나스닥 종합" },
              { on: showSp500, set: setShowSp500, color: COLORS.sp500, label: "S&P 500" },
            ] as const
          ).map(({ on, set, color, label }) => (
            <button
              key={label}
              type="button"
              onClick={() => set((v) => !v)}
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
      )}

      {/* 대부분 0이고 사건 때만 솟는 데이터라 SRF 는 막대로 그린다.
          지수는 우축(정규화)에 선으로 얹는다 */}
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={rows} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="date"
            tickFormatter={dateTickFormatter}
            minTickGap={50}
            tick={{ fontSize: 11, fill: COLORS.tick }}
            stroke={COLORS.axis}
          />
          <YAxis
            yAxisId="left"
            tickFormatter={(v: number) => (v === 0 ? "0" : `${v}`)}
            tick={{ fontSize: 11, fill: COLORS.tick }}
            stroke={COLORS.axis}
            width={44}
          />
          {/* 우축은 정규화 상대값 전용. 지수를 다 끄면 축도 같이 감춘다 */}
          {anyIndexShown && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={(v: number) => `${Math.round(v)}`}
              tick={{ fontSize: 11, fill: COLORS.tick }}
              stroke={COLORS.axis}
              width={48}
              domain={["auto", "auto"]}
            />
          )}
          <Tooltip
            content={<ChartTooltip baselines={baselines} />}
            cursor={{ fill: "rgba(120,120,120,0.12)" }}
          />
          <Bar
            yAxisId="left"
            dataKey="usageBillions"
            name="SRF 사용량"
            fill={COLORS.bar}
            isAnimationActive={false}
          />
          {anyIndexShown && showNasdaq && (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="nasdaqRel"
              name="나스닥 종합"
              stroke={COLORS.nasdaq}
              strokeWidth={1.6}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}
          {anyIndexShown && showSp500 && (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="sp500Rel"
              name="S&P 500"
              stroke={COLORS.sp500}
              strokeWidth={1.6}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      <p className="mt-2 text-[11px] text-zinc-500">
        왼쪽 축: SRF 사용량(십억 달러) · 오른쪽 축: 주가지수, 각 지수가 이 구간에서
        처음 값을 갖는 날 = 100 으로 맞춘 상대값
      </p>
      {hasIndices && baselines.nasdaqDate && baselines.sp500Date && (
        <p className="mt-1 text-[11px] text-zinc-500">
          이 구간 기준일 — 나스닥 {baselines.nasdaqDate} · S&amp;P 500{" "}
          {baselines.sp500Date}
          {baselines.nasdaqDate !== baselines.sp500Date && (
            <>
              {" "}
              (FRED가 S&amp;P 500을 최근 10년만 제공해 두 기준일이 다릅니다)
            </>
          )}
        </p>
      )}
    </div>
  );
}
