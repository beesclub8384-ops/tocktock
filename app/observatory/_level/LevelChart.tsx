"use client";

/**
 * 관측소 5·6 공용 — 시계열 하나(선 또는 막대)와 주의·경보 기준선을 그리는 차트.
 *
 * 값과 기준선의 단위·표기는 부르는 쪽이 정한다(unit, digits). 표기 함수를 props 로
 * 넘기지 않는 이유: 서버 컴포넌트에서 클라이언트 컴포넌트로 함수를 넘길 수 없다.
 */
import { useMemo, useState } from "react";
import {
  ComposedChart,
  Line,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

export interface LevelPoint {
  /** x 축 라벨 (날짜·분기) */
  x: string;
  /** 값. 없으면 null (선이 끊긴다) */
  v: number | null;
}

interface Props {
  data: LevelPoint[];
  /** 값 단위 — 툴팁·기준선 라벨에 붙는다 (예: "%", "bp") */
  unit: string;
  digits: number;
  cautionCut: number | null;
  alertCut: number | null;
  /** 선 이름 (범례·툴팁) */
  name: string;
  /** 막대로 그릴지 (분기 증가율 등) */
  bars?: boolean;
  /** 기간 토글: [라벨, 최근 몇 개] — null 은 전체 */
  ranges?: [string, number | null][];
  /** 기준선 방향 — 낮을수록 나쁜 지표면 true (라벨 위치만 바뀐다) */
  lowIsBad?: boolean;
}

// CSS 변수 대신 hex 하드코딩 (recharts 는 CSS 변수를 해석하지 못한다)
const LINE_COLOR = "#4f46e5";
const BAR_UP = "#94a3b8";
const BAR_DOWN = "#dc2626";
const WARN_COLOR = "#f59e0b";
const ALERT_COLOR = "#e11d48";

interface TooltipPayloadEntry {
  payload?: LevelPoint;
}

export default function LevelChart({
  data,
  unit,
  digits,
  cautionCut,
  alertCut,
  name,
  bars = false,
  ranges = [["전체", null]],
  lowIsBad = false,
}: Props) {
  const [rangeIdx, setRangeIdx] = useState(0);
  const n = ranges[rangeIdx][1];
  const rows = useMemo(() => (n === null ? data : data.slice(-n)), [data, n]);
  const fmt = (v: number) => `${v.toFixed(digits)}${unit}`;
  // 기준값은 한 자리 더 보여 준다. 같은 자릿수로 반올림하면 기준(3.565)과 값(3.56)이 같아 보여
  // 정상인 값이 주의처럼 읽힌다 (독립 검증 지적)
  const fmtCut = (v: number) => `${v.toFixed(digits + 1)}${unit}`;

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center text-sm text-zinc-500">
        아직 표시할 데이터가 없습니다 (수집 대기)
      </div>
    );
  }

  // 기준선이 값보다 바깥에 있으면 자동 축에서 잘려 안 보인다 → 축 범위에 넣고 5% 여유를 둔다
  const vals = rows.map((r) => r.v).filter((v): v is number => v !== null);
  const cuts = [cautionCut, alertCut].filter((v): v is number => v !== null);
  const lo = Math.min(...vals, ...cuts, bars ? 0 : Infinity);
  const hi = Math.max(...vals, ...cuts, bars ? 0 : -Infinity);
  const pad = (hi - lo) * 0.05 || 1;
  const domain: [number, number] = [lo - pad, hi + pad];

  return (
    <div>
      {ranges.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {ranges.map(([label], i) => (
            <button
              key={label}
              onClick={() => setRangeIdx(i)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                i === rangeIdx
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-300 text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={rows} margin={{ top: 10, right: 8, bottom: 4, left: 0 }}>
          <XAxis
            dataKey="x"
            tick={{ fontSize: 11, fill: "#71717a" }}
            // 고정 간격이면 모바일 폭에서 날짜가 겹친다. 폭에 맞춰 recharts 가 솎게 한다
            interval="preserveStartEnd"
            minTickGap={28}
            tickFormatter={(x: string) => (x.length === 10 ? x.slice(0, 7) : x)}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#71717a" }}
            tickFormatter={(v: number) => v.toFixed(Math.min(digits, 1))}
            width={44}
            domain={domain}
            allowDataOverflow
          />
          {bars && <ReferenceLine y={0} stroke="#d4d4d8" />}
          {/* 주의·경보 기준선 — 라벨은 플롯 안쪽, 서로 겹치지 않게 좌우로 나눈다 */}
          {cautionCut !== null && (
            <ReferenceLine
              y={cautionCut}
              stroke={WARN_COLOR}
              strokeDasharray="3 4"
              label={{
                value: `현재 주의선 ${fmtCut(cautionCut)}`,
                position: lowIsBad ? "insideTopLeft" : "insideBottomLeft",
                fontSize: 10,
                fill: WARN_COLOR,
              }}
            />
          )}
          {alertCut !== null && (
            <ReferenceLine
              y={alertCut}
              stroke={ALERT_COLOR}
              strokeDasharray="3 4"
              label={{
                value: `현재 경보선 ${fmtCut(alertCut)}`,
                position: lowIsBad ? "insideBottomRight" : "insideTopRight",
                fontSize: 10,
                fill: ALERT_COLOR,
              }}
            />
          )}
          {bars ? (
            <Bar dataKey="v" name={name} barSize={6}>
              {rows.map((r, i) => (
                <Cell key={`${r.x}-${i}`} fill={r.v !== null && r.v < 0 ? BAR_DOWN : BAR_UP} />
              ))}
            </Bar>
          ) : (
            <Line type="monotone" dataKey="v" stroke={LINE_COLOR} strokeWidth={2} dot={false} name={name} connectNulls={false} />
          )}
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
                  <div style={{ fontWeight: 600, color: "#111827" }}>{row.x}</div>
                  <div style={{ color: LINE_COLOR }}>
                    {name} {row.v === null ? "—" : fmt(row.v)}
                  </div>
                </div>
              );
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      {(cautionCut !== null || alertCut !== null) && (
        <p className="mt-2 text-xs text-zinc-500 leading-relaxed">
          점선은 지금까지 쌓인 자료 전체로 계산한 현재 기준선입니다. 과거 각 시점의 판정은 그때까지의 자료로만 계산한
          기준을 썼기 때문에, 과거의 점이 점선 위에 있어도 당시에는 정상이었거나 판정 보류였을 수 있습니다.
        </p>
      )}
    </div>
  );
}
