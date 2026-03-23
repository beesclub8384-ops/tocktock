"use client";

import { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useDraggable } from "@/hooks/useDraggable";
import { useResizable } from "@/hooks/useResizable";

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

function buildChartData(
  data: OilData,
  period: Period
): { date: string; brent?: number; wti?: number }[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PERIOD_DAYS[period]);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

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

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function PeriodToggle({
  period,
  onChange,
  size = "sm",
}: {
  period: Period;
  onChange: (p: Period) => void;
  size?: "sm" | "md";
}) {
  const cls =
    size === "md"
      ? "rounded px-2.5 py-1 text-xs font-medium transition-colors"
      : "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors";
  return (
    <div className="flex gap-1">
      {(["1Y", "3Y", "5Y"] as Period[]).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`${cls} ${
            period === p
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-accent"
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

function PriceRow({
  label,
  series,
  color,
}: {
  label: string;
  series: OilSeries;
  color: string;
}) {
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

/* ── 풀스크린 모달 ── */
function OilChartModal({
  data,
  onClose,
}: {
  data: OilData;
  onClose: () => void;
}) {
  const { position, handleMouseDown } = useDraggable();
  const { size, handleResizeMouseDown } = useResizable();
  const [modalPeriod, setModalPeriod] = useState<Period>("1Y");

  const chartData = useMemo(
    () => buildChartData(data, modalPeriod),
    [data, modalPeriod]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-draggable-modal
        className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
          ...(size.width
            ? { width: size.width, height: size.height }
            : { width: "100%", maxWidth: "56rem" }),
        }}
      >
        <div
          className="overflow-y-auto p-6 sm:p-8"
          style={{ maxHeight: size.height ? size.height - 2 : "85vh" }}
        >
          {/* 닫기 */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-10 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X size={20} />
          </button>

          {/* 헤더 */}
          <h2
            className="mb-1 text-xl font-bold cursor-move select-none"
            onMouseDown={handleMouseDown}
          >
            국제유가 시계열
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            브렌트 / WTI ($/배럴)
          </p>

          {/* 현재가 */}
          <div className="mb-4 space-y-1">
            <PriceRow label="브렌트" series={data.brent} color="#ef4444" />
            <PriceRow label="WTI" series={data.wti} color="#3b82f6" />
          </div>

          {/* 토글 */}
          <div className="mb-3">
            <PeriodToggle
              period={modalPeriod}
              onChange={setModalPeriod}
              size="md"
            />
          </div>

          {/* 차트 */}
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
              >
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(d: string) => d.slice(0, 7)}
                  interval="preserveStartEnd"
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `$${v}`}
                  domain={["auto", "auto"]}
                  stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                  }}
                  labelStyle={{
                    fontSize: 11,
                    color: "hsl(var(--muted-foreground))",
                  }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={((value: any, name: any) => [
                    `$${Number(value).toFixed(2)}`,
                    name === "brent" ? "브렌트" : "WTI",
                  ]) as any}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value: string) =>
                    value === "brent" ? "브렌트" : "WTI"
                  }
                />
                <Line
                  type="monotone"
                  dataKey="brent"
                  stroke="#ef4444"
                  dot={false}
                  strokeWidth={2}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="wti"
                  stroke="#3b82f6"
                  dot={false}
                  strokeWidth={2}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 출처 */}
          <p className="mt-3 text-right text-[10px] text-muted-foreground">
            Yahoo Finance 일별 기준
          </p>
        </div>

        {/* 리사이즈 핸들 */}
        <div
          onMouseDown={handleResizeMouseDown}
          className="absolute bottom-0 right-0 cursor-se-resize px-2 py-1 text-xs text-gray-400 hover:text-gray-200 select-none"
        >
          ↔ 크기조절
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ── 사이드바 위젯 (메인) ── */
export function OilPriceWidget() {
  const [data, setData] = useState<OilData | null>(null);
  const [period, setPeriod] = useState<Period>("1Y");
  const [error, setError] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

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

  const chartData = useMemo(
    () => (data ? buildChartData(data, period) : []),
    [data, period]
  );

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
      {isModalOpen && (
        <OilChartModal data={data} onClose={() => setIsModalOpen(false)} />
      )}

      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold">국제유가</span>
        <span className="text-[9px] text-muted-foreground">
          Yahoo Finance 일별 기준
        </span>
      </div>

      {/* 현재가 */}
      <div className="mb-2 space-y-1">
        <PriceRow label="브렌트" series={data.brent} color="#ef4444" />
        <PriceRow label="WTI" series={data.wti} color="#3b82f6" />
      </div>

      {/* 기간 토글 */}
      <div className="mb-1.5">
        <PeriodToggle period={period} onChange={setPeriod} />
      </div>

      {/* 차트 (클릭 시 모달 열기) */}
      <div
        className="relative h-[120px] w-full cursor-pointer"
        onClick={() => setIsModalOpen(true)}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 4, right: 4, bottom: 0, left: -12 }}
          >
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
              labelStyle={{
                fontSize: 10,
                color: "hsl(var(--muted-foreground))",
              }}
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
        {/* 확대 힌트 */}
        <span className="absolute bottom-1 right-1 text-[10px] text-muted-foreground/60">
          ⛶
        </span>
      </div>
    </div>
  );
}
