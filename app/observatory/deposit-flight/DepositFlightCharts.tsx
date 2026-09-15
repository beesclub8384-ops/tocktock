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
import type {
  DepositFlightQuarterlyPoint,
  DepositFlightWeeklyPoint,
} from "@/lib/observatory-constants";
import {
  formatBillions,
  formatChangePp,
  formatDate,
  formatQuarter,
  formatSharePct,
  formatUninsuredPct,
} from "./format";

// CSS 변수 대신 hex 하드코딩 (recharts 는 CSS 변수를 해석하지 못한다)
const SHARE_COLOR = "#2563eb"; // 소형 은행 비중 — 좌축 선
const DROP_COLOR = "#dc2626"; // 비중이 빠진 주 (막대)
const RISE_COLOR = "#94a3b8"; // 비중이 늘어난 주 (막대)
const UNINSURED_COLOR = "#7c3aed"; // 무보험 비중 — 분기 차트
const WARN_COLOR = "#f59e0b";
const ALERT_COLOR = "#e11d48";

/** 주간 차트 표시 구간 */
const WEEKLY_RANGES = [
  { label: "2년", weeks: 104 },
  { label: "5년", weeks: 260 },
  { label: "2020년~", weeks: null, from: "2020-01-01" },
  { label: "전체", weeks: null, from: null },
] as const;

/** 위기 구간 주석 */
const EVENTS: { date: string; label: string }[] = [
  { date: "2001-09-12", label: "9·11" },
  { date: "2008-09-17", label: "리먼" },
  { date: "2020-03-18", label: "코로나" },
  { date: "2023-03-15", label: "SVB" },
];

interface WeeklyRow {
  date: string;
  smallBillions: number;
  largeBillions: number;
  smallSharePct: number;
  weeklyChangePp: number | null;
}

interface QuarterlyRow {
  quarter: string;
  uninsuredSharePct: number;
  domesticDepositsBillions: number;
  insuredDepositsBillions: number;
}

function WeeklyTooltip({
  active,
  payload,
  warnPp,
  alertPp,
}: {
  active?: boolean;
  payload?: { payload?: WeeklyRow }[];
  warnPp: number;
  alertPp: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const pp = row.weeklyChangePp;
  const label =
    pp === null ? null : pp <= alertPp ? "경보" : pp <= warnPp ? "주의" : null;
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
        {formatDate(row.date)}
        {event ? ` · ${event.label}` : ""}
      </div>
      <div style={{ color: SHARE_COLOR }}>
        소형 은행 비중 {formatSharePct(row.smallSharePct)}
      </div>
      <div style={{ color: pp !== null && pp < 0 ? DROP_COLOR : "#64748b" }}>
        1주 변화 {formatChangePp(pp)}
        {label ? ` — ${label}` : ""}
      </div>
      <div style={{ color: "#64748b", marginTop: 2 }}>
        소형 {formatBillions(row.smallBillions)} / 대형{" "}
        {formatBillions(row.largeBillions)} (십억 달러)
      </div>
    </div>
  );
}

function QuarterlyTooltip({
  active,
  payload,
  warnPct,
  alertPct,
}: {
  active?: boolean;
  payload?: { payload?: QuarterlyRow }[];
  warnPct: number;
  alertPct: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const pct = row.uninsuredSharePct;
  const label = pct >= alertPct ? "경보" : pct >= warnPct ? "주의" : null;
  const uninsured = row.domesticDepositsBillions - row.insuredDepositsBillions;

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
      </div>
      <div style={{ color: UNINSURED_COLOR }}>
        무보험 비중 {formatUninsuredPct(pct)}
        {label ? ` — ${label}` : ""}
      </div>
      <div style={{ color: "#64748b", marginTop: 2 }}>
        무보험 {formatBillions(uninsured)} / 국내 예금{" "}
        {formatBillions(row.domesticDepositsBillions)} (십억 달러)
      </div>
    </div>
  );
}

