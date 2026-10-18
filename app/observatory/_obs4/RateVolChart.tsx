"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { RateVolRow } from "@/lib/observatory-constants";

interface Props {
  series: RateVolRow[];
  cautionCutBp: number | null;
  alertCutBp: number | null;
}

// CSS 변수 대신 hex 하드코딩 (recharts 는 CSS 변수를 해석하지 못한다)
const RV_COLOR = "#7c3aed"; // 실현변동성 — 좌축
const YIELD_COLOR = "#0e7490"; // 10년물 금리 — 우축
const WARN_COLOR = "#f59e0b";
const ALERT_COLOR = "#e11d48";

const RANGES = [
  { label: "최근 2년", n: 504 },
  { label: "최근 10년", n: null },
] as const;

interface TooltipPayloadEntry {
  payload?: RateVolRow;
}

export default function RateVolChart({ series, cautionCutBp, alertCutBp }: Props) {
  const [rangeIdx, setRangeIdx] = useState(0);
  const range = RANGES[rangeIdx];
  const rows = useMemo(
    () => (range.n === null ? series : series.slice(-range.n)),
    [series, range.n]
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center text-sm text-zinc-500">
        아직 표시할 데이터가 없습니다 (수집 대기)
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {RANGES.map((r, i) => (
          <button
            key={r.label}
            onClick={() => setRangeIdx(i)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              i === rangeIdx
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={rows} margin={{ top: 10, right: 8, bottom: 4, left: 0 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#71717a" }}
            interval="preserveStartEnd"
            minTickGap={28}
            tickFormatter={(d: string) => d.slice(0, 7)}
          />
          <YAxis
            yAxisId="rv"
            tick={{ fontSize: 11, fill: "#71717a" }}
            tickFormatter={(v: number) => `${v.toFixed(0)}`}
            width={36}
          />
          <YAxis
            yAxisId="y"
            orientation="right"
            tick={{ fontSize: 11, fill: "#71717a" }}
            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
            width={44}
            domain={["auto", "auto"]}
          />
          {cautionCutBp !== null && (
            <ReferenceLine
              yAxisId="rv"
              y={cautionCutBp}
              stroke={WARN_COLOR}
              strokeDasharray="3 4"
              label={{
                value: `주의 ${cautionCutBp.toFixed(1)}bp`,
                position: "insideBottomLeft",
                fontSize: 10,
                fill: WARN_COLOR,
              }}
            />
          )}
          {alertCutBp !== null && (
            <ReferenceLine
              yAxisId="rv"
              y={alertCutBp}
              stroke={ALERT_COLOR}
              strokeDasharray="3 4"
              label={{
                value: `경보 ${alertCutBp.toFixed(1)}bp`,
                position: "insideTopLeft",
                fontSize: 10,
                fill: ALERT_COLOR,
              }}
            />
          )}
          <Line yAxisId="y" type="monotone" dataKey="yieldPct" stroke={YIELD_COLOR} strokeWidth={1.2} dot={false} name="10년물 금리" />
          <Line yAxisId="rv" type="monotone" dataKey="rv20Bp" stroke={RV_COLOR} strokeWidth={2} dot={false} name="실현변동성" />
          <Tooltip
            cursor={{ stroke: "rgba(120,120,120,0.35)" }}
            content={({ active, payload }: { active?: boolean; payload?: readonly TooltipPayloadEntry[] }) => {
              const row = active && payload && payload[0]?.payload;
              if (!row) return null;
              return (
                <div
                  style={{
                    background: "rgba(255,255,255,0.97)",
                    border: "1px solid #e5e7eb",
                    borderRadius: 6,
                    padding: "8px 10px",
                    fontSize: 12,
                  }}
                >
                  <div style={{ fontWeight: 600, color: "#111827" }}>{row.date}</div>
                  <div style={{ color: RV_COLOR }}>
                    실현변동성 {row.rv20Bp === null ? "—" : `${row.rv20Bp.toFixed(1)}bp`}
                  </div>
                  <div style={{ color: YIELD_COLOR }}>10년물 금리 {row.yieldPct.toFixed(2)}%</div>
                  <div style={{ color: "#52525b" }}>
                    하루 변화 {row.changeBp === null ? "—" : `${row.changeBp > 0 ? "+" : ""}${row.changeBp.toFixed(0)}bp`}
                  </div>
                </div>
              );
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4" style={{ backgroundColor: RV_COLOR }} />
          20영업일 실현변동성 (bp, 왼쪽 축)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4" style={{ backgroundColor: YIELD_COLOR }} />
          10년물 금리 (%, 오른쪽 축)
        </span>
      </div>
    </div>
  );
}
