"use client";

import { useEffect, useRef, useCallback } from "react";
import type { MarketEvent } from "@/lib/types/market-events";

interface OHLCPoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface CandlestickChartProps {
  symbol: string;
  ohlcData: OHLCPoint[];
  events: MarketEvent[];
  onMarkerClick: (event: MarketEvent) => void;
}

export function CandlestickChart({
  symbol,
  ohlcData,
  events,
  onMarkerClick,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const onMarkerClickRef = useRef(onMarkerClick);
  onMarkerClickRef.current = onMarkerClick;

  const initChart = useCallback(async () => {
    if (!containerRef.current || ohlcData.length === 0) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const { createChart, CrosshairMode } = await import("lightweight-charts");

    const container = containerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: window.innerWidth < 640 ? 280 : 400,
      layout: {
        background: { color: "transparent" },
        textColor: "#9ca3af",
      },
      grid: {
        vertLines: { color: "#1f2937" },
        horzLines: { color: "#1f2937" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      timeScale: {
        borderColor: "#1f2937",
        timeVisible: false,
      },
      rightPriceScale: {
        borderColor: "#1f2937",
      },
    });

    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#10b981",
      downColor: "#ef4444",
      borderUpColor: "#10b981",
      borderDownColor: "#ef4444",
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });

    candleSeries.setData(ohlcData);

    // 이벤트를 마커로 표시
    const symbolEvents = eventsRef.current
      .filter((e) => e.symbol === symbol)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (symbolEvents.length > 0) {
      const ohlcSet = new Set(ohlcData.map((d) => d.time));
      const markers = symbolEvents
        .filter((e) => ohlcSet.has(e.date))
        .map((e) => ({
          time: e.date,
          position:
            e.changePercent > 0
              ? ("aboveBar" as const)
              : ("belowBar" as const),
          color: e.changePercent > 0 ? "#10b981" : "#ef4444",
          shape:
            e.changePercent > 0
              ? ("arrowUp" as const)
              : ("arrowDown" as const),
          text:
            (e.changePercent > 0 ? "+" : "") +
            e.changePercent.toFixed(1) +
            "%",
        }));

      if (markers.length > 0) {
        candleSeries.setMarkers(markers);
      }
    }

    chart.timeScale().fitContent();

    // 클릭 이벤트
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chart.subscribeClick((param: any) => {
      if (!param.time) return;
      const clickedDate = String(param.time);
      const matchedEvent = eventsRef.current.find(
        (e) => e.date === clickedDate && e.symbol === symbol
      );
      if (matchedEvent) {
        onMarkerClickRef.current(matchedEvent);
      }
    });

    // ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0) {
          chart.applyOptions({ width });
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [ohlcData, symbol]);

  useEffect(() => {
    const cleanup = initChart();
    return () => {
      cleanup?.then((fn) => fn?.());
    };
  }, [initChart]);

  return (
    <div
      ref={containerRef}
      className="w-full"
      style={{ height: "auto", minHeight: 280 }}
    />
  );
}