export function WeeklyChart({
  series,
  warnPp,
  alertPp,
}: {
  series: DepositFlightWeeklyPoint[];
  warnPp: number;
  alertPp: number;
}) {
  const [rangeIdx, setRangeIdx] = useState(0);
  const range = WEEKLY_RANGES[rangeIdx];

  const rows: WeeklyRow[] = useMemo(() => {
    let filtered = series;
    if (range.weeks !== null) {
      filtered = series.slice(-range.weeks);
    } else if ("from" in range && range.from) {
      const from = range.from;
      filtered = series.filter((p) => p.date >= from);
    }
    return filtered.map((p) => ({
      date: p.date,
      smallBillions: p.smallBillions,
      largeBillions: p.largeBillions,
      smallSharePct: p.smallSharePct,
      weeklyChangePp: p.weeklyChangePp,
    }));
  }, [series, range]);

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
      <div className="mb-3 flex flex-wrap gap-1.5">
        {WEEKLY_RANGES.map((r, i) => (
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

      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={rows} margin={{ top: 10, right: 8, bottom: 4, left: 0 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#71717a" }}
            interval={Math.max(0, Math.floor(rows.length / 7) - 1)}
            tickFormatter={(d: string) => d.slice(0, 7)}
          />
          {/* 좌축: 소형 은행 비중 (%) */}
          <YAxis
            yAxisId="share"
            tick={{ fontSize: 11, fill: "#71717a" }}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            width={48}
            domain={["dataMin - 0.5", "dataMax + 0.5"]}
          />
          {/* 우축: 1주 변화 (%p) */}
          <YAxis
            yAxisId="change"
            orientation="right"
            tick={{ fontSize: 11, fill: "#71717a" }}
            tickFormatter={(v: number) => `${v.toFixed(1)}`}
            width={44}
          />

          <ReferenceLine yAxisId="change" y={0} stroke="#d4d4d8" />
          <ReferenceLine
            yAxisId="change"
            y={warnPp}
            stroke={WARN_COLOR}
            strokeDasharray="3 4"
          />
          <ReferenceLine
            yAxisId="change"
            y={alertPp}
            stroke={ALERT_COLOR}
            strokeDasharray="3 4"
            label={{
              value: `경보 ${alertPp}%p`,
              position: "insideBottomRight",
              fontSize: 10,
              fill: ALERT_COLOR,
            }}
          />

          {visibleEvents.map((e) => (
            <ReferenceLine
              key={e.date}
              yAxisId="share"
              x={e.date}
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

          <Bar yAxisId="change" dataKey="weeklyChangePp" name="1주 변화" barSize={2}>
            {rows.map((r) => (
              <Cell
                key={r.date}
                fill={
                  r.weeklyChangePp !== null && r.weeklyChangePp < 0
                    ? DROP_COLOR
                    : RISE_COLOR
                }
              />
            ))}
          </Bar>

          <Line
            yAxisId="share"
            type="monotone"
            dataKey="smallSharePct"
            stroke={SHARE_COLOR}
            strokeWidth={2}
            dot={false}
            name="소형 비중"
          />

          <Tooltip
            content={<WeeklyTooltip warnPp={warnPp} alertPp={alertPp} />}
            cursor={{ stroke: "rgba(120,120,120,0.35)" }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4" style={{ backgroundColor: SHARE_COLOR }} />
          소형 은행 예금 비중 (%, 왼쪽 축)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-1.5"
            style={{ backgroundColor: DROP_COLOR }}
          />
          1주 변화 (%p, 오른쪽 축 · 빨강이 유출)
        </span>
      </div>
    </div>
  );
}

export function QuarterlyChart({
  series,
  warnPct,
  alertPct,
  comparableFrom,
}: {
  series: DepositFlightQuarterlyPoint[];
  warnPct: number;
  alertPct: number;
  comparableFrom: string;
}) {
  const [showAll, setShowAll] = useState(false);

  const rows: QuarterlyRow[] = useMemo(() => {
    const filtered = showAll
      ? series
      : series.filter((p) => p.quarter >= comparableFrom);
    return filtered.map((p) => ({
      quarter: p.quarter,
      uninsuredSharePct: p.uninsuredSharePct,
      domesticDepositsBillions: p.domesticDepositsBillions,
      insuredDepositsBillions: p.insuredDepositsBillions,
    }));
  }, [series, showAll, comparableFrom]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center text-sm text-zinc-500">
        아직 표시할 데이터가 없습니다 (수집 대기)
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowAll(false)}
          className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
            !showAll
              ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
              : "border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
          }`}
        >
          {comparableFrom}~ (비교 가능 구간)
        </button>
        <button
          onClick={() => setShowAll(true)}
          className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
            showAll
              ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
              : "border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
          }`}
        >
          전체
        </button>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={rows} margin={{ top: 10, right: 8, bottom: 4, left: 0 }}>
          <XAxis
            dataKey="quarter"
            tick={{ fontSize: 11, fill: "#71717a" }}
            interval={Math.max(0, Math.floor(rows.length / 7) - 1)}
            tickFormatter={(q: string) => q.replace("Q", " Q")}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#71717a" }}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            width={48}
          />

          <ReferenceLine
            y={warnPct}
            stroke={WARN_COLOR}
            strokeDasharray="3 4"
            label={{
              value: `주의 ${warnPct}%`,
              position: "insideBottomRight",
              fontSize: 10,
              fill: WARN_COLOR,
            }}
          />
          <ReferenceLine
            y={alertPct}
            stroke={ALERT_COLOR}
            strokeDasharray="3 4"
            label={{
              value: `경보 ${alertPct}%`,
              position: "insideTopRight",
              fontSize: 10,
              fill: ALERT_COLOR,
            }}
          />

          <Line
            type="monotone"
            dataKey="uninsuredSharePct"
            stroke={UNINSURED_COLOR}
            strokeWidth={2}
            dot={false}
            name="무보험 비중"
          />

          <Tooltip
            content={<QuarterlyTooltip warnPct={warnPct} alertPct={alertPct} />}
            cursor={{ stroke: "rgba(120,120,120,0.35)" }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {showAll && (
        <p className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          전체 구간에는 실제 자금 이동이 아닌 점프가 섞여 있습니다. 예금보험 한도
          인상(10만 → 25만 달러)과 무이자 거래계좌 전액 보증(2008~2012) 개시·종료
          때문입니다. 앞뒤를 그대로 비교하면 안 됩니다.
        </p>
      )}
    </div>
  );
}
