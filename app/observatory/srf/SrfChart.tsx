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
import {
  buildOverlayRows,
  cutoffFromMonths,
  IndexToggles,
  IndexTooltipRows,
  INDEX_COLORS,
  OverlayCaption,
  type OverlayBaselines,
  type OverlayRow,
} from "../index-overlay";

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
// 지수 색은 페이지 간 통일을 위해 index-overlay 의 INDEX_COLORS 를 쓴다
const COLORS = {
  bar: "#dc2626",
  axis: "#9ca3af",
  tick: "#6b7280",
} as const;

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

interface TooltipPayloadEntry {
  value?: number | string;
  dataKey?: string;
  payload?: OverlayRow;
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
  baselines: OverlayBaselines;
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
        사용량: {typeof row.value === "number" ? formatUsage(row.value) : "-"}
      </div>
      <IndexTooltipRows row={row} baselines={baselines} />
    </div>
  );
}

export default function SrfChart({ series, indices = [] }: Props) {
  const [range, setRange] = useState<Range>("전체");
  const [showNasdaq, setShowNasdaq] = useState(true);
  const [showSp500, setShowSp500] = useState(true);

  const hasIndices = indices.length > 0;

  const { rows, baselines } = useMemo(
    () =>
      buildOverlayRows(
        series.map((p) => ({ date: p.date, value: p.usageBillions })),
        indices,
        cutoffFromMonths(RANGE_MONTHS[range])
      ),
    [range, series, indices]
  );

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
        <IndexToggles
          showNasdaq={showNasdaq}
          showSp500={showSp500}
          onToggleNasdaq={() => setShowNasdaq((v) => !v)}
          onToggleSp500={() => setShowSp500((v) => !v)}
        />
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
            dataKey="value"
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
              stroke={INDEX_COLORS.nasdaq}
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
              stroke={INDEX_COLORS.sp500}
              strokeWidth={1.6}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      <OverlayCaption
        leftAxisLabel="SRF 사용량(십억 달러)"
        baselines={baselines}
        hasIndices={hasIndices}
      />
    </div>
  );
}
