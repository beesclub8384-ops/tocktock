"use client";

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface Point {
  date: string;
  ret: number;
  index: number;
}
interface History {
  sector: string;
  parent: string;
  method: string;
  baseDate: string;
  updatedAt: string;
  points: Point[];
}
interface Props {
  history: History;
}

type Range = "1M" | "6M" | "1Y" | "3Y" | "5Y";
const RANGE_LABEL: Record<Range, string> = {
  "1M": "1개월",
  "6M": "6개월",
  "1Y": "1년",
  "3Y": "3년",
  "5Y": "5년",
};
const RANGE_DAYS: Record<Range, number> = {
  "1M": 31,
  "6M": 183,
  "1Y": 366,
  "3Y": 1096,
  "5Y": 1827,
};

const LINE = "#0ea5e9"; // 하늘색(등락 빨강/파랑과 구분)

function fmtPct(n: number): string {
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function pctClass(n: number): string {
  if (n > 0) return "text-red-600 dark:text-red-400";
  if (n < 0) return "text-blue-600 dark:text-blue-400";
  return "text-muted-foreground";
}

interface TipProps {
  active?: boolean;
  payload?: { payload: Point }[];
}
function ChartTooltip({ active, payload }: TipProps) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-background/95 px-3 py-2 text-xs shadow-lg">
      <div className="font-medium">{p.date}</div>
      <div className="tabular-nums">지수 {p.index.toFixed(2)}</div>
      <div className={`tabular-nums ${pctClass(p.ret)}`}>당일 {fmtPct(p.ret)}</div>
    </div>
  );
}

export function SectorHistoryChart({ history }: Props) {
  const [range, setRange] = useState<Range>("1Y");

  const points = useMemo(() => history.points ?? [], [history.points]);

  const filtered = useMemo(() => {
    if (points.length === 0) return [];
    const lastDate = new Date(points[points.length - 1].date);
    const cutoff = new Date(lastDate);
    cutoff.setDate(cutoff.getDate() - RANGE_DAYS[range]);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return points.filter((p) => p.date >= cutoffStr);
  }, [points, range]);

  // 선택 구간 누적수익률 = (마지막 지수 / 첫 지수 - 1) × 100
  const rangeReturn = useMemo(() => {
    if (filtered.length < 2) return 0;
    return (filtered[filtered.length - 1].index / filtered[0].index - 1) * 100;
  }, [filtered]);

  const periodText =
    filtered.length > 0 ? `${filtered[0].date} ~ ${filtered[filtered.length - 1].date}` : "-";

  return (
    <div>
      <div className="mb-4">
        <div className="text-sm text-muted-foreground">
          {history.parent} › <span className="font-semibold text-foreground">{history.sector}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm text-muted-foreground">기간 {periodText}</span>
          <span className={`text-lg font-bold tabular-nums ${pctClass(rangeReturn)}`}>
            누적수익률 {fmtPct(rangeReturn)}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          단순평균(동일가중) 기준 · 기준일 {history.baseDate} = 지수 100
        </p>
      </div>

      <div className="mb-3 flex flex-wrap gap-1">
        {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              range === r
                ? "bg-foreground/10 text-foreground border border-foreground/30"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>

      <div className="h-[420px] w-full rounded-lg border border-border bg-card p-3">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">데이터가 없습니다.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={filtered} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.4} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                minTickGap={48}
                tickFormatter={(d: string) => d.slice(2)}
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                width={48}
                tickFormatter={(v: number) => v.toFixed(0)}
              />
              <Tooltip content={<ChartTooltip />} />
              <Line
                type="monotone"
                dataKey="index"
                stroke={LINE}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        각 종목 일별 수정주가 수익률을 동일가중 단순평균해 누적한 지수입니다. 그날 데이터가 있는 종목만
        평균에 포함됩니다. 지수 상승(<span className={pctClass(1)}>빨강</span>) / 하락(
        <span className={pctClass(-1)}>파랑</span>).
      </p>
    </div>
  );
}
