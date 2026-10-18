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
import type { BasisTradeRow } from "@/lib/observatory-constants";
import {
  formatChangeEok,
  formatContracts,
  formatEokShort,
  formatNotional,
  formatNotionalShort,
} from "./format";

interface Props {
  series: BasisTradeRow[];
  /** 4주 변화 주의 기준 (십억 달러) — 분포 하위 5% */
  caution4wBillions: number | null;
  /** 4주 변화 경보 기준 (십억 달러) — 분포 하위 2% */
  alert4wBillions: number | null;
  /** 액면 명목 쏠림 기준 (십억 달러) — 최근 157주 상위 10% */
  concentrationCutoffBillions: number | null;
}

// CSS 변수 대신 hex 하드코딩 (recharts 는 CSS 변수를 해석하지 못한다)
const NOTIONAL_COLOR = "#4f46e5"; // 액면 명목 — 좌축 선
const CHANGE_DOWN_COLOR = "#dc2626"; // 4주 변화 막대 (감소 = 청산 쪽)
const CHANGE_UP_COLOR = "#94a3b8"; // 4주 변화 막대 (증가)
const WARN_COLOR = "#f59e0b";
const ALERT_COLOR = "#e11d48";

/** 3년 ≈ 157주 — 쏠림 구간을 보는 창과 같다 */
const RANGES = [
  { label: "전체 (2016.04~)", weeks: null },
  { label: "최근 3년", weeks: 157 },
] as const;

/**
 * 대조용 사건 표시. 해당 보고일이 데이터에 있을 때만 그린다.
 *
 * 2019-09 와 2020-03 은 반년 차이라 전체 구간에서 선이 붙어 있다. 라벨을 둘 다
 * 오른쪽에 붙이면 겹치므로 레포 급등은 선의 왼쪽, 코로나는 오른쪽에 둔다.
 */
const EVENTS: {
  date: string;
  label: string;
  position: "insideBottomLeft" | "insideBottomRight";
}[] = [
  { date: "2019-09-17", label: "레포 급등", position: "insideBottomRight" },
  { date: "2020-03-17", label: "코로나", position: "insideBottomLeft" },
  { date: "2023-03-14", label: "SVB", position: "insideBottomLeft" },
];

interface TooltipPayloadEntry {
  payload?: BasisTradeRow;
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
  const downColor = (v: number | null) => (v !== null && v < 0 ? CHANGE_DOWN_COLOR : "#64748b");

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
      <div style={{ color: NOTIONAL_COLOR }}>액면 명목 {formatNotional(row.notionalBillions)}</div>
      <div style={{ color: "#52525b" }}>순숏 {formatContracts(row.netShortContracts)}</div>
      <div style={{ color: downColor(row.change4wBillions) }}>
        4주 변화 {formatChangeEok(row.change4wBillions)}
      </div>
      <div style={{ color: downColor(row.change8wBillions) }}>
        8주 변화 {formatChangeEok(row.change8wBillions)}
      </div>
    </div>
  );
}

export default function BasisTradeChart({
  series,
  caution4wBillions,
  alert4wBillions,
  concentrationCutoffBillions,
}: Props) {
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

      <ResponsiveContainer width="100%" height={380}>
        <ComposedChart data={rows} margin={{ top: 10, right: 8, bottom: 4, left: 0 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#71717a" }}
            // 고정 간격이면 모바일 폭에서 날짜가 겹친다. 폭에 맞춰 recharts 가 솎게 한다
            interval="preserveStartEnd"
            minTickGap={28}
            tickFormatter={(d: string) => d.slice(0, 7)}
          />
          {/* 좌축: 액면 명목 (십억 달러) */}
          <YAxis
            yAxisId="level"
            tick={{ fontSize: 11, fill: "#71717a" }}
            tickFormatter={(v: number) => formatNotionalShort(v)}
            width={52}
          />
          {/* 우축: 4주 변화 — 데이터는 십억 달러, 눈금은 억 달러로 표시 */}
          <YAxis
            yAxisId="change"
            orientation="right"
            tick={{ fontSize: 11, fill: "#71717a" }}
            tickFormatter={(v: number) => formatEokShort(v)}
            width={52}
          />

          <ReferenceLine yAxisId="change" y={0} stroke="#d4d4d8" />

          {/* 청산 신호 경계 (4주 변화 분포 하위 5% / 2%) */}
          {caution4wBillions !== null && (
            <ReferenceLine
              yAxisId="change"
              y={caution4wBillions}
              stroke={WARN_COLOR}
              strokeDasharray="3 4"
              label={{
                value: `4주 주의 ${formatEokShort(caution4wBillions)}억`,
                // 주의·경보 선이 가까워 둘 다 오른쪽에 두면 라벨이 겹친다 → 주의는 왼쪽
                position: "insideTopLeft",
                fontSize: 10,
                fill: WARN_COLOR,
              }}
            />
          )}
          {alert4wBillions !== null && (
            <ReferenceLine
              yAxisId="change"
              y={alert4wBillions}
              stroke={ALERT_COLOR}
              strokeDasharray="3 4"
              label={{
                value: `4주 경보 ${formatEokShort(alert4wBillions)}억`,
                position: "insideBottomRight",
                fontSize: 10,
                fill: ALERT_COLOR,
              }}
            />
          )}

          {/* 쏠림 구간 경계 (최근 157주 상위 10%) */}
          {concentrationCutoffBillions !== null && (
            <ReferenceLine
              yAxisId="level"
              y={concentrationCutoffBillions}
              stroke={WARN_COLOR}
              strokeDasharray="6 3"
              label={{
                value: `쏠림 구간 ${formatNotionalShort(concentrationCutoffBillions)}`,
                position: "insideTopLeft",
                fontSize: 10,
                fill: WARN_COLOR,
              }}
            />
          )}

          {/* 대조용 사건 세로 마커 */}
          {visibleEvents.map((e) => (
            <ReferenceLine
              key={e.date}
              yAxisId="level"
              x={e.date}
              stroke="#a1a1aa"
              strokeDasharray="2 3"
              label={{
                value: e.label,
                position: e.position,
                fontSize: 10,
                fill: "#71717a",
              }}
            />
          ))}

          {/* 4주 변화는 막대로. 막대마다 색을 달리하려면 Cell 을 써야 한다 */}
          <Bar yAxisId="change" dataKey="change4wBillions" name="4주 변화" barSize={2}>
            {rows.map((r) => (
              <Cell
                key={r.date}
                fill={
                  r.change4wBillions !== null && r.change4wBillions < 0
                    ? CHANGE_DOWN_COLOR
                    : CHANGE_UP_COLOR
                }
              />
            ))}
          </Bar>

          <Line
            yAxisId="level"
            type="monotone"
            dataKey="notionalBillions"
            stroke={NOTIONAL_COLOR}
            strokeWidth={2}
            dot={false}
            name="액면 명목"
          />

          <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(120,120,120,0.35)" }} />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4" style={{ backgroundColor: NOTIONAL_COLOR }} />
          액면 명목 순숏 (십억 달러, 왼쪽 축)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-1.5"
            style={{ backgroundColor: CHANGE_DOWN_COLOR }}
          />
          4주 변화 (억 달러, 오른쪽 축)
        </span>
      </div>
    </div>
  );
}
