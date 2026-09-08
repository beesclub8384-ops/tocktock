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
import type { ReservesPoint } from "@/lib/observatory-constants";
import { formatReserves } from "./format";

interface Props {
  series: ReservesPoint[];
  /** 2019년 레포 발작 당시 수준 (십억 달러) */
  crisis2019Billions: number;
  crisis2019Date: string;
  /** 정상 하한 (십억 달러) */
  normalBillions: number;
  /** 경보 상한 (십억 달러) */
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
  balance: "#2563eb",
  crisis: "#6b7280",
  normal: "#16a34a",
  alert: "#e11d48",
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
        총량: {Number.isFinite(v) ? formatReserves(v) : "-"}
      </div>
    </div>
  );
}

export default function ReservesChart({
  series,
  crisis2019Billions,
  crisis2019Date,
  normalBillions,
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

  const crisisYear = new Date(`${crisis2019Date}T00:00:00Z`).getUTCFullYear();

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

      {/* y축을 0부터 열어 2019년 발작선과 판정선이 늘 함께 보이게 한다.
          이 지표는 절대 수준이 곧 의미라, 확대해서 주간 등락만 키워 보여주면
          "지금이 어느 높이인가" 라는 정작 중요한 정보가 사라진다 */}
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={filtered} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="date"
            tickFormatter={dateTickFormatter}
            minTickGap={50}
            tick={{ fontSize: 11, fill: COLORS.tick }}
            stroke={COLORS.axis}
          />
          <YAxis
            tickFormatter={(v: number) =>
              v >= 1000 ? `${(v / 1000).toFixed(1)}조` : `${v}`
            }
            tick={{ fontSize: 11, fill: COLORS.tick }}
            stroke={COLORS.axis}
            width={48}
            domain={[
              0,
              (dataMax: number) => Math.max(dataMax * 1.08, normalBillions * 1.15),
            ]}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: "rgba(120,120,120,0.35)" }}
          />
          {/* 정상 하한 / 경보 상한 */}
          <ReferenceLine
            y={normalBillions}
            stroke={COLORS.normal}
            strokeDasharray="4 4"
            label={{
              value: `정상 하한 ${normalBillions.toLocaleString("en-US")}`,
              position: "insideTopRight",
              fill: COLORS.normal,
              fontSize: 11,
              fontWeight: 600,
            }}
          />
          <ReferenceLine
            y={alertBillions}
            stroke={COLORS.alert}
            strokeDasharray="4 4"
            label={{
              value: `경보 ${alertBillions.toLocaleString("en-US")}`,
              position: "insideBottomRight",
              fill: COLORS.alert,
              fontSize: 11,
              fontWeight: 600,
            }}
          />
          {/* 2019년 레포 발작 당시 수준 — 역사적 위험 구간 */}
          <ReferenceLine
            y={crisis2019Billions}
            stroke={COLORS.crisis}
            strokeDasharray="6 4"
            strokeWidth={1.5}
            label={{
              value: `${crisisYear} 레포 발작 수준 ${crisis2019Billions.toLocaleString("en-US")} — 이 선 근처가 역사적 위험 구간`,
              position: "insideBottomLeft",
              fill: COLORS.crisis,
              fontSize: 11,
              fontWeight: 600,
            }}
          />
          <Line
            type="monotone"
            dataKey="balanceBillions"
            name="지급준비금 총량"
            stroke={COLORS.balance}
            strokeWidth={1.8}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>

      <p className="mt-2 text-[11px] text-zinc-500">
        세로축 단위: 십억 달러 (1,000십억 이상은 조 단위로 표기) · 가로축 날짜는 각
        주 수요일 기준일 · 이 지표는 값이 낮을수록 위험합니다
      </p>
    </div>
  );
}
