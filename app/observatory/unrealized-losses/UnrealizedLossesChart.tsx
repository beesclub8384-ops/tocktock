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
import type { UnrealizedLossPoint } from "@/lib/observatory-constants";
import { formatBillions, formatQuarter, formatRatio } from "./format";

interface Props {
  series: UnrealizedLossPoint[];
  /** 실측 정점 (%) — 가로 참고선 */
  peakPct: number;
  /** 정점 분기 */
  peakQuarter: string;
  /** SVB 파산 분기 — 세로 사건 마커 */
  svbQuarter: string;
  /** 주의 하한 (%) */
  cautionPct: number;
  /** 경보 하한 (%) */
  alertPct: number;
}

// CSS 변수 대신 hex 하드코딩 (recharts 는 CSS 변수를 해석하지 못한다)
const RATIO_COLOR = "#e11d48"; // 비율(%) — 좌축
const GHOST_COLOR = "#0891b2"; // 유령 손실 총액 — 우축
const PEAK_COLOR = "#a1a1aa";
const SVB_COLOR = "#f59e0b";

/** 기간 선택 — 분기 데이터라 "몇 년" 단위로 자른다 */
const RANGES = [
  { label: "전체", years: null },
  { label: "20년", years: 20 },
  { label: "10년", years: 10 },
  { label: "5년", years: 5 },
] as const;

interface Row {
  quarter: string;
  ratioPct: number;
  ghostBillions: number;
}

interface TooltipPayloadEntry {
  payload?: Row;
}

/**
 * 커스텀 툴팁.
 *
 * recharts 의 formatter/labelFormatter 는 값 타입이 ReactNode 로 넓어서
 * 숫자로 좁히려면 캐스팅이 필요하다. 다른 관측소 차트들처럼 content 컴포넌트를
 * 직접 그려 그 문제를 피한다.
 */
function ChartTooltip({
  active,
  payload,
  peakQuarter,
  svbQuarter,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  peakQuarter: string;
  svbQuarter: string;
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
        {formatQuarter(row.quarter)}
      </div>
      <div style={{ color: RATIO_COLOR }}>
        자기자본 대비 {formatRatio(row.ratioPct)}
      </div>
      <div style={{ color: GHOST_COLOR }}>
        유령 손실 {formatBillions(row.ghostBillions)}
      </div>
      {row.quarter === peakQuarter && (
        <div style={{ marginTop: 4, color: "#71717a" }}>
          실측 정점 — SVB 파산({svbQuarter})보다 두 분기 앞섰습니다
        </div>
      )}
      {row.quarter === svbQuarter && (
        <div style={{ marginTop: 4, color: "#b45309" }}>
          SVB 파산 — 정점({peakQuarter})은 이미 두 분기 전이었습니다
        </div>
      )}
    </div>
  );
}

export default function UnrealizedLossesChart({
  series,
  peakPct,
  peakQuarter,
  svbQuarter,
  cautionPct,
  alertPct,
}: Props) {
  const [rangeIdx, setRangeIdx] = useState(0);
  const range = RANGES[rangeIdx];

  const rows: Row[] = useMemo(() => {
    const sliced = range.years === null ? series : series.slice(-range.years * 4);
    return sliced.map((p) => ({
      quarter: p.quarter,
      ratioPct: p.ratioPct,
      ghostBillions: p.ghostBillions,
    }));
  }, [series, range.years]);

  // 잘라낸 구간에 참고선/마커가 안 들어오면 그리지 않는다
  const hasPeak = rows.some((r) => r.quarter === peakQuarter);
  const hasSvb = rows.some((r) => r.quarter === svbQuarter);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center text-sm text-zinc-500">
        아직 표시할 데이터가 없습니다 (수집 대기)
      </div>
    );
  }

  return (
    <div>
      {/* 기간 토글 */}
      <div className="mb-3 flex gap-1.5">
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
            // 분기가 130개라 전부 찍으면 뭉갠다. 대략 8개만 남긴다
            interval={Math.max(0, Math.floor(rows.length / 8) - 1)}
            tickFormatter={(q: string) => q.replace("Q", " Q")}
          />
          <YAxis
            yAxisId="ratio"
            tick={{ fontSize: 11, fill: "#71717a" }}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            width={48}
          />
          <YAxis
            yAxisId="ghost"
            orientation="right"
            tick={{ fontSize: 11, fill: "#71717a" }}
            tickFormatter={(v: number) => `${v.toFixed(0)}`}
            width={48}
          />

          {/* 정점 참고선 (가로) */}
          {hasPeak && (
            <ReferenceLine
              yAxisId="ratio"
              y={peakPct}
              stroke={PEAK_COLOR}
              strokeDasharray="4 4"
              label={{
                value: `${peakQuarter} 정점 ${peakPct.toFixed(1)}%`,
                position: "insideTopRight",
                fontSize: 11,
                fill: PEAK_COLOR,
              }}
            />
          )}

          {/* SVB 사건 마커 (세로) */}
          {hasSvb && (
            <ReferenceLine
              yAxisId="ratio"
              x={svbQuarter}
              stroke={SVB_COLOR}
              strokeDasharray="2 3"
              label={{
                value: "SVB 파산",
                position: "insideTopLeft",
                fontSize: 11,
                fill: SVB_COLOR,
              }}
            />
          )}

          {/* 신호등 경계 */}
          <ReferenceLine
            yAxisId="ratio"
            y={alertPct}
            stroke="#fda4af"
            strokeDasharray="2 4"
          />
          <ReferenceLine
            yAxisId="ratio"
            y={cautionPct}
            stroke="#fcd34d"
            strokeDasharray="2 4"
          />

          <Line
            yAxisId="ratio"
            type="monotone"
            dataKey="ratioPct"
            stroke={RATIO_COLOR}
            strokeWidth={2}
            dot={false}
            name="비율"
          />
          <Line
            yAxisId="ghost"
            type="monotone"
            dataKey="ghostBillions"
            stroke={GHOST_COLOR}
            strokeWidth={1.5}
            strokeDasharray="3 3"
            dot={false}
            name="유령 손실"
          />

          <Tooltip
            content={
              <ChartTooltip peakQuarter={peakQuarter} svbQuarter={svbQuarter} />
            }
            cursor={{ stroke: "rgba(120,120,120,0.35)" }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4" style={{ backgroundColor: RATIO_COLOR }} />
          비율 (%, 왼쪽 축)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-0.5 w-4"
            style={{
              backgroundImage: `repeating-linear-gradient(90deg, ${GHOST_COLOR} 0 3px, transparent 3px 6px)`,
            }}
          />
          유령 손실 총액 (십억 달러, 오른쪽 축)
        </span>
      </div>

      {/* 이 지표가 선행지표라는 근거 — 정점이 사건보다 앞섰다 */}
      <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        <strong>유령 손실의 정점({peakQuarter})은 사건({svbQuarter})보다 두 분기
        앞섰습니다.</strong>{" "}
        은행 장부가 먼저 곪고 나서 SVB가 무너졌다는 뜻입니다. 이 지표를 사건이
        터진 뒤에 보는 결과 보고서가 아니라, 앞서 켜지는 경고등으로 보는 이유가
        여기 있습니다.
      </p>
    </div>
  );
}
