"use client";

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type Time,
} from "lightweight-charts";
import type { OHLCData, ChannelData } from "@/lib/types/stock";
import type { DrawingToolType } from "@/lib/types/drawing";
import { DrawingManager } from "@/lib/drawing/drawing-manager";

const CHANNEL_STYLES = {
  uptrend: { line: "#3b82f6", fill: "rgba(59, 130, 246, 0.12)", bg: "#0a0a0a" },
  downtrend: { line: "#ef4444", fill: "rgba(239, 68, 68, 0.12)", bg: "#0a0a0a" },
};

interface ChartContainerProps {
  data: OHLCData[];
  channels?: ChannelData[];
  showTrendlines?: boolean;
  showTunnels?: boolean;
  symbol: string;
  activeTool: DrawingToolType;
  onSelectionChange: (id: string | null) => void;
  onContextMenu: (x: number, y: number, id: string) => void;
  onToolReset: () => void;
}

export interface ChartContainerHandle {
  deleteDrawing: (id: string) => void;
  changeColor: (id: string, color: string) => void;
}

export const ChartContainer = forwardRef<ChartContainerHandle, ChartContainerProps>(
  function ChartContainer(
    {
      data,
      channels = [],
      showTrendlines = true,
      showTunnels = true,
      symbol,
      activeTool,
      onSelectionChange,
      onContextMenu,
      onToolReset,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seriesRefs = useRef<ISeriesApi<any>[]>([]);
    const managerRef = useRef<DrawingManager | null>(null);
    const callbacksRef = useRef({ onSelectionChange, onContextMenu, onToolReset });
    callbacksRef.current = { onSelectionChange, onContextMenu, onToolReset };

    useImperativeHandle(ref, () => ({
      deleteDrawing: (id: string) => managerRef.current?.deleteDrawing(id),
      changeColor: (id: string, color: string) => managerRef.current?.changeColor(id, color),
    }));

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
        managerRef.current?.destroy();
        managerRef.current = null;
        chart.remove();
        chartRef.current = null;
      };
    }, []);

    // 도구 변경 시 매니저에 전달
    useEffect(() => {
      managerRef.current?.setActiveTool(activeTool);
    }, [activeTool]);

    // 커서 변경
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      el.style.cursor = activeTool ? "crosshair" : "";
    }, [activeTool]);

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

      // 1) 터널 채우기 영역 (가장 뒤)
      if (showTunnels) {
        for (const ch of channels) {
          const style = CHANNEL_STYLES[ch.direction];
          const isUp = ch.direction === "uptrend";
          const upperPts = isUp ? ch.tunnelLine : ch.mainLine;
          const lowerPts = isUp ? ch.mainLine : ch.tunnelLine;

          const upperFill = chart.addSeries(AreaSeries, {
            topColor: style.fill, bottomColor: style.fill,
            lineColor: "transparent", lineWidth: 1,
            crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false,
          });
          upperFill.setData(upperPts.map((p) => ({ time: p.time as Time, value: p.value })));
          seriesRefs.current.push(upperFill);

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

      // DrawingManager 초기화 또는 reattach
      if (!managerRef.current) {
        managerRef.current = new DrawingManager({
          chart,
          series: candles as ISeriesApi<SeriesType>,
          symbol,
          containerEl: el,
          callbacks: {
            onSelectionChange: (id) => callbacksRef.current.onSelectionChange(id),
            onContextMenu: (x, y, id) => callbacksRef.current.onContextMenu(x, y, id),
            onToolReset: () => callbacksRef.current.onToolReset(),
          },
        });
      } else {
        managerRef.current.reattachAll(candles as ISeriesApi<SeriesType>);
      }

      chart.timeScale().fitContent();
    }, [data, channels, showTrendlines, showTunnels, symbol]);

    useEffect(() => {
      rebuildSeries();
    }, [rebuildSeries]);

    return (
      <div ref={containerRef} className="w-full rounded-lg border border-zinc-800 overflow-hidden" />
    );
  }
);
