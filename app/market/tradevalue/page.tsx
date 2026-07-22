"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Brush,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface Point {
  date: string; // YYYY-MM-DD
  kospi: number; // 원
  kosdaq: number; // 원
  total: number; // 원
  kospiIndex?: number; // 코스피 지수 종가(포인트)
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

// 하단(지수+거래대금) 차트 색상
const INDEX_LINE = "#dc2626"; // 코스피 지수 (빨강)
const INDEX_BAR = "#93c5fd"; // 코스피 거래대금 (연한 파랑)

function fmtIndex(n?: number): string {
  return n == null ? "-" : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function IndexTooltip({ active, payload }: TipProps) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-background/95 px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium">{p.date}</div>
      <div className="tabular-nums" style={{ color: INDEX_LINE }}>
        코스피 지수 {fmtIndex(p.kospiIndex)}
      </div>
      <div className="tabular-nums" style={{ color: "#2563eb" }}>
        코스피 거래대금 {toJo(p.kospi)}
      </div>
    </div>
  );
}

export default function MarketTradeValuePage() {
  const [data, setData] = useState<Point[] | null>(null);
  const [error, setError] = useState(false);
  const [range, setRange] = useState<Range>("3M");
  const [rangeBottom, setRangeBottom] = useState<Range>("3M"); // 하단 차트 전용(상단과 독립)

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

  // 하단 차트 전용 필터 (상단 filtered 로직과 동일, rangeBottom 기준)
  const filteredBottom = useMemo(() => {
    if (points.length === 0) return [];
    const days = RANGE_DAYS[rangeBottom];
    if (days === null) return points;
    const lastDate = new Date(points[points.length - 1].date);
    const cutoff = new Date(lastDate);
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return points.filter((p) => p.date >= cutoffStr);
  }, [points, rangeBottom]);

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
              {/* 기간 조절 슬라이더: 버튼으로 고른 범위 안에서 마우스로 추가로 좁혀보기 */}
              <Brush
                dataKey="date"
                height={28}
                stroke="#9ca3af"
                travellerWidth={10}
                tickFormatter={(d: string) => (typeof d === "string" ? d.slice(2) : d)}
              >
                {/* 미니 프리뷰: 합계(total) 선 하나만 얇게 */}
                <LineChart>
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke={COLOR.total}
                    strokeWidth={1}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </Brush>
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        각 시장 하루 거래대금(원)을 조원 단위로 표시합니다. 합계는 코스피 + 코스닥입니다.
      </p>

      {/* 하단: 코스피 지수 + 거래대금 (이중축). 전용 rangeBottom 상태로 상단과 독립 동작 */}
      <h2 className="mt-10 mb-2 text-lg font-semibold tracking-tight">코스피 지수 · 거래대금</h2>

      {/* 하단 전용 기간 버튼 (상단과 별개: rangeBottom/setRangeBottom) */}
      <div className="mb-3 flex flex-wrap gap-1">
        {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRangeBottom(r)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              rangeBottom === r
                ? "bg-foreground/10 text-foreground border border-foreground/30"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>

      <div className="h-[420px] w-full rounded-lg border border-border bg-card p-3">
        {error ? (
          <p className="text-sm text-muted-foreground">데이터를 불러오지 못했습니다.</p>
        ) : data === null ? (
          <p className="text-sm text-muted-foreground">불러오는 중…</p>
        ) : filteredBottom.length === 0 ? (
          <p className="text-sm text-muted-foreground">데이터가 없습니다.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={filteredBottom} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.4} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                minTickGap={48}
                tickFormatter={(d: string) => d.slice(2)}
              />
              {/* 왼쪽 축: 코스피 지수(포인트) */}
              <YAxis
                yAxisId="left"
                domain={["auto", "auto"]}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                width={48}
                tickFormatter={(v: number) => v.toFixed(0)}
              />
              {/* 오른쪽 축: 코스피 거래대금(조원) */}
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={["auto", "auto"]}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                width={48}
                tickFormatter={(v: number) => `${(v / 1e12).toFixed(0)}조`}
              />
              <Tooltip content={<IndexTooltip />} />
              {/* Bar 먼저(뒤), Line 나중(위) */}
              <Bar
                yAxisId="right"
                dataKey="kospi"
                fill={INDEX_BAR}
                fillOpacity={0.6}
                isAnimationActive={false}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="kospiIndex"
                stroke={INDEX_LINE}
                strokeWidth={1.8}
                dot={false}
                isAnimationActive={false}
              />
              {/* 하단 전용 슬라이더 (상단 Brush와 독립) */}
              <Brush
                dataKey="date"
                height={28}
                stroke="#9ca3af"
                travellerWidth={10}
                tickFormatter={(d: string) => (typeof d === "string" ? d.slice(2) : d)}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        빨간 선 = 코스피 지수(포인트, 왼쪽 축) · 연파랑 막대 = 코스피 거래대금(조원, 오른쪽 축). 이 차트의 기간 버튼·슬라이더는 위 차트와 독립적으로 동작합니다.
      </p>
    </div>
  );
}
