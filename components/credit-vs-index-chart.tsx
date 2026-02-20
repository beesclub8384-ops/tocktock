"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  ColorType,
  LineSeries,
  type IChartApi,
  type Time,
} from "lightweight-charts";
import type { CreditVsIndexItem } from "@/app/api/credit-vs-index/route";

type Mode = "kospi" | "kosdaq";

const COLORS = {
  index: "#3b82f6",  // blue — 지수
  loan: "#ef4444",   // red — 신용융자
} as const;

const MODE_LABELS: Record<Mode, { index: string; loan: string }> = {
  kospi: { index: "코스피 지수", loan: "코스피 신용융자" },
  kosdaq: { index: "코스닥 지수", loan: "코스닥 신용융자" },
};

export function CreditVsIndexChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [data, setData] = useState<CreditVsIndexItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("kospi");

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/credit-vs-index");
        if (!res.ok) throw new Error("Failed to fetch");
        const json = await res.json();
        setData(json.data);
      } catch {
        setError("데이터를 불러오는데 실패했습니다.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const buildChart = useCallback(() => {
    const el = containerRef.current;
    if (!el || !data || data.length === 0) return;

    // 기존 차트 제거
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "#0a0a0a" },
        textColor: "#a1a1aa",
      },
      grid: {
        vertLines: { color: "#27272a" },
        horzLines: { color: "#27272a" },
      },
      width: el.clientWidth,
      height: 400,
      timeScale: { borderColor: "#3f3f46", timeVisible: false },
      rightPriceScale: { borderColor: "#3f3f46" },
      leftPriceScale: { borderColor: "#3f3f46", visible: true },
    });

    chartRef.current = chart;

    // 왼쪽 Y축: 지수 (파란색)
    const indexSeries = chart.addSeries(LineSeries, {
      color: COLORS.index,
      lineWidth: 2,
      title: "",
      priceScaleId: "left",
      priceFormat: {
        type: "custom",
        formatter: (price: number) => price.toFixed(0),
      },
    });

    // 오른쪽 Y축: 신용융자 (빨간색)
    const loanSeries = chart.addSeries(LineSeries, {
      color: COLORS.loan,
      lineWidth: 2,
      title: "",
      priceScaleId: "right",
      priceFormat: {
        type: "custom",
        formatter: (price: number) => price.toLocaleString() + "억",
      },
    });

    if (mode === "kospi") {
      indexSeries.setData(
        data.map((d) => ({ time: d.date as Time, value: d.kospiClose }))
      );
      loanSeries.setData(
        data.map((d) => ({ time: d.date as Time, value: d.kospiLoan }))
      );
    } else {
      indexSeries.setData(
        data.map((d) => ({ time: d.date as Time, value: d.kosdaqClose }))
      );
      loanSeries.setData(
        data.map((d) => ({ time: d.date as Time, value: d.kosdaqLoan }))
      );
    }

    chart.timeScale().fitContent();

    const onResize = () => chart.applyOptions({ width: el.clientWidth });
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [data, mode]);

  useEffect(() => {
    const cleanup = buildChart();
    return cleanup;
  }, [buildChart]);

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center rounded-xl border border-border bg-card text-muted-foreground">
        데이터 로딩 중...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[400px] items-center justify-center rounded-xl border border-border bg-card text-red-400">
        {error}
      </div>
    );
  }

  const labels = MODE_LABELS[mode];

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      {/* 상단: 토글 + 범례 */}
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        {/* 토글 버튼 */}
        <div className="inline-flex rounded-lg border border-border">
          <button
            onClick={() => setMode("kospi")}
            className={`rounded-l-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === "kospi"
                ? "bg-blue-600 text-white"
                : "bg-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            코스피
          </button>
          <button
            onClick={() => setMode("kosdaq")}
            className={`rounded-r-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === "kosdaq"
                ? "bg-blue-600 text-white"
                : "bg-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            코스닥
          </button>
        </div>

        {/* 범례 */}
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: COLORS.index }}
          />
          {labels.index} (좌축)
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: COLORS.loan }}
          />
          {labels.loan} (우축, 억원)
        </span>
      </div>

      {/* 차트 */}
      <div ref={containerRef} className="w-full overflow-hidden rounded-lg" />
    </div>
  );
}
