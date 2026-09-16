"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart,
  BarChart,
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
  CreConcentrationPoint,
  CreDelinquencyPoint,
  CreSizeSplitPoint,
} from "@/lib/observatory-constants";
import {
  formatBucket,
  formatConcentration,
  formatDelinq,
  formatPp,
  formatQuarter,
} from "./format";

// CSS 변수 대신 hex 하드코딩 (recharts 는 CSS 변수를 해석하지 못한다)
const INVESTOR_COLOR = "#dc2626"; // 임대용 CRE 연체율
const OWNER_COLOR = "#94a3b8"; // 자가사용 (대조군)
const TOP100_COLOR = "#7c3aed"; // 상위 100대 은행
const OTHER_COLOR = "#0891b2"; // 100대 밖 은행
const YOY_COLOR = "#f59e0b"; // 전년 대비 상승폭
const WARN_COLOR = "#f59e0b";
const ALERT_COLOR = "#e11d48";
const REGIONAL_COLOR = "#dc2626"; // 지역은행 막대 강조
const BUCKET_COLOR = "#64748b";

/** 위기 구간 주석 */
const EVENTS = [
  { quarter: "2010Q3", label: "금융위기 후유증" },
  { quarter: "2023Q4", label: "지역은행 CRE 충격" },
];

interface DelinqRow {
  quarter: string;
  investor: number;
  owner: number | null;
  yoy: number | null;
}

interface SplitRow {
  quarter: string;
  top100: number | null;
  other: number | null;
  gap: number | null;
}

interface BucketRow {
  bucket: string;
  label: string;
  pct: number;
}

