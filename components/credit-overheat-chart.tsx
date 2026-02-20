"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  LineSeries,
  type IChartApi,
  type Time,
} from "lightweight-charts";
import type { OverheatIndexResponse } from "@/lib/types/credit-balance";

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
  safe: { text: "안전 구간", color: "#22c55e" },
  caution: { text: "주의 구간", color: "#eab308" },
  danger: { text: "위험 구간", color: "#ef4444" },
};

export function CreditOverheatChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [response, setResponse] = useState<OverheatIndexResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/credit-overheat");
        if (!res.ok) throw new Error("Failed to fetch");
        const json: OverheatIndexResponse = await res.json();
        setResponse(json);
      } catch {
        setError("데이터를 불러오는데 실패했습니다.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !response || response.data.length === 0) return;

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
      height: 300,
      timeScale: { borderColor: "#3f3f46", timeVisible: false },
      rightPriceScale: { borderColor: "#3f3f46" },
    });

    chartRef.current = chart;

    const series = chart.addSeries(LineSeries, {
      color: "#a855f7",
      lineWidth: 2,
      title: "과열지수",
    });

    series.setData(
      response.data.map((d) => ({ time: d.date as Time, value: d.index }))
    );

    // 주의선 (평균)
    series.createPriceLine({
      price: response.stats.cautionLine,
      color: "#eab308",
      lineWidth: 1,
      lineStyle: 1, // dashed
      axisLabelVisible: true,
      title: "주의",
    });

    // 위험선 (평균 + 1σ)
    series.createPriceLine({
      price: response.stats.dangerLine,
      color: "#ef4444",
      lineWidth: 1,
      lineStyle: 1,
      axisLabelVisible: true,
      title: "위험",
    });

    chart.timeScale().fitContent();

    const onResize = () => chart.applyOptions({ width: el.clientWidth });
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [response]);

  if (loading) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-xl border border-border bg-card text-muted-foreground">
        데이터 로딩 중...
      </div>
    );
  }

  if (error || !response) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-xl border border-border bg-card text-red-400">
        {error ?? "데이터를 불러오는데 실패했습니다."}
      </div>
    );
  }

  const { stats } = response;
  const statusInfo = STATUS_LABELS[stats.status];

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      {/* 상단: 현재 상태 */}
      <div className="mb-4 text-sm">
        <span className="text-muted-foreground">현재 과열지수 </span>
        <span className="font-semibold text-foreground">{stats.current}</span>
        <span className="text-muted-foreground"> — </span>
        <span className="font-semibold" style={{ color: statusInfo.color }}>
          {statusInfo.text}
        </span>
      </div>

      {/* 차트 */}
      <div ref={containerRef} className="w-full overflow-hidden rounded-lg" />

      {/* 하단: 범례 */}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
          안전 (&lt; {stats.cautionLine})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-500" />
          주의 ({stats.cautionLine} ~ {stats.dangerLine})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
          위험 (&gt; {stats.dangerLine})
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: "#a855f7" }}
          />
          {response.source === "marketCap"
            ? "과열지수 = 융자잔고(억) / 시가총액(조)"
            : "과열지수 = 융자잔고(억) / 지수합계 (근사치)"}
        </span>
      </div>
      {response.source === "indexClose" && (
        <p className="mt-2 text-[11px] text-muted-foreground/60">
          * 시가총액 API 미연결 상태로 지수 종가 기반 근사치를 표시합니다.
        </p>
      )}
    </div>
  );
}
