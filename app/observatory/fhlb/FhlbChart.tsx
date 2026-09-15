"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart,
  Bar,
  Cell,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { FhlbPoint } from "@/lib/observatory-constants";
import { formatAdvances, formatAdvancesShort, formatQoq, formatQuarter } from "./format";

interface Props {
  series: FhlbPoint[];
  /** 주의 하한 (%) */
  warnQoqPct: number;
  /** 경보 하한 (%) */
  alertQoqPct: number;
}

// CSS 변수 대신 hex 하드코딩 (recharts 는 CSS 변수를 해석하지 못한다)
const ADVANCES_COLOR = "#0f766e"; // 잔액 — 좌축 선
const QOQ_UP_COLOR = "#dc2626"; // 증가율 막대 (증가)
const QOQ_DOWN_COLOR = "#94a3b8"; // 증가율 막대 (감소)
const WARN_COLOR = "#f59e0b";
const ALERT_COLOR = "#e11d48";

/**
 * 표시 구간.
 *
 * 전체(1945~)는 초기 수십 년이 거의 0 에 붙어 있어 최근 움직임이 안 보인다.
 * 기본을 1990년 이후로 두되, 전체도 볼 수 있게 남긴다.
 */
const RANGES = [
  { label: "1990년~", from: 1990 },
  { label: "2005년~", from: 2005 },
  { label: "2018년~", from: 2018 },
  { label: "전체", from: null },
] as const;

interface Row {
  quarter: string;
  advancesBillions: number;
  qoqChangePct: number | null;
}

interface TooltipPayloadEntry {
  payload?: Row;
}

/** 위기 구간 주석 — 이 지표가 언제 켜졌는지 눈으로 잡히게 한다 */
const EVENTS: { quarter: string; label: string }[] = [
  { quarter: "2007Q3", label: "서브프라임" },
  { quarter: "2020Q1", label: "코로나" },
  { quarter: "2023Q1", label: "SVB" },
];

function ChartTooltip({
  active,
  payload,
  warnQoqPct,
  alertQoqPct,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  warnQoqPct: number;
  alertQoqPct: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const qoq = row.qoqChangePct;
  const label =
    qoq === null
      ? null
      : qoq >= alertQoqPct
        ? "경보"
        : qoq >= warnQoqPct
          ? "주의"
          : null;
  const event = EVENTS.find((e) => e.quarter === row.quarter);

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
        {formatQuarter(row.quarter)}
        {event ? ` · ${event.label}` : ""}
      </div>
      <div style={{ color: ADVANCES_COLOR }}>
        차입 잔액 {formatAdvances(row.advancesBillions)}
      </div>
      <div style={{ color: qoq !== null && qoq >= 0 ? QOQ_UP_COLOR : "#64748b" }}>
        전분기 대비 {formatQoq(qoq)}
        {label ? ` — ${label}` : ""}
      </div>
    </div>
  );
}

export default function FhlbChart({ series, warnQoqPct, alertQoqPct }: Props) {
  const [rangeIdx, setRangeIdx] = useState(0);
  const range = RANGES[rangeIdx];

  const rows: Row[] = useMemo(() => {
    const filtered =
      range.from === null
        ? series
        : series.filter((p) => Number(p.quarter.slice(0, 4)) >= range.from);
    return filtered.map((p) => ({
      quarter: p.quarter,
      advancesBillions: p.advancesBillions,
      qoqChangePct: p.qoqChangePct,
    }));
  }, [series, range.from]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center text-sm text-zinc-500">
        아직 표시할 데이터가 없습니다 (수집 대기)
      </div>
    );
  }

  const visibleEvents = EVENTS.filter((e) =>
    rows.some((r) => r.quarter === e.quarter)
  );

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
            dataKey="quarter"
            tick={{ fontSize: 11, fill: "#71717a" }}
            interval={Math.max(0, Math.floor(rows.length / 8) - 1)}
            tickFormatter={(q: string) => q.replace("Q", " Q")}
          />
          {/* 좌축: 잔액 (십억 달러) */}
          <YAxis
            yAxisId="level"
            tick={{ fontSize: 11, fill: "#71717a" }}
            tickFormatter={(v: number) => formatAdvancesShort(v)}
            width={56}
          />
          {/* 우축: 전분기 대비 증가율 (%) */}
          <YAxis
            yAxisId="qoq"
            orientation="right"
            tick={{ fontSize: 11, fill: "#71717a" }}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            width={48}
          />

          {/* 증가율 0선 — 늘었는지 줄었는지의 기준 */}
          <ReferenceLine yAxisId="qoq" y={0} stroke="#d4d4d8" />
          {/* 판정 경계 */}
          <ReferenceLine
            yAxisId="qoq"
            y={warnQoqPct}
            stroke={WARN_COLOR}
            strokeDasharray="3 4"
            label={{
              value: `주의 ${warnQoqPct}%`,
              position: "insideBottomRight",
              fontSize: 10,
              fill: WARN_COLOR,
            }}
          />
          <ReferenceLine
            yAxisId="qoq"
            y={alertQoqPct}
            stroke={ALERT_COLOR}
            strokeDasharray="3 4"
            label={{
              value: `경보 ${alertQoqPct}%`,
              position: "insideTopRight",
              fontSize: 10,
              fill: ALERT_COLOR,
            }}
          />

          {/* 위기 구간 세로 마커 */}
          {visibleEvents.map((e) => (
            <ReferenceLine
              key={e.quarter}
              yAxisId="level"
              x={e.quarter}
              stroke="#a1a1aa"
              strokeDasharray="2 3"
              label={{
                value: e.label,
                position: "insideTopLeft",
                fontSize: 10,
                fill: "#71717a",
              }}
            />
          ))}

          {/* 증가율은 막대로 — 한 분기의 사건이지 흐름이 아니다.
              막대마다 색을 달리하려면 Cell 을 써야 한다 (Bar 중첩은 안 먹는다) */}
          <Bar yAxisId="qoq" dataKey="qoqChangePct" name="증가율" barSize={3}>
            {rows.map((r) => (
              <Cell
                key={r.quarter}
                fill={
                  r.qoqChangePct !== null && r.qoqChangePct >= 0
                    ? QOQ_UP_COLOR
                    : QOQ_DOWN_COLOR
                }
              />
            ))}
          </Bar>

          {/* 잔액은 선으로 — 추세를 본다 */}
          <Line
            yAxisId="level"
            type="monotone"
            dataKey="advancesBillions"
            stroke={ADVANCES_COLOR}
            strokeWidth={2}
            dot={false}
            name="잔액"
          />

          <Tooltip
            content={
              <ChartTooltip warnQoqPct={warnQoqPct} alertQoqPct={alertQoqPct} />
            }
            cursor={{ stroke: "rgba(120,120,120,0.35)" }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4" style={{ backgroundColor: ADVANCES_COLOR }} />
          차입 잔액 (십억 달러, 왼쪽 축)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-1.5"
            style={{ backgroundColor: QOQ_UP_COLOR }}
          />
          전분기 대비 증가율 (%, 오른쪽 축)
        </span>
      </div>
    </div>
  );
}
