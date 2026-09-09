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
import type { ReservesPoint } from "@/lib/observatory-constants";
import type { MarketIndexPoint } from "@/lib/observatory-market-index";
import { formatReserves } from "./format";
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
  series: ReservesPoint[];
  /** 2019년 레포 발작 당시 수준 (십억 달러) */
  crisis2019Billions: number;
  crisis2019Date: string;
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

type Range = "1Y" | "2Y" | "전체";

const RANGE_MONTHS: Record<Range, number | null> = {
  "1Y": 12,
  "2Y": 24,
  전체: null,
};

// CSS 변수 대신 hex 하드코딩 (recharts 는 CSS 변수를 해석하지 못한다)
// ⚠ balance 를 청록으로 둔 이유: 원래 파랑(#2563eb)이었는데 그 색이 나스닥
//   오버레이 색과 같다. 지수 색(INDEX_COLORS)은 페이지 간 통일이 필요해서
//   지표 쪽을 옮겼다. RRP 차트도 같은 이유로 같은 청록을 쓴다
//   (둘 다 "낮을수록 위험" 지표라 색을 맞춰두면 읽기 편하다).
const COLORS = {
  balance: "#0d9488",
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
  payload?: OverlayRow;
}

function ChartTooltip({
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
      {/* 준비금은 주간(수요일 기준)이고 지수는 일간이라, 대부분의 날짜에는
          준비금 값이 없다. "-" 로만 두면 데이터가 빠진 것처럼 보이므로
          관측일이 아니라는 걸 분명히 적는다 */}
      {typeof row.value === "number" ? (
        <div style={{ color: COLORS.balance }}>
          총량: {formatReserves(row.value)} (수요일 기준)
        </div>
      ) : (
        <div style={{ color: "#9ca3af" }}>총량: 이 날은 관측일이 아닙니다</div>
      )}
      <IndexTooltipRows row={row} baselines={baselines} />
    </div>
  );
}

export default function ReservesChart({
  series,
  crisis2019Billions,
  crisis2019Date,
  normalBillions,
  alertBillions,
  indices = [],
}: Props) {
  const [range, setRange] = useState<Range>("2Y");
  const [showNasdaq, setShowNasdaq] = useState(true);
  const [showSp500, setShowSp500] = useState(true);

  const hasIndices = indices.length > 0;

  // 주간(준비금) + 일간(지수) 조합이다. 합집합으로 만들면 준비금 값이 없는
  // 날짜 행이 대부분이 되는데, 준비금 선은 connectNulls 로 점 사이를 이어 그린다.
  const { rows, baselines } = useMemo(
    () =>
      buildOverlayRows(
        series.map((p) => ({ date: p.date, value: p.balanceBillions })),
        indices,
        cutoffFromMonths(RANGE_MONTHS[range])
      ),
    [range, series, indices]
  );

  const dateTickFormatter = (val: string) => {
    const d = new Date(`${val}T00:00:00Z`);
    // 전체 구간은 연도만, 짧은 구간은 연.월
    return range === "전체"
      ? String(d.getUTCFullYear())
      : `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };

  const crisisYear = new Date(`${crisis2019Date}T00:00:00Z`).getUTCFullYear();
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

      {/* 지수 오버레이 토글 */}
      {hasIndices && (
        <IndexToggles
          showNasdaq={showNasdaq}
          showSp500={showSp500}
          onToggleNasdaq={() => setShowNasdaq((v) => !v)}
          onToggleSp500={() => setShowSp500((v) => !v)}
        />
      )}

      {/* y축을 0부터 열어 2019년 발작선과 판정선이 늘 함께 보이게 한다.
          이 지표는 절대 수준이 곧 의미라, 확대해서 주간 등락만 키워 보여주면
          "지금이 어느 높이인가" 라는 정작 중요한 정보가 사라진다 */}
      <ResponsiveContainer width="100%" height={360}>
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
              (dataMax: number) => Math.max(dataMax * 1.08, normalBillions * 1.15),
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
            content={<ChartTooltip baselines={baselines} />}
            cursor={{ stroke: "rgba(120,120,120,0.35)" }}
          />
          {/* 정상 하한 / 경보 상한 */}
          <ReferenceLine
            yAxisId="left"
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
            yAxisId="left"
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
            yAxisId="left"
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
            yAxisId="left"
            type="monotone"
            dataKey="value"
            name="지급준비금 총량"
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

      <OverlayCaption
        leftAxisLabel="지급준비금 총량(십억 달러, 1,000십억 이상은 조 단위로 표기)"
        baselines={baselines}
        hasIndices={hasIndices}
        extra="준비금은 매주 수요일 기준 주간 데이터라 점 사이를 이어 그립니다 · 이 지표는 값이 낮을수록 위험합니다"
      />
    </div>
  );
}
