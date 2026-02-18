"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type Time,
} from "lightweight-charts";
import type { OHLCData, TrendlineData } from "@/lib/types/stock";

const TRENDLINE_COLORS: Record<string, string> = {
  support: "#3b82f6",
  resistance: "#ef4444",
  cross: "#f59e0b",
};

interface ChartContainerProps {
  data: OHLCData[];
  trendlines?: TrendlineData[];
}

export function ChartContainer({ data, trendlines = [] }: ChartContainerProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const trendlineSeriesRefs = useRef<ISeriesApi<"Line">[]>([]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "#0a0a0a" },
        textColor: "#a1a1aa",
      },
      grid: {
        vertLines: { color: "#27272a" },
        horzLines: { color: "#27272a" },
      },
      width: container.clientWidth,
      height: 500,
      crosshair: {
        mode: 0,
      },
      timeScale: {
        borderColor: "#3f3f46",
        timeVisible: false,
      },
      rightPriceScale: {
        borderColor: "#3f3f46",
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderDownColor: "#ef4444",
      borderUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      wickUpColor: "#22c55e",
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const handleResize = () => {
      if (container) {
        chart.applyOptions({ width: container.clientWidth });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || data.length === 0) return;

    const candleData: CandlestickData<Time>[] = data.map((d) => ({
      time: d.time as Time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    const volumeData: HistogramData<Time>[] = data.map((d) => ({
      time: d.time as Time,
      value: d.volume,
      color: d.close >= d.open ? "#22c55e80" : "#ef444480",
    }));

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || trendlines.length === 0) return;

    // 기존 추세선 제거
    for (const series of trendlineSeriesRefs.current) {
      chart.removeSeries(series);
    }
    trendlineSeriesRefs.current = [];

    for (const tl of trendlines) {
      const color = TRENDLINE_COLORS[tl.direction] ?? "#a1a1aa";
      // 지지선: 실선, 저항선: 점선, 크로스: 대시
      const lineStyle = tl.direction === "support" ? 0 : tl.direction === "resistance" ? 2 : 1;

      const series = chart.addSeries(LineSeries, {
        color,
        lineWidth: 2,
        lineStyle,
        crosshairMarkerVisible: false,
        priceLineVisible: false,
        lastValueVisible: false,
      });

      const lineData: LineData<Time>[] = tl.points.map((p) => ({
        time: p.time as Time,
        value: p.value,
      }));

      series.setData(lineData);
      trendlineSeriesRefs.current.push(series);
    }
  }, [trendlines]);

  return (
    <div
      ref={chartContainerRef}
      className="w-full rounded-lg border border-zinc-800 overflow-hidden"
    />
  );
}
