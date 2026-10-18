"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { AuctionRow } from "@/lib/observatory-constants";
import { auctionName, signed } from "./format";

interface Props {
  series: AuctionRow[];
  metric: "btc" | "pd";
  /** 가장 최근 입찰 기준 분포의 주의 / 경보 기준 (놀람 단위) */
  cautionCut: number | null;
  alertCut: number | null;
}

// CSS 변수 대신 hex 하드코딩 (recharts 는 CSS 변수를 해석하지 못한다)
const BAD_COLOR = "#dc2626"; // 수요가 약한 쪽 놀람
const GOOD_COLOR = "#94a3b8"; // 수요가 강한 쪽 놀람
const WARN_COLOR = "#f59e0b";
const ALERT_COLOR = "#e11d48";

const RANGES = [
  { label: "최근 3년", days: 365 * 3 },
  { label: "전체", days: null },
] as const;

interface TooltipPayloadEntry {
  payload?: AuctionRow;
}

export default function AuctionChart({ series, metric, cautionCut, alertCut }: Props) {
  const [rangeIdx, setRangeIdx] = useState(0);
  const range = RANGES[rangeIdx];
  const value = (r: AuctionRow) => (metric === "btc" ? r.btcSurprise : r.pdSurprise);
  const unit = metric === "btc" ? "" : "%p";
  // 응찰 배율은 낮을수록, 딜러 비중은 높을수록 수요가 약하다
  const isBad = (v: number) => (metric === "btc" ? v < 0 : v > 0);

  const rows = useMemo(() => {
    const withValue = series.filter((r) => value(r) !== null);
    if (range.days === null || withValue.length === 0) return withValue;
    const last = Date.parse(`${withValue[withValue.length - 1].date}T00:00:00Z`);
    return withValue.filter((r) => last - Date.parse(`${r.date}T00:00:00Z`) <= range.days! * 86_400_000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, metric, range.days]);

  // 축 범위: 막대와 기준선을 모두 담고, 위아래 5% 여유를 둔 뒤 깔끔한 단위로 바깥쪽 반올림한다.
  // 여유가 없으면 기준선이 축 끝에 붙어 라벨이 잘리고, 반올림하지 않으면 눈금이 −0.1 처럼 어중간하게 찍힌다.
  const step = metric === "btc" ? 0.1 : 1;
  const vals = rows.map((r) => value(r) as number).concat(
    [cautionCut, alertCut].filter((v): v is number => v !== null)
  );
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals);
  const pad = (hi - lo) * 0.05;
  const domain: [number, number] = [
    Math.floor((lo - pad) / step) * step,
    Math.ceil((hi + pad) / step) * step,
  ];
  // 0 을 지나는 고른 눈금 — recharts 자동 눈금은 0 대신 −0.1 같은 값에 찍혀 기준선(0)과 어긋나 보인다
  const tickStep = metric === "btc" ? 0.2 : 5;
  const ticks: number[] = [];
  for (let t = Math.ceil(domain[0] / tickStep) * tickStep; t <= domain[1] + 1e-9; t += tickStep) {
    ticks.push(Math.round(t * 100) / 100);
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center text-sm text-zinc-500">
        아직 표시할 데이터가 없습니다 (수집 대기)
      </div>
    );
  }

  return (
    <div>
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

      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart
          data={rows.map((r) => ({ ...r, v: value(r) }))}
          margin={{ top: 10, right: 8, bottom: 4, left: 0 }}
        >
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#71717a" }}
            // 고정 간격이면 모바일 폭에서 날짜가 겹친다. 폭에 맞춰 recharts 가 솎게 한다
            interval="preserveStartEnd"
            minTickGap={28}
            tickFormatter={(d: string) => d.slice(0, 7)}
          />
          {/* 기준선이 막대보다 바깥에 있으면 자동 축에서 잘려 안 보인다 → 축 범위에 기준선을 넣는다 */}
          <YAxis
            tick={{ fontSize: 11, fill: "#71717a" }}
            tickFormatter={(v: number) => (metric === "btc" ? v.toFixed(1) : `${v.toFixed(0)}`)}
            width={44}
            domain={domain}
            ticks={ticks}
          />
          <ReferenceLine y={0} stroke="#d4d4d8" />
          {/* 주의·경보 기준 — 라벨은 플롯 안쪽, 겹치지 않게 좌우로 나눈다 */}
          {cautionCut !== null && (
            <ReferenceLine
              y={cautionCut}
              stroke={WARN_COLOR}
              strokeDasharray="3 4"
              label={{
                value: `주의 ${signed(cautionCut, 2, unit)}`,
                position: "insideTopLeft",
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
                value: `경보 ${signed(alertCut, 2, unit)}`,
                position: "insideBottomRight",
                fontSize: 10,
                fill: ALERT_COLOR,
              }}
            />
          )}
          <Bar dataKey="v" name="평소 대비" barSize={2}>
            {rows.map((r, i) => {
              const v = value(r) as number;
              return <Cell key={`${r.date}-${r.cusip}-${i}`} fill={isBad(v) ? BAD_COLOR : GOOD_COLOR} />;
            })}
          </Bar>
          <Tooltip
            cursor={{ fill: "rgba(120,120,120,0.12)" }}
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
                  <div style={{ fontWeight: 600, color: "#111827" }}>
                    {row.date} · {auctionName(row.termYears, row.reopening)}
                  </div>
                  <div style={{ color: "#52525b" }}>
                    {metric === "btc"
                      ? `응찰 배율 ${row.bidToCover.toFixed(2)}배`
                      : `딜러 비중 ${row.dealerSharePct?.toFixed(1)}%`}
                  </div>
                  <div style={{ color: "#52525b" }}>평소 대비 {signed(value(row), 2, unit)}</div>
                </div>
              );
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="mt-2 text-xs text-zinc-500">
        막대 하나가 입찰 하나입니다. 같은 만기의 직전 6회 평균과의 차이이며, 빨간 막대가 수요가 약한
        쪽입니다. 기준선은 가장 최근 입찰 기준 값입니다.
      </p>
    </div>
  );
}
