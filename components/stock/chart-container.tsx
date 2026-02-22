"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import type { OHLCData } from "@/lib/types/stock";

interface ChartContainerProps {
  data: OHLCData[];
  symbol: string;
}

export function ChartContainer({ data, symbol }: ChartContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRefs = useRef<ISeriesApi<any>[]>([]);

  // 차트 생성
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

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
      height: 500,
      crosshair: { mode: 0 },
      timeScale: { borderColor: "#3f3f46", timeVisible: false },
      rightPriceScale: { borderColor: "#3f3f46" },
    });

    chartRef.current = chart;

    const onResize = () => chart.applyOptions({ width: el.clientWidth });
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  // 모든 시리즈를 올바른 순서로 재생성
  const rebuildSeries = useCallback(() => {
    const chart = chartRef.current;
    const el = containerRef.current;
    if (!chart || !el || data.length === 0) return;

    // 기존 시리즈 제거
    for (const s of seriesRefs.current) {
      try { chart.removeSeries(s); } catch { /* already removed */ }
    }
    seriesRefs.current = [];

    // 1) 캔들
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e", downColor: "#ef4444",
      borderDownColor: "#ef4444", borderUpColor: "#22c55e",
      wickDownColor: "#ef4444", wickUpColor: "#22c55e",
    });
    candles.setData(data.map((d) => ({
      time: d.time as Time, open: d.open, high: d.high, low: d.low, close: d.close,
    })));
    seriesRefs.current.push(candles);

    // 2) 거래량
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" }, priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volume.setData(data.map((d) => ({
      time: d.time as Time, value: d.volume,
      color: d.close >= d.open ? "#22c55e80" : "#ef444480",
    })));
    seriesRefs.current.push(volume);

    chart.timeScale().fitContent();
  }, [data]);

  useEffect(() => {
    rebuildSeries();
  }, [rebuildSeries]);

  return (
    <div ref={containerRef} className="w-full rounded-lg border border-zinc-800 overflow-hidden" />
  );
}
