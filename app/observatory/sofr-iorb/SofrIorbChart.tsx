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
import type { SofrIorbPoint } from "@/lib/observatory-constants";

interface Props {
  series: SofrIorbPoint[];
  spikeThresholdBp: number;
}

type Range = "3M" | "1Y" | "전체";

const RANGE_MONTHS: Record<Range, number | null> = {
  "3M": 3,
  "1Y": 12,
  전체: null,
};

// CSS 변수 대신 hex 하드코딩 (recharts 는 CSS 변수를 해석하지 못한다)
const COLORS = {
  spread: "#dc2626",
  zero: "#6b7280",
  spike: "#f59e0b",
  sofr: "#2563eb",
  iorb: "#16a34a",
  axis: "#9ca3af",
  tick: "#6b7280",
} as const;

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
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
  unit: string;
  digits: number;
}

function ChartTooltip({ active, payload, label, unit, digits }: ChartTooltipProps) {
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
        {label ? formatDate(label) : ""}
      </div>
      {payload.map((p) => {
        const v = typeof p.value === "number" ? p.value : Number(p.value);
        return (
          <div key={p.dataKey} style={{ color: p.color, marginTop: 2 }}>
            {p.name}: {Number.isFinite(v) ? `${v.toFixed(digits)}${unit}` : "-"}
          </div>
        );
      })}
    </div>
  );
}

export default function SofrIorbChart({ series, spikeThresholdBp }: Props) {
  const [range, setRange] = useState<Range>("1Y");

  const filtered = useMemo(() => {
    const months = RANGE_MONTHS[range];
    if (months === null) return series;
    const cutoff = new Date();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return series.filter((p) => p.date >= cutoffStr);
  }, [range, series]);

  const dateTickFormatter = (val: string) => {
    const d = new Date(`${val}T00:00:00Z`);
    return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };

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

      {/* 메인 차트 — 스프레드 (bp) */}
      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={filtered} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="date"
            tickFormatter={dateTickFormatter}
            minTickGap={50}
            tick={{ fontSize: 11, fill: COLORS.tick }}
            stroke={COLORS.axis}
          />
          <YAxis
            tickFormatter={(v: number) => `${v}bp`}
            tick={{ fontSize: 11, fill: COLORS.tick }}
            stroke={COLORS.axis}
            width={44}
          />
          <Tooltip content={<ChartTooltip unit="bp" digits={1} />} />
          {/* y=0 기준선 — 이 위로 올라오면 레포 금리가 연준 이자율을 넘어선 것.
              라벨은 선 아래쪽 안쪽에 둔다 (최근 구간 데이터가 0 위에 붙어 있어 위쪽은 겹친다) */}
          <ReferenceLine
            y={0}
            stroke={COLORS.zero}
            strokeWidth={1.5}
            label={{
              value: "0bp",
              position: "insideBottomRight",
              fill: COLORS.zero,
              fontSize: 12,
              fontWeight: 600,
            }}
          />
          <ReferenceLine
            y={spikeThresholdBp}
            stroke={COLORS.spike}
            strokeDasharray="4 4"
            label={{
              value: `급등 기준 +${spikeThresholdBp}bp`,
              position: "insideTopRight",
              fill: COLORS.spike,
              fontSize: 12,
              fontWeight: 600,
            }}
          />
          <Line
            type="monotone"
            dataKey="spreadBp"
            name="SOFR − IORB"
            stroke={COLORS.spread}
            strokeWidth={1.8}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* 보조 차트 — SOFR / IORB 원계열 */}
      <div className="mt-6">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          원계열: SOFR vs IORB
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={filtered} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="date"
              tickFormatter={dateTickFormatter}
              minTickGap={50}
              tick={{ fontSize: 11, fill: COLORS.tick }}
              stroke={COLORS.axis}
            />
            <YAxis
              tickFormatter={(v: number) => `${v.toFixed(2)}%`}
              tick={{ fontSize: 11, fill: COLORS.tick }}
              stroke={COLORS.axis}
              width={48}
              domain={["auto", "auto"]}
            />
            <Tooltip content={<ChartTooltip unit="%" digits={2} />} />
            {/* 좁은 화면에서 범례가 두 줄로 접혀도 잘리지 않도록 높이 여유를 둔다 */}
            <Legend
              verticalAlign="top"
              height={36}
              wrapperStyle={{ fontSize: 11, lineHeight: "16px" }}
            />
            <Line
              type="monotone"
              dataKey="sofr"
              name="SOFR (레포 금리)"
              stroke={COLORS.sofr}
              strokeWidth={1.8}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="iorb"
              name="IORB (지준 이자율)"
              stroke={COLORS.iorb}
              strokeWidth={1.8}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