function RangeToggle({
  ranges,
  idx,
  onPick,
}: {
  ranges: readonly { label: string }[];
  idx: number;
  onPick: (i: number) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {ranges.map((r, i) => (
        <button
          key={r.label}
          onClick={() => onPick(i)}
          className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
            i === idx
              ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
              : "border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

const TIP_STYLE = {
  background: "rgba(255,255,255,0.97)",
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: 12,
  boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
} as const;

/* ── 1. 임대용 CRE 연체율 (주 신호) ───────────────────────── */

const DELINQ_RANGES = [
  { label: "2019년~", from: "2019Q1" },
  { label: "2015년~", from: "2015Q1" },
  { label: "전체", from: null },
] as const;

function DelinqTooltip({
  active,
  payload,
  warnPct,
  alertPct,
  warnYoy,
  alertYoy,
}: {
  active?: boolean;
  payload?: { payload?: DelinqRow }[];
  warnPct: number;
  alertPct: number;
  warnYoy: number;
  alertYoy: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const lvl =
    row.investor >= alertPct ? "경보" : row.investor >= warnPct ? "주의" : null;
  const mom =
    row.yoy === null
      ? null
      : row.yoy >= alertYoy
        ? "경보"
        : row.yoy >= warnYoy
          ? "주의"
          : null;
  const event = EVENTS.find((e) => e.quarter === row.quarter);

  return (
    <div style={TIP_STYLE}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: "#111827" }}>
        {formatQuarter(row.quarter)}
        {event ? ` · ${event.label}` : ""}
      </div>
      <div style={{ color: INVESTOR_COLOR }}>
        임대용 연체율 {formatDelinq(row.investor)}
        {lvl ? ` — ${lvl}` : ""}
      </div>
      <div style={{ color: YOY_COLOR }}>
        전년 대비 {formatPp(row.yoy)}
        {mom ? ` — ${mom}` : ""}
      </div>
      {row.owner !== null && (
        <div style={{ color: OWNER_COLOR, marginTop: 2 }}>
          자가사용 {formatDelinq(row.owner)} (대조군)
        </div>
      )}
    </div>
  );
}

export function InvestorDelinquencyChart({
  series,
  warnPct,
  alertPct,
  warnYoy,
  alertYoy,
}: {
  series: CreDelinquencyPoint[];
  warnPct: number;
  alertPct: number;
  warnYoy: number;
  alertYoy: number;
}) {
  const [idx, setIdx] = useState(0);
  const range = DELINQ_RANGES[idx];

  const rows: DelinqRow[] = useMemo(() => {
    const from = range.from;
    const filtered = from ? series.filter((p) => p.quarter >= from) : series;
    return filtered.map((p) => ({
      quarter: p.quarter,
      investor: p.investorNoncurrentPct,
      owner: p.ownerOccupiedNoncurrentPct,
      yoy: p.yoyChangePp,
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
      <RangeToggle ranges={DELINQ_RANGES} idx={idx} onPick={setIdx} />
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={rows} margin={{ top: 10, right: 8, bottom: 4, left: 0 }}>
          <XAxis
            dataKey="quarter"
            tick={{ fontSize: 11, fill: "#71717a" }}
            interval={Math.max(0, Math.floor(rows.length / 7) - 1)}
            tickFormatter={(q: string) => q.replace("Q", " Q")}
          />
          <YAxis
            yAxisId="pct"
            tick={{ fontSize: 11, fill: "#71717a" }}
            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
            width={50}
          />
          <YAxis
            yAxisId="yoy"
            orientation="right"
            tick={{ fontSize: 11, fill: "#71717a" }}
            tickFormatter={(v: number) => `${v.toFixed(1)}`}
            width={44}
          />

          <ReferenceLine yAxisId="yoy" y={0} stroke="#e4e4e7" />
          <ReferenceLine
            yAxisId="pct"
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
            yAxisId="pct"
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
          {visibleEvents.map((e) => (
            <ReferenceLine
              key={e.quarter}
              yAxisId="pct"
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

          <Bar yAxisId="yoy" dataKey="yoy" name="전년 대비" barSize={4}>
            {rows.map((r) => (
              <Cell
                key={r.quarter}
                fill={r.yoy !== null && r.yoy >= 0 ? YOY_COLOR : "#cbd5e1"}
              />
            ))}
          </Bar>
          <Line
            yAxisId="pct"
            type="monotone"
            dataKey="owner"
            stroke={OWNER_COLOR}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            name="자가사용"
          />
          <Line
            yAxisId="pct"
            type="monotone"
            dataKey="investor"
            stroke={INVESTOR_COLOR}
            strokeWidth={2.5}
            dot={false}
            name="임대용"
          />

          <Tooltip
            content={
              <DelinqTooltip
                warnPct={warnPct}
                alertPct={alertPct}
                warnYoy={warnYoy}
                alertYoy={alertYoy}
              />
            }
            cursor={{ stroke: "rgba(120,120,120,0.35)" }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4" style={{ backgroundColor: INVESTOR_COLOR }} />
          임대용 비주거 CRE 연체율 (왼쪽 축)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-0.5 w-4"
            style={{
              backgroundImage: `repeating-linear-gradient(90deg, ${OWNER_COLOR} 0 4px, transparent 4px 7px)`,
            }}
          />
          자가사용 (대조군)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-1.5"
            style={{ backgroundColor: YOY_COLOR }}
          />
          전년 대비 상승폭 (%p, 오른쪽 축)
        </span>
      </div>
    </div>
  );
}

/* ── 2. 규모별 연체율 (대형 vs 100대 밖) ──────────────────── */

const SPLIT_RANGES = [
  { label: "2019년~", from: "2019Q1" },
  { label: "2005년~", from: "2005Q1" },
  { label: "전체", from: null },
] as const;

function SplitTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: SplitRow }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div style={TIP_STYLE}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: "#111827" }}>
        {formatQuarter(row.quarter)}
      </div>
      <div style={{ color: TOP100_COLOR }}>
        상위 100대 은행 {row.top100 === null ? "—" : formatDelinq(row.top100)}
      </div>
      <div style={{ color: OTHER_COLOR }}>
        100대 밖 은행 {row.other === null ? "—" : formatDelinq(row.other)}
      </div>
      <div style={{ color: "#64748b", marginTop: 2 }}>
        격차 {formatPp(row.gap)}
      </div>
    </div>
  );
}

export function SizeSplitChart({ series }: { series: CreSizeSplitPoint[] }) {
  const [idx, setIdx] = useState(0);
  const range = SPLIT_RANGES[idx];

  const rows: SplitRow[] = useMemo(() => {
    const from = range.from;
    const filtered = from ? series.filter((p) => p.quarter >= from) : series;
    return filtered.map((p) => ({
      quarter: p.quarter,
      top100: p.top100Pct,
      other: p.otherPct,
      gap: p.gapPp,
    }));
  }, [series, range.from]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center text-sm text-zinc-500">
        아직 표시할 데이터가 없습니다 (수집 대기)
      </div>
    );
  }

  return (
    <div>
      <RangeToggle ranges={SPLIT_RANGES} idx={idx} onPick={setIdx} />
      <ResponsiveContainer width="100%" height={300}>
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
            width={44}
          />
          <Line
            type="monotone"
            dataKey="top100"
            stroke={TOP100_COLOR}
            strokeWidth={2}
            dot={false}
            name="상위 100대"
          />
          <Line
            type="monotone"
            dataKey="other"
            stroke={OTHER_COLOR}
            strokeWidth={2}
            dot={false}
            name="100대 밖"
          />
          <Tooltip
            content={<SplitTooltip />}
            cursor={{ stroke: "rgba(120,120,120,0.35)" }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4" style={{ backgroundColor: TOP100_COLOR }} />
          상위 100대 은행
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4" style={{ backgroundColor: OTHER_COLOR }} />
          100대 밖 은행
        </span>
      </div>
    </div>
  );
}

/* ── 3. 규모별 집중도 (막대) ──────────────────────────────── */

export function ConcentrationChart({
  latest,
  buckets,
  regionalBucket,
  warnPct,
  alertPct,
}: {
  latest: CreConcentrationPoint | null;
  buckets: string[];
  regionalBucket: string;
  warnPct: number;
  alertPct: number;
}) {
  const rows: BucketRow[] = useMemo(() => {
    if (!latest) return [];
    return buckets
      .filter((b) => typeof latest.byBucket[b] === "number")
      .map((b) => ({
        bucket: b,
        label: formatBucket(b),
        pct: latest.byBucket[b],
      }));
  }, [latest, buckets]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center text-sm text-zinc-500">
        아직 표시할 데이터가 없습니다 (수집 대기)
      </div>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={rows} margin={{ top: 10, right: 8, bottom: 4, left: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "#71717a" }}
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#71717a" }}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            width={44}
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
          <Bar dataKey="pct" name="CRE 집중도">
            {rows.map((r) => (
              <Cell
                key={r.bucket}
                fill={r.bucket === regionalBucket ? REGIONAL_COLOR : BUCKET_COLOR}
              />
            ))}
          </Bar>
          <Tooltip
            cursor={{ fill: "rgba(120,120,120,0.08)" }}
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const row = payload[0]?.payload as BucketRow | undefined;
              if (!row) return null;
              return (
                <div style={TIP_STYLE}>
                  <div
                    style={{ fontWeight: 600, marginBottom: 4, color: "#111827" }}
                  >
                    {row.label}
                  </div>
                  <div style={{ color: "#111827" }}>
                    총자산 대비 CRE {formatConcentration(row.pct)}
                  </div>
                  {row.bucket === regionalBucket && (
                    <div style={{ color: REGIONAL_COLOR, marginTop: 2 }}>
                      지역은행 — 가장 많이 물린 구간
                    </div>
                  )}
                </div>
              );
            }}
          />
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-3 text-xs text-zinc-500">
        빨간 막대가 지역은행({formatBucket(regionalBucket)}) 구간입니다.
        {latest ? ` ${formatQuarter(latest.quarter)} 기준.` : ""}
      </p>
    </div>
  );
}
