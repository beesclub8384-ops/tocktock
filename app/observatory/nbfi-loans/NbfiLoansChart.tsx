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
import type { NbfiLoansRow } from "@/lib/observatory-constants";
import { formatLoans, formatLoansShort, formatShare, formatYoy } from "./format";

interface Props {
  series: NbfiLoansRow[];
  /** YoY 주의 기준 (%) — 분포 상위 10% */
  cautionCutoffPct: number | null;
  /** YoY 경보 기준 (%) — 분포 상위 3% */
  alertCutoffPct: number | null;
}

// CSS 변수 대신 hex 하드코딩 (recharts 는 CSS 변수를 해석하지 못한다)
const LOANS_COLOR = "#0e7490"; // 잔액 — 좌축 선
const YOY_COLOR = "#c2410c"; // 전년 대비 증가율 — 우축 선
const WARN_COLOR = "#f59e0b";
const ALERT_COLOR = "#e11d48";

const RANGES = [
  { label: "전체 (2015~)", weeks: null },
  { label: "최근 3년", weeks: 157 },
] as const;

/**
 * 대조용 표시. 해당 기준일이 데이터에 있을 때만 그린다.
 * 2025-01-01 은 사건이 아니라 H.8 의 첫 대규모 재분류(다른 대출 → NDFI 대출) 주다.
 * 그 뒤 1년간 증가율에 재분류분이 섞인다는 걸 눈으로 보이게 하려고 둔다.
 */
const EVENTS: {
  date: string;
  label: string;
  position: "insideBottomLeft" | "insideBottomRight";
}[] = [
  { date: "2020-03-18", label: "코로나", position: "insideBottomLeft" },
  // SVB 와 재분류는 2년 차이라 모바일 폭에서 붙는다 → SVB 는 선 왼쪽, 재분류는 오른쪽
  { date: "2023-03-15", label: "SVB", position: "insideBottomRight" },
  { date: "2025-01-01", label: "재분류 시작", position: "insideBottomLeft" },
];

interface TooltipPayloadEntry {
  payload?: NbfiLoansRow;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const event = EVENTS.find((e) => e.date === row.date);
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
        {row.date}
        {event ? ` · ${event.label}` : ""}
      </div>
      <div style={{ color: LOANS_COLOR }}>잔액 {formatLoans(row.loansBillions)}</div>
      <div style={{ color: YOY_COLOR }}>전년 대비 {formatYoy(row.yoyPct)}</div>
      <div style={{ color: "#52525b" }}>총대출 대비 {formatShare(row.shareOfTotalPct)}</div>
    </div>
  );
}

export default function NbfiLoansChart({ series, cautionCutoffPct, alertCutoffPct }: Props) {
  const [rangeIdx, setRangeIdx] = useState(0);
  const range = RANGES[rangeIdx];

  const rows = useMemo(
    () => (range.weeks === null ? series : series.slice(-range.weeks)),
    [series, range.weeks]
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center text-sm text-zinc-500">
        아직 표시할 데이터가 없습니다 (수집 대기)
      </div>
    );
  }

  const visibleEvents = EVENTS.filter((e) => rows.some((r) => r.date === e.date));

  return (
    <div>
      {/* 기간 토글 */}
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

      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart data={rows} margin={{ top: 10, right: 8, bottom: 4, left: 0 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#71717a" }}
            // 고정 간격이면 모바일 폭에서 날짜가 겹친다. 폭에 맞춰 recharts 가 솎게 한다
            interval="preserveStartEnd"
            minTickGap={28}
            tickFormatter={(d: string) => d.slice(0, 7)}
          />
          {/* 좌축: 잔액 (십억 달러) */}
          <YAxis
            yAxisId="level"
            tick={{ fontSize: 11, fill: "#71717a" }}
            tickFormatter={(v: number) => formatLoansShort(v)}
            width={52}
          />
          {/* 우축: 전년 대비 증가율 (%) */}
          <YAxis
            yAxisId="yoy"
            orientation="right"
            tick={{ fontSize: 11, fill: "#71717a" }}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            width={44}
          />

          <ReferenceLine yAxisId="yoy" y={0} stroke="#d4d4d8" />

          {/* 판정 경계 — 라벨은 증가율 선이 없는 왼쪽 끝(2015년, YoY 계산 전)에 둔다.
              오른쪽에 두면 2025년 이후 높게 뜬 증가율 선과 겹친다 */}
          {cautionCutoffPct !== null && (
            <ReferenceLine
              yAxisId="yoy"
              y={cautionCutoffPct}
              stroke={WARN_COLOR}
              strokeDasharray="3 4"
              label={{
                value: `주의 ${cautionCutoffPct.toFixed(0)}%`,
                position: "insideBottomLeft",
                fontSize: 10,
                fill: WARN_COLOR,
              }}
            />
          )}
          {alertCutoffPct !== null && (
            <ReferenceLine
              yAxisId="yoy"
              y={alertCutoffPct}
              stroke={ALERT_COLOR}
              strokeDasharray="3 4"
              label={{
                value: `경보 ${alertCutoffPct.toFixed(0)}%`,
                position: "insideTopLeft",
                fontSize: 10,
                fill: ALERT_COLOR,
              }}
            />
          )}

          {visibleEvents.map((e) => (
            <ReferenceLine
              key={e.date}
              yAxisId="level"
              x={e.date}
              stroke="#a1a1aa"
              strokeDasharray="2 3"
              label={{ value: e.label, position: e.position, fontSize: 10, fill: "#71717a" }}
            />
          ))}

          <Line
            yAxisId="yoy"
            type="monotone"
            dataKey="yoyPct"
            stroke={YOY_COLOR}
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
            name="전년 대비"
          />
          <Line
            yAxisId="level"
            type="monotone"
            dataKey="loansBillions"
            stroke={LOANS_COLOR}
            strokeWidth={2}
            dot={false}
            name="잔액"
          />

          <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(120,120,120,0.35)" }} />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4" style={{ backgroundColor: LOANS_COLOR }} />
          잔액 (십억 달러, 왼쪽 축)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4" style={{ backgroundColor: YOY_COLOR }} />
          전년 대비 증가율 (%, 오른쪽 축)
        </span>
      </div>
    </div>
  );
}
