"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { RrpPoint } from "@/lib/observatory-constants";
import type { MarketIndexPoint } from "@/lib/observatory-market-index";
import { formatRrp } from "./format";
import {
  buildOverlayRows,
  cutoffFromMonths,
  IndexToggles,
  IndexTooltipRows,
  INDEX_COLORS,
  OverlayCaption,
  type OverlayBaselines,
  type OverlayRow,
} from "../index-overlay";

interface Props {
  series: RrpPoint[];
  /** 2022년 말 정점 (십억 달러) */
  peakBillions: number;
  peakDate: string;
  /** 정상 하한 (십억 달러) */
  normalBillions: number;
  /** 경보 상한 (십억 달러) */
  alertBillions: number;
  /**
   * 오버레이용 주가지수 (참고 데이터). 아직 수집 전이면 빈 배열이 온다 —
   * 그때는 지수 토글과 우축을 아예 그리지 않는다.
   */
  indices?: MarketIndexPoint[];
}

type Range = "3M" | "1Y" | "전체";

const RANGE_MONTHS: Record<Range, number | null> = {
  "3M": 3,
  "1Y": 12,
  전체: null,
};

// CSS 변수 대신 hex 하드코딩 (recharts 는 CSS 변수를 해석하지 못한다)
// ⚠ balance 를 청록으로 둔 이유: 원래 파랑(#2563eb)이었는데 그 색이
//   나스닥 오버레이 색과 같다. 한 차트 안에서 두 선이 같은 색이면 못 읽는다.
//   지수 색(INDEX_COLORS)은 SRF 차트와 통일해야 해서 이쪽을 옮겼다.
const COLORS = {
  balance: "#0d9488",
  peak: "#6b7280",
  normal: "#16a34a",
  alert: "#e11d48",
  axis: "#9ca3af",
  tick: "#6b7280",
} as const;

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

function peakLabel(peakDate: string): string {
  const d = new Date(`${peakDate}T00:00:00Z`);
  return `${d.getUTCFullYear()}.${d.getUTCMonth() + 1} 정점`;
}

interface TooltipPayloadEntry {
  value?: number | string;
  dataKey?: string;
  payload?: OverlayRow;
}

/** 메인 차트용 툴팁 — 지수 오버레이 포함 */
function MainTooltip({
  active,
  payload,
  label,
  baselines,
}: {
  active?: boolean;
  label?: string;
  payload?: TooltipPayloadEntry[];
  baselines: OverlayBaselines;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

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
        {label ? formatDate(label) : ""}
      </div>
      <div style={{ color: COLORS.balance }}>
        잔액: {typeof row.value === "number" ? formatRrp(row.value) : "-"}
      </div>
      <IndexTooltipRows row={row} baselines={baselines} />
    </div>
  );
}

/** 보조(확대) 차트용 툴팁 — 지수 없이 잔액만 */
function ZoomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  label?: string;
  payload?: { value?: number | string }[];
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
        {label ? formatDate(label) : ""}
      </div>
      <div style={{ color: COLORS.balance }}>
        잔액: {Number.isFinite(v) ? formatRrp(v) : "-"}
      </div>
    </div>
  );
}

