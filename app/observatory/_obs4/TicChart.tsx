"use client";

import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { TicRow } from "@/lib/observatory-constants";
import { formatBillions, shortNumber } from "./format";

interface Props {
  series: TicRow[];
  cautionCutPct: number | null;
  alertCutPct: number | null;
}

// CSS 변수 대신 hex 하드코딩 (recharts 는 CSS 변수를 해석하지 못한다)
const TOTAL_COLOR = "#0e7490"; // 보유 합계 — 좌축
const YOY_COLOR = "#c2410c"; // 12개월 증가율 — 우축
const WARN_COLOR = "#f59e0b";
const ALERT_COLOR = "#e11d48";

interface TooltipPayloadEntry {
  payload?: TicRow;
}

export default function TicChart({ series, cautionCutPct, alertCutPct }: Props) {
  if (series.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center text-sm text-zinc-500">
        아직 표시할 데이터가 없습니다 (수집 대기)
      </div>
    );
  }
  return (
    <div>
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={series} margin={{ top: 10, right: 8, bottom: 4, left: 0 }}>
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: "#71717a" }}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis
            yAxisId="lv"
            tick={{ fontSize: 11, fill: "#71717a" }}
            tickFormatter={(v: number) => shortNumber(v)}
            width={52}
            domain={["auto", "auto"]}
          />
          <YAxis
            yAxisId="yoy"
            orientation="right"
            tick={{ fontSize: 11, fill: "#71717a" }}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            width={40}
          />
          <ReferenceLine yAxisId="yoy" y={0} stroke="#d4d4d8" />
          {cautionCutPct !== null && (
            <ReferenceLine
              yAxisId="yoy"
              y={cautionCutPct}
              stroke={WARN_COLOR}
              strokeDasharray="3 4"
              label={{
                value: `주의 ${cautionCutPct.toFixed(1)}%`,
                // 경보선과 가까워 둘 다 오른쪽에 두면 겹친다 → 주의는 왼쪽
                position: "insideTopLeft",
                fontSize: 10,
                fill: WARN_COLOR,
              }}
            />
          )}
          {alertCutPct !== null && (
            <ReferenceLine
              yAxisId="yoy"
              y={alertCutPct}
              stroke={ALERT_COLOR}
              strokeDasharray="3 4"
              label={{
                value: `경보 ${alertCutPct.toFixed(1)}%`,
                position: "insideBottomRight",
                fontSize: 10,
                fill: ALERT_COLOR,
              }}
            />
          )}
          <Line yAxisId="yoy" type="monotone" dataKey="yoyPct" stroke={YOY_COLOR} strokeWidth={1.5} dot={false} connectNulls={false} name="12개월 증가율" />
          <Line yAxisId="lv" type="monotone" dataKey="totalBillions" stroke={TOTAL_COLOR} strokeWidth={2} dot={false} name="보유 합계" />
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
                  <div style={{ fontWeight: 600, color: "#111827" }}>{row.month} 말</div>
                  <div style={{ color: TOTAL_COLOR }}>보유 합계 {formatBillions(row.totalBillions)}</div>
                  <div style={{ color: YOY_COLOR }}>
                    12개월 증가율 {row.yoyPct === null ? "—" : `${row.yoyPct > 0 ? "+" : ""}${row.yoyPct.toFixed(1)}%`}
                  </div>
                </div>
              );
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4" style={{ backgroundColor: TOTAL_COLOR }} />
          해외 보유 합계 (십억 달러, 왼쪽 축)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4" style={{ backgroundColor: YOY_COLOR }} />
          12개월 증가율 (%, 오른쪽 축)
        </span>
      </div>
    </div>
  );
}
