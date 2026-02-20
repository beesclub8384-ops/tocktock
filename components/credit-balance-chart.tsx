"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  LineSeries,
  type IChartApi,
  type Time,
} from "lightweight-charts";
import type { CreditBalanceItem } from "@/lib/types/credit-balance";

const LINE_COLORS = {
  total: "#3b82f6",   // blue
  kospi: "#22c55e",   // green
  kosdaq: "#f59e0b",  // amber
} as const;

export function CreditBalanceChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [data, setData] = useState<CreditBalanceItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 데이터 fetch
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/credit-balance");
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

  // 차트 생성
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !data || data.length === 0) return;

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
    });

    chartRef.current = chart;

    // 전체 융자
    const totalSeries = chart.addSeries(LineSeries, {
      color: LINE_COLORS.total,
      lineWidth: 2,
      title: "전체",
    });
    totalSeries.setData(
      data.map((d) => ({ time: d.date as Time, value: d.totalLoan }))
    );

    // KOSPI 융자
    const kospiSeries = chart.addSeries(LineSeries, {
      color: LINE_COLORS.kospi,
      lineWidth: 2,
      title: "KOSPI",
    });
    kospiSeries.setData(
      data.map((d) => ({ time: d.date as Time, value: d.kospiLoan }))
    );

    // KOSDAQ 융자
    const kosdaqSeries = chart.addSeries(LineSeries, {
      color: LINE_COLORS.kosdaq,
      lineWidth: 2,
      title: "KOSDAQ",
    });
    kosdaqSeries.setData(
      data.map((d) => ({ time: d.date as Time, value: d.kosdaqLoan }))
    );

    chart.timeScale().fitContent();

    const onResize = () => chart.applyOptions({ width: el.clientWidth });
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [data]);

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

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: LINE_COLORS.total }}
          />
          전체
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: LINE_COLORS.kospi }}
          />
          KOSPI
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: LINE_COLORS.kosdaq }}
          />
          KOSDAQ
        </span>
        <span className="ml-auto text-muted-foreground">단위: 억원</span>
      </div>
      <div ref={containerRef} className="w-full overflow-hidden rounded-lg" />
    </div>
  );
}
