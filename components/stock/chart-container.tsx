"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import type { OHLCData, ChannelData } from "@/lib/types/stock";

const CHANNEL_STYLES = {
  uptrend: { line: "#3b82f6", fill: "rgba(59, 130, 246, 0.12)", bg: "#0a0a0a" },
  downtrend: { line: "#ef4444", fill: "rgba(239, 68, 68, 0.12)", bg: "#0a0a0a" },
};

interface ChartContainerProps {
  data: OHLCData[];
  channels?: ChannelData[];
  showTrendlines?: boolean;
  showTunnels?: boolean;
}

export function ChartContainer({
  data,
  channels = [],
  showTrendlines = true,
  showTunnels = true,
}: ChartContainerProps) {
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
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || data.length === 0) return;

    // 기존 시리즈 제거
    for (const s of seriesRefs.current) {
      try { chart.removeSeries(s); } catch { /* already removed */ }
    }
    seriesRefs.current = [];

    // 1) 터널 채우기 영역 (가장 뒤)
    if (showTunnels) {
      for (const ch of channels) {
        const style = CHANNEL_STYLES[ch.direction];
        const isUp = ch.direction === "uptrend";
        // 상승: 터널이 위, 메인이 아래 / 하강: 메인이 위, 터널이 아래
        const upperPts = isUp ? ch.tunnelLine : ch.mainLine;
        const lowerPts = isUp ? ch.mainLine : ch.tunnelLine;

        // 상단 채우기
        const upperFill = chart.addSeries(AreaSeries, {
          topColor: style.fill, bottomColor: style.fill,
          lineColor: "transparent", lineWidth: 1,
          crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false,
        });
        upperFill.setData(upperPts.map((p) => ({ time: p.time as Time, value: p.value })));
        seriesRefs.current.push(upperFill);

        // 하단 마스크 (배경색으로 덮기)
        const lowerMask = chart.addSeries(AreaSeries, {
          topColor: style.bg, bottomColor: style.bg,
          lineColor: "transparent", lineWidth: 1,
          crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false,
        });
        lowerMask.setData(lowerPts.map((p) => ({ time: p.time as Time, value: p.value })));
        seriesRefs.current.push(lowerMask);
      }
    }

    // 2) 캔들
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e", downColor: "#ef4444",
      borderDownColor: "#ef4444", borderUpColor: "#22c55e",
      wickDownColor: "#ef4444", wickUpColor: "#22c55e",
    });
    candles.setData(data.map((d) => ({
      time: d.time as Time, open: d.open, high: d.high, low: d.low, close: d.close,
    })));
    seriesRefs.current.push(candles);

    // 3) 거래량
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" }, priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volume.setData(data.map((d) => ({
      time: d.time as Time, value: d.volume,
      color: d.close >= d.open ? "#22c55e80" : "#ef444480",
    })));
    seriesRefs.current.push(volume);

    // 4) 메인 추세선 (실선)
    if (showTrendlines) {
      for (const ch of channels) {
        const line = chart.addSeries(LineSeries, {
          color: CHANNEL_STYLES[ch.direction].line, lineWidth: 1, lineStyle: 0,
          crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false,
        });
        line.setData(ch.mainLine.map((p) => ({ time: p.time as Time, value: p.value })));
        seriesRefs.current.push(line);
      }
    }

    // 5) 터널선 (점선)
    if (showTunnels) {
      for (const ch of channels) {
        const line = chart.addSeries(LineSeries, {
          color: CHANNEL_STYLES[ch.direction].line, lineWidth: 1, lineStyle: 2,
          crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false,
        });
        line.setData(ch.tunnelLine.map((p) => ({ time: p.time as Time, value: p.value })));
        seriesRefs.current.push(line);
      }
    }

    chart.timeScale().fitContent();
  }, [data, channels, showTrendlines, showTunnels]);

  return (
    <div ref={containerRef} className="w-full rounded-lg border border-zinc-800 overflow-hidden" />
  );
}