export default function RrpChart({
  series,
  peakBillions,
  peakDate,
  normalBillions,
  alertBillions,
  indices = [],
}: Props) {
  // 이 지표는 2021~2023년에 쌓였다가 빠진 큰 호(arc)가 이야기의 전부라
  // 기본값을 "전체" 로 둔다 (SrfChart 와 같은 기본값)
  const [range, setRange] = useState<Range>("전체");
  const [showNasdaq, setShowNasdaq] = useState(true);
  const [showSp500, setShowSp500] = useState(true);

  const hasIndices = indices.length > 0;

  // 메인 차트 — 지수와 날짜 합집합으로 만든 행
  const { rows, baselines } = useMemo(
    () =>
      buildOverlayRows(
        series.map((p) => ({ date: p.date, value: p.balanceBillions })),
        indices,
        cutoffFromMonths(RANGE_MONTHS[range])
      ),
    [range, series, indices]
  );

  // 보조(확대) 차트 — 지수를 얹지 않으므로 RRP 만 담은 원래 시계열을 그대로 쓴다
  const filtered = useMemo(() => {
    const cutoffStr = cutoffFromMonths(RANGE_MONTHS[range]);
    if (cutoffStr === null) return series;
    return series.filter((p) => p.date >= cutoffStr);
  }, [range, series]);

  const dateTickFormatter = (val: string) => {
    const d = new Date(`${val}T00:00:00Z`);
    // 전체 구간은 연도만, 짧은 구간은 연.월
    return range === "전체"
      ? String(d.getUTCFullYear())
      : `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };

  const anyIndexShown = hasIndices && (showNasdaq || showSp500);

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

      {/* 지수 오버레이 토글 — 메인 차트에만 적용된다 (아래 확대 차트는 그대로) */}
      {hasIndices && (
        <IndexToggles
          showNasdaq={showNasdaq}
          showSp500={showSp500}
          onToggleNasdaq={() => setShowNasdaq((v) => !v)}
          onToggleSp500={() => setShowSp500((v) => !v)}
        />
      )}

      {/* 메인 차트 — y축을 2022년 정점까지 열어둔다.
          "얼마나 쌓였다가 얼마나 빠졌나" 가 이 지표의 이야기라,
          최근 구간만 확대해 보여주면 쿠션이 사라졌다는 사실이 안 보인다.
          최근 변화는 아래 보조 차트에서 확대한다. */}
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={rows} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="date"
            tickFormatter={dateTickFormatter}
            minTickGap={50}
            tick={{ fontSize: 11, fill: COLORS.tick }}
            stroke={COLORS.axis}
          />
          <YAxis
            yAxisId="left"
            tickFormatter={(v: number) =>
              v >= 1000 ? `${(v / 1000).toFixed(1)}조` : `${v}`
            }
            tick={{ fontSize: 11, fill: COLORS.tick }}
            stroke={COLORS.axis}
            width={48}
            domain={[
              0,
              (dataMax: number) => Math.max(dataMax * 1.1, peakBillions * 1.08),
            ]}
          />
          {/* 우축은 정규화 상대값 전용. 지수를 다 끄면 축도 같이 감춘다 */}
          {anyIndexShown && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={(v: number) => `${Math.round(v)}`}
              tick={{ fontSize: 11, fill: COLORS.tick }}
              stroke={COLORS.axis}
              width={48}
              domain={["auto", "auto"]}
            />
          )}
          <Tooltip
            content={<MainTooltip baselines={baselines} />}
            cursor={{ stroke: "rgba(120,120,120,0.35)" }}
          />
          {/* 2022년 말 정점 — 지금 쿠션이 얼마나 사라졌는지 견주는 눈금 */}
          <ReferenceLine
            yAxisId="left"
            y={peakBillions}
            stroke={COLORS.peak}
            strokeDasharray="6 4"
            strokeWidth={1.5}
            label={{
              value: `${peakLabel(peakDate)} ${(peakBillions / 1000).toFixed(2)}조`,
              position: "insideTopRight",
              fill: COLORS.peak,
              fontSize: 12,
              fontWeight: 600,
            }}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="value"
            name="RRP 잔액"
            stroke={COLORS.balance}
            strokeWidth={1.8}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          {anyIndexShown && showNasdaq && (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="nasdaqRel"
              name="나스닥 종합"
              stroke={INDEX_COLORS.nasdaq}
              strokeWidth={1.6}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}
          {anyIndexShown && showSp500 && (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="sp500Rel"
              name="S&P 500"
              stroke={INDEX_COLORS.sp500}
              strokeWidth={1.6}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* 보조 차트 — 같은 구간을 실제 값 범위로 확대.
          지금 잔액은 한 자릿수라 위 차트에서는 바닥에 붙어 변화가 안 보인다.
          판정 임계선(정상 하한 / 경보 상한)도 이 축에서만 읽힌다.
          지수는 얹지 않는다 — 여기는 판정선을 읽는 자리다 */}
      <div className="mt-6">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          같은 구간 확대 (실제 값 범위 · 판정선 표시)
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
              width={48}
              // 판정선이 늘 보이도록 정상 하한보다 조금 위까지 열어둔다
              domain={[
                0,
                (dataMax: number) =>
                  Math.max(dataMax * 1.1, normalBillions * 1.3),
              ]}
            />
            <Tooltip
              content={<ZoomTooltip />}
              cursor={{ stroke: "rgba(120,120,120,0.35)" }}
            />
            <ReferenceLine
              y={normalBillions}
              stroke={COLORS.normal}
              strokeDasharray="4 4"
              label={{
                value: `정상 하한 ${normalBillions}`,
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
                value: `경보 ${alertBillions}`,
                position: "insideBottomRight",
                fill: COLORS.alert,
                fontSize: 11,
                fontWeight: 600,
              }}
            />
            <Line
              type="monotone"
              dataKey="balanceBillions"
              name="RRP 잔액"
              stroke={COLORS.balance}
              strokeWidth={1.8}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <OverlayCaption
        leftAxisLabel="RRP 잔액(십억 달러, 위 차트는 1,000십억 이상을 조 단위로 표기)"
        baselines={baselines}
        hasIndices={hasIndices}
        extra="이 지표는 값이 낮을수록 위험합니다 · 지수 오버레이는 위 차트에만 적용됩니다"
      />
    </div>
  );
}
