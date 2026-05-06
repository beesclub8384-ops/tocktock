"use client";

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface SeriesPoint {
  date: string;
  headline: number | null;
  core: number | null;
  corePce: number | null;
}

interface Props {
  series: SeriesPoint[];
}

type Range = "5Y" | "10Y" | "20Y" | "Max";

const RANGE_YEARS: Record<Range, number | null> = {
  "5Y": 5,
  "10Y": 10,
  "20Y": 20,
  Max: null,
};

const COLORS = {
  headline: "#9ca3af",
  core: "#dc2626",
  corePce: "#2563eb",
} as const;

function formatYearMonth(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월`;
}

interface TooltipPayloadEntry {
  name?: string;
  value?: number | string;
  dataKey?: string;
  color?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  label?: string;
  payload?: TooltipPayloadEntry[];
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
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
        {label ? formatYearMonth(label) : ""}
      </div>
      {payload.map((p) => {
        const v = typeof p.value === "number" ? p.value : Number(p.value);
        return (
          <div key={p.dataKey} style={{ color: p.color, marginTop: 2 }}>
            {p.name}: {Number.isFinite(v) ? `${v.toFixed(1)}%` : "-"}
          </div>
        );
      })}
    </div>
  );
}

export default function InflationChart({ series }: Props) {
  const [range, setRange] = useState<Range>("Max");
  const [isMobile, setIsMobile] = useState(false);

  // 모바일 감지 (recharts 차트 height 변경)
  if (typeof window !== "undefined") {
    const mq = window.matchMedia("(max-width: 640px)");
    if (mq.matches !== isMobile) {
      // setState in render 회피 — 다음 렌더에 반영
      setTimeout(() => setIsMobile(mq.matches), 0);
    }
  }

  const filtered = useMemo(() => {
    const years = RANGE_YEARS[range];
    if (years === null) return series;
    const cutoff = new Date();
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
    return series.filter((p) => new Date(p.date) >= cutoff);
  }, [range, series]);

  const yearTickFormatter = (val: string) => {
    const d = new Date(val);
    return String(d.getUTCFullYear());
  };

  const yTickFormatter = (val: number) => `${val.toFixed(1)}%`;

  return (
    <div className="w-full">
      {/* 기간 선택 버튼 */}
      <div className="flex flex-wrap gap-2 mb-3">
        {(Object.keys(RANGE_YEARS) as Range[]).map((r) => (
          <button
            key={r}
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

      <ResponsiveContainer width="100%" height={isMobile ? 300 : 400}>
        <LineChart data={filtered} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="date"
            tickFormatter={yearTickFormatter}
            minTickGap={40}
            tick={{ fontSize: 11, fill: "#6b7280" }}
            stroke="#9ca3af"
          />
          <YAxis
            tickFormatter={yTickFormatter}
            tick={{ fontSize: 11, fill: "#6b7280" }}
            stroke="#9ca3af"
            width={55}
          />
          <Tooltip content={<ChartTooltip />} />
          <Legend
            verticalAlign="top"
            height={28}
            wrapperStyle={{ fontSize: 12 }}
          />
          <ReferenceLine
            y={2}
            stroke="#6b7280"
            strokeDasharray="4 4"
            label={{
              value: "Fed 목표 2%",
              position: "right",
              fill: "#6b7280",
              fontSize: 11,
            }}
          />
          <ReferenceLine y={0} stroke="#e5e7eb" strokeWidth={1} />
          <Line
            type="monotone"
            dataKey="headline"
            name="Headline CPI YoY"
            stroke={COLORS.headline}
            strokeWidth={1.5}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="core"
            name="Core CPI YoY"
            stroke={COLORS.core}
            strokeWidth={2}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="corePce"
            name="Core PCE YoY"
            stroke={COLORS.corePce}
            strokeWidth={2.5}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
