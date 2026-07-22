"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface Point {
  date: string; // YYYY-MM-DD
  kospi: number; // 원
  kosdaq: number; // 원
  total: number; // 원
}

type Range = "1M" | "3M" | "1Y" | "5Y" | "10Y" | "ALL";
const RANGE_LABEL: Record<Range, string> = {
  "1M": "1개월",
  "3M": "3개월",
  "1Y": "1년",
  "5Y": "5년",
  "10Y": "10년",
  ALL: "전체",
};
const RANGE_DAYS: Record<Range, number | null> = {
  "1M": 31,
  "3M": 92,
  "1Y": 366,
  "5Y": 1830,
  "10Y": 3660,
  ALL: null,
};

// 색상 hex 직접 지정 (CSS 변수 금지)
const COLOR = {
  kospi: "#dc2626", // 빨강
  kosdaq: "#2563eb", // 파랑
  total: "#111827", // 검정
};

// 원 → "○○.○조"
function toJo(won: number): string {
  return `${(won / 1e12).toFixed(1)}조`;
}

interface TipProps {
  active?: boolean;
  payload?: { payload: Point }[];
}
function ChartTooltip({ active, payload }: TipProps) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-background/95 px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium">{p.date}</div>
      <div className="tabular-nums" style={{ color: COLOR.kospi }}>
        코스피 {toJo(p.kospi)}
      </div>
      <div className="tabular-nums" style={{ color: COLOR.kosdaq }}>
        코스닥 {toJo(p.kosdaq)}
      </div>
      <div className="tabular-nums" style={{ color: COLOR.total }}>
        합계 {toJo(p.total)}
      </div>
    </div>
  );
}

export default function MarketTradeValuePage() {
  const [data, setData] = useState<Point[] | null>(null);
  const [error, setError] = useState(false);
  const [range, setRange] = useState<Range>("3M");

  useEffect(() => {
    let alive = true;
    fetch("/api/market-tradevalue")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: Point[]) => {
        if (alive) setData(Array.isArray(json) ? json : []);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const points = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    if (points.length === 0) return [];
    const days = RANGE_DAYS[range];
    if (days === null) return points;
    const lastDate = new Date(points[points.length - 1].date);
    const cutoff = new Date(lastDate);
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return points.filter((p) => p.date >= cutoffStr);
  }, [points, range]);

  const periodText =
    filtered.length > 0 ? `${filtered[0].date} ~ ${filtered[filtered.length - 1].date}` : "-";

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-8 py-20">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">코스피·코스닥 일별 거래대금</h1>
        <p className="mt-2 text-xs text-muted-foreground">
          KRX 정규장 기준 (NXT 미포함) · 데이터: 한국투자증권
        </p>
      </header>

      <div className="mb-3 flex flex-wrap gap-1">
        {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              range === r
                ? "bg-foreground/10 text-foreground border border-foreground/30"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>

      {filtered.length > 0 && (
        <p className="mb-2 text-sm text-muted-foreground">기간 {periodText}</p>
      )}

      <div className="h-[420px] w-full rounded-lg border border-border bg-card p-3">
        {error ? (
          <p className="text-sm text-muted-foreground">데이터를 불러오지 못했습니다.</p>
        ) : data === null ? (
          <p className="text-sm text-muted-foreground">불러오는 중…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">데이터가 없습니다.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={filtered} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.4} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                minTickGap={48}
                tickFormatter={(d: string) => d.slice(2)}
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                width={56}
                tickFormatter={(v: number) => `${(v / 1e12).toFixed(0)}조`}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                verticalAlign="top"
                height={28}
                wrapperStyle={{ fontSize: 12 }}
                formatter={(value) =>
                  value === "kospi" ? "코스피" : value === "kosdaq" ? "코스닥" : "합계"
                }
              />
              <Line
                type="monotone"
                dataKey="kospi"
                name="kospi"
                stroke={COLOR.kospi}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="kosdaq"
                name="kosdaq"
                stroke={COLOR.kosdaq}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="total"
                name="total"
                stroke={COLOR.total}
                strokeWidth={1.8}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        각 시장 하루 거래대금(원)을 조원 단위로 표시합니다. 합계는 코스피 + 코스닥입니다.
      </p>
    </div>
  );
}
