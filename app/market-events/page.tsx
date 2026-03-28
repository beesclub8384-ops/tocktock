"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import type { MarketEvent } from "@/lib/types/market-events";

const REFRESH_MS = 30_000;

type Filter = "전체" | "S&P 500" | "나스닥" | "코스피" | "코스닥";
const FILTERS: Filter[] = ["전체", "S&P 500", "나스닥", "코스피", "코스닥"];

const FILTER_SYMBOL_MAP: Record<Filter, string | null> = {
  전체: null,
  "S&P 500": "^GSPC",
  나스닥: "^IXIC",
  코스피: "^KS11",
  코스닥: "^KQ11",
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function formatFullDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface ChartPoint {
  index: number;
  date: string;
  name: string;
  changePercent: number;
  symbol: string;
  eventIdx: number;
}

function ChartTooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-xs">
      <p className="font-medium text-foreground">
        {formatFullDate(p.date)} · {p.name}
      </p>
      <p
        className={`mt-1 font-mono font-semibold ${p.changePercent >= 0 ? "text-emerald-500" : "text-red-500"}`}
      >
        {p.changePercent > 0 ? "+" : ""}
        {p.changePercent.toFixed(2)}%
      </p>
    </div>
  );
}

export default function MarketEventsPage() {
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("전체");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/market-events");
      if (!res.ok) throw new Error("API 오류");
      const json = await res.json();
      setEvents(json.events || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터 로드 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  // 필터 적용
  const filtered =
    filter === "전체"
      ? events
      : events.filter((e) => e.symbol === FILTER_SYMBOL_MAP[filter]);

  // 차트 데이터 (최근 60개)
  const chartEvents = filtered.slice(0, 60).reverse();
  const chartData: ChartPoint[] = chartEvents.map((e, i) => ({
    index: i,
    date: e.date,
    name: e.name,
    changePercent: e.changePercent,
    symbol: e.symbol,
    eventIdx: filtered.length - 1 - (chartEvents.length - 1 - i),
  }));

  // 카드 목록 (필터 적용된 전체)
  const cardEvents = filtered;

  return (
    <main className="max-w-5xl mx-auto px-4 py-12 sm:px-8 sm:py-20">
      <header className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          지수 급등락 원인 분석
        </h1>
        <p className="mt-2 text-muted-foreground">
          ±1.5% 이상 움직인 날의 원인을 AI가 자동으로 분석합니다
        </p>
      </header>

      {/* 필터 탭 */}
      <div className="flex flex-wrap gap-1.5 mb-8">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => {
              setFilter(f);
              setSelectedIdx(null);
            }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === f
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* 로딩 */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          데이터를 불러오는 중...
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="py-20 text-center text-red-500">
          데이터를 불러오지 못했습니다: {error}
        </div>
      )}

      {/* 데이터 없음 */}
      {!loading && !error && filtered.length === 0 && (
        <div className="py-20 text-center text-muted-foreground">
          아직 분석된 데이터가 없습니다. 매일 장 마감 후 자동으로
          업데이트됩니다.
        </div>
      )}

      {/* 차트 + 카드 */}
      {!loading && !error && filtered.length > 0 && (
        <>
          {/* 차트 */}
          <div className="rounded-lg border border-border bg-card p-4 mb-6">
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  dataKey="index"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(i: number) =>
                    chartData[i] ? formatDate(chartData[i].date) : ""
                  }
                  interval="preserveStartEnd"
                  minTickGap={40}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v}%`}
                  width={52}
                />
                <ReferenceLine y={0} stroke="hsl(var(--border))" />
                <Tooltip content={<ChartTooltipContent />} />
                <Scatter
                  data={chartData}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onClick={(point: any) => {
                    if (point?.eventIdx != null) setSelectedIdx(point.eventIdx);
                  }}
                  cursor="pointer"
                >
                  {chartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={
                        entry.changePercent >= 0 ? "#10b981" : "#ef4444"
                      }
                      r={
                        selectedIdx === entry.eventIdx ? 8 : 5
                      }
                      stroke={
                        selectedIdx === entry.eventIdx
                          ? "hsl(var(--foreground))"
                          : "none"
                      }
                      strokeWidth={selectedIdx === entry.eventIdx ? 2 : 0}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* 선택된 이벤트 요약 (차트 바로 아래) */}
          {selectedIdx !== null && filtered[selectedIdx] && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  {formatFullDate(filtered[selectedIdx].date)} ·{" "}
                  {filtered[selectedIdx].name}
                </span>
                <span
                  className={`font-mono text-sm font-semibold ${
                    filtered[selectedIdx].changePercent >= 0
                      ? "text-emerald-500"
                      : "text-red-500"
                  }`}
                >
                  {filtered[selectedIdx].changePercent > 0 ? "+" : ""}
                  {filtered[selectedIdx].changePercent.toFixed(2)}%
                </span>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                {filtered[selectedIdx].summary}
              </p>
            </div>
          )}

          {/* 카드 목록 */}
          <div className="space-y-3">
            {cardEvents.map((event, i) => (
              <button
                key={`${event.date}-${event.symbol}`}
                onClick={() => setSelectedIdx(i)}
                className={`w-full text-left rounded-lg border p-4 transition-colors ${
                  selectedIdx === i
                    ? "border-foreground/40 bg-muted/30"
                    : "border-border hover:bg-muted/20"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {formatFullDate(event.date)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {event.name}
                    </span>
                  </div>
                  <span
                    className={`font-mono text-sm font-semibold tabular-nums ${
                      event.changePercent >= 0
                        ? "text-emerald-500"
                        : "text-red-500"
                    }`}
                  >
                    {event.changePercent > 0 ? "+" : ""}
                    {event.changePercent.toFixed(2)}%
                  </span>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                  {event.summary}
                </p>
              </button>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
