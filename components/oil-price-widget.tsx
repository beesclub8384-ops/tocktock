"use client";

import { useEffect, useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type Period = "1Y" | "3Y" | "5Y";

interface HistoryPoint {
  date: string;
  value: number;
}

interface OilSeries {
  current: number;
  change: number;
  changePct: number;
  history: HistoryPoint[];
}

interface OilData {
  brent: OilSeries;
  wti: OilSeries;
  updatedAt: string;
}

const PERIOD_DAYS: Record<Period, number> = {
  "1Y": 365,
  "3Y": 365 * 3,
  "5Y": 365 * 5,
};

function PriceRow({
  label,
  series,
  color,
}: {
  label: string;
  series: OilSeries;
  color: string;
}) {
  // 한국 주식 컬러: 상승=빨강, 하락=파랑
  const isUp = series.change > 0;
  const isZero = series.change === 0;
  const changeColor = isZero
    ? "text-muted-foreground"
    : isUp
      ? "text-red-500"
      : "text-blue-500";

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-[10px] font-medium text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-xs font-semibold tabular-nums">
          ${series.current.toFixed(2)}
        </span>
        <span className={`font-mono text-[10px] tabular-nums ${changeColor}`}>
          {isUp ? "+" : ""}
          {series.change.toFixed(2)} ({isUp ? "+" : ""}
          {series.changePct.toFixed(1)}%)
        </span>
      </div>
    </div>
  );
}

export function OilPriceWidget() {
  const [data, setData] = useState<OilData | null>(null);
  const [period, setPeriod] = useState<Period>("1Y");
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/oil-prices");
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError(true);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const chartData = useMemo(() => {
    if (!data) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - PERIOD_DAYS[period]);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    // 두 시리즈를 날짜 기준으로 병합
    const map = new Map<string, { date: string; brent?: number; wti?: number }>();

    for (const p of data.brent.history) {
      if (p.date >= cutoffStr) {
        map.set(p.date, { date: p.date, brent: p.value });
      }
    }
    for (const p of data.wti.history) {
      if (p.date >= cutoffStr) {
        const existing = map.get(p.date);
        if (existing) {
          existing.wti = p.value;
        } else {
          map.set(p.date, { date: p.date, wti: p.value });
        }
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  }, [data, period]);

  if (error) {
    return (
      <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
        유가 데이터 로딩 실패
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="text-[10px] font-medium text-muted-foreground">
          국제유가 로딩중...
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold">국제유가</span>
        <span className="text-[9px] text-muted-foreground">FRED 일별 기준</span>
      </div>

      {/* 현재가 */}
      <div className="mb-2 space-y-1">
        <PriceRow label="브렌트" series={data.brent} color="#ef4444" />
        <PriceRow label="WTI" series={data.wti} color="#3b82f6" />
      </div>

      {/* 기간 토글 */}
      <div className="mb-1.5 flex gap-1">
        {(["1Y", "3Y", "5Y"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
              period === p
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* 차트 */}
      <div className="h-[120px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9 }}
              tickFormatter={(d: string) => d.slice(0, 4)}
              interval="preserveStartEnd"
              stroke="hsl(var(--muted-foreground))"
            />
            <YAxis
              tick={{ fontSize: 9 }}
              tickFormatter={(v: number) => `$${v}`}
              domain={["auto", "auto"]}
              stroke="hsl(var(--muted-foreground))"
            />
            <Tooltip
              contentStyle={{
                fontSize: 11,
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
              }}
              labelStyle={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={((value: any, name: any) => [
                `$${Number(value).toFixed(2)}`,
                name === "brent" ? "브렌트" : "WTI",
              ]) as any}
            />
            <Legend
              wrapperStyle={{ fontSize: 9 }}
              formatter={(value: string) =>
                value === "brent" ? "브렌트" : "WTI"
              }
            />
            <Line
              type="monotone"
              dataKey="brent"
              stroke="#ef4444"
              dot={false}
              strokeWidth={1.5}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="wti"
              stroke="#3b82f6"
              dot={false}
              strokeWidth={1.5}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
