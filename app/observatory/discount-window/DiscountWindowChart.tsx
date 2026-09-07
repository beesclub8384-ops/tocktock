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
} from "recharts";
import type { DiscountWindowPoint } from "@/lib/observatory-constants";
import { formatBalance } from "./format";

interface Props {
  series: DiscountWindowPoint[];
  /** 2023년 3월 피크 (십억 달러) */
  peakBillions: number;
  peakDate: string;
  /** 주의 임계값 (십억 달러) */
  cautionBillions: number;
  /** 경보 임계값 (십억 달러) */
  alertBillions: number;
}

type Range = "1Y" | "2Y" | "전체";

const RANGE_MONTHS: Record<Range, number | null> = {
  "1Y": 12,
  "2Y": 24,
  전체: null,
};

// CSS 변수 대신 hex 하드코딩 (recharts 는 CSS 변수를 해석하지 못한다)
const COLORS = {
  balance: "#dc2626",
  peak: "#6b7280",
  alert: "#e11d48",
  caution: "#f59e0b",
  axis: "#9ca3af",
  tick: "#6b7280",
} as const;

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

function peakLabel(peakDate: string): string {
  const d = new Date(`${peakDate}T00:00:00Z`);
  return `${d.getUTCFullYear()}.${d.getUTCMonth() + 1} 피크`;
}

interface TooltipPayloadEntry {
  value?: number | string;
  dataKey?: string;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  label?: string;
  payload?: TooltipPayloadEntry[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const raw = payload[0]?.value;
  const v = typeof raw === "number" ? raw : Number(raw);
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
        {/* 주간 시리즈라 이 날짜가 "그 주 수요일" 이라는 걸 같이 적는다 */}
        {label ? `${formatDate(label)} (수)` : ""}
      </div>
      <div style={{ color: COLORS.balance }}>
        잔액: {Number.isFinite(v) ? formatBalance(v) : "-"}
      </div>
    </div>
  );
}

export default function DiscountWindowChart({
  series,
  peakBillions,
  peakDate,
  cautionBillions,
  alertBillions,
}: Props) {
  const [range, setRange] = useState<Range>("2Y");

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
    // 전체 구간은 연도만, 짧은 구간은 연.월
    return range === "전체"
      ? String(d.getUTCFullYear())
      : `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
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

      {/* 메인 차트 — y축을 2023년 피크까지 열어둔다.
          지금 값이 그 피크에 견줘 얼마나 바닥인지가 이 지표의 핵심이라,
          최근 구간만 확대해 보여주면 오히려 오해를 부른다.
          대신 아래 보조 차트에서 최근 구간을 따로 확대한다. */}
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
            tickFormatter={(v: number) => `${v}`}
            tick={{ fontSize: 11, fill: COLORS.tick }}
            stroke={COLORS.axis}
            width={44}
            domain={[
              0,
              (dataMax: number) => Math.max(dataMax * 1.1, peakBillions * 1.08),
            ]}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: "rgba(120,120,120,0.35)" }}
          />
          {/* 2023년 3월 은행 사태 피크 — 지금이 어느 수준인지 견주는 눈금 */}
          <ReferenceLine
            y={peakBillions}
            stroke={COLORS.peak}
            strokeDasharray="6 4"
            strokeWidth={1.5}
            label={{
              value: `${peakLabel(peakDate)} ${peakBillions.toFixed(0)}`,
              position: "insideTopRight",
              fill: COLORS.peak,
              fontSize: 12,
              fontWeight: 600,
            }}
          />
          <ReferenceLine
            y={alertBillions}
            stroke={COLORS.alert}
            strokeDasharray="4 4"
            label={{
              value: `경보 ${alertBillions}`,
              position: "insideTopRight",
              fill: COLORS.alert,
              fontSize: 11,
              fontWeight: 600,
            }}
          />
          <Line
            type="monotone"
            dataKey="balanceBillions"
            name="재할인 창구 잔액"
            stroke={COLORS.balance}
            strokeWidth={1.8}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* 보조 차트 — 같은 구간을 실제 값 범위로 확대.
          평시 잔액은 한 자릿수라 위 차트에서는 바닥에 붙어 변화가 안 보인다 */}
      <div className="mt-6">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          같은 구간 확대 (실제 값 범위)
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={filtered} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="date"
              tickFormatter={dateTickFormatter}
              minTickGap={50}
              tick={{ fontSize: 11, fill: COLORS.tick }}
              stroke={COLORS.axis}
            />
            <YAxis
              tickFormatter={(v: number) => `${v}`}
              tick={{ fontSize: 11, fill: COLORS.tick }}
              stroke={COLORS.axis}
              width={44}
              domain={[0, "auto"]}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: "rgba(120,120,120,0.35)" }}
            />
            <ReferenceLine
              y={cautionBillions}
              stroke={COLORS.caution}
              strokeDasharray="4 4"
              label={{
                value: `주의 ${cautionBillions}`,
                position: "insideTopRight",
                fill: COLORS.caution,
                fontSize: 11,
                fontWeight: 600,
              }}
            />
            <Line
              type="monotone"
              dataKey="balanceBillions"
              name="재할인 창구 잔액"
              stroke={COLORS.balance}
              strokeWidth={1.8}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-[11px] text-zinc-500">
        세로축 단위: 십억 달러 · 가로축 날짜는 각 주 수요일 기준일
      </p>
    </div>
  );
}
