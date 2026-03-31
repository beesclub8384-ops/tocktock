"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { MarketEvent } from "@/lib/types/market-events";

interface OHLCPoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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
  type Period = "1M" | "3M" | "6M" | "1Y";
  const [period, setPeriod] = useState<Period>("3M");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candleSeriesRef = useRef<any>(null);
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const onMarkerClickRef = useRef(onMarkerClick);
  onMarkerClickRef.current = onMarkerClick;
  const ohlcMapRef = useRef<Map<string, OHLCPoint>>(new Map());

  // 마커를 HTML로 그리는 함수
  const drawMarkers = useCallback(() => {
    const overlay = overlayRef.current;
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!overlay || !chart || !series) return;

    // 기존 마커 전부 제거
    overlay.innerHTML = "";

    const symbolEvents = eventsRef.current
      .filter((e) => e.symbol === symbol)
      .filter((e) => ohlcMapRef.current.has(e.date));

    for (const evt of symbolEvents) {
      const ohlc = ohlcMapRef.current.get(evt.date);
      if (!ohlc) continue;

      const x = chart.timeScale().timeToCoordinate(evt.date);
      if (x === null || x === undefined) continue;

      const isUp = evt.changePercent > 0;
      const price = isUp ? ohlc.high : ohlc.low;
      const y = series.priceToCoordinate(price);
      if (y === null || y === undefined) continue;

      const offsetY = isUp ? -20 : 20;

      const btn = document.createElement("button");
      btn.style.position = "absolute";
      btn.style.left = `${x}px`;
      btn.style.top = `${y + offsetY}px`;
      btn.style.transform = "translate(-50%, -50%)";
      btn.style.width = "14px";
      btn.style.height = "14px";
      btn.style.borderRadius = "50%";
      btn.style.backgroundColor = isUp ? "#10b981" : "#ef4444";
      btn.style.border = "1px solid white";
      btn.style.color = "white";
      btn.style.fontSize = "6px";
      btn.style.fontWeight = "bold";
      btn.style.cursor = "pointer";
      btn.style.display = "flex";
      btn.style.alignItems = "center";
      btn.style.justifyContent = "center";
      btn.style.pointerEvents = "auto";
      btn.style.boxShadow = "0 1px 3px rgba(0,0,0,0.4)";
      btn.style.lineHeight = "1";
      btn.style.padding = "0";
      btn.textContent = isUp ? "▲" : "▼";
      btn.title = `${evt.date} ${evt.name} ${isUp ? "+" : ""}${evt.changePercent.toFixed(2)}%`;

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        onMarkerClickRef.current(evt);
      });

      overlay.appendChild(btn);
    }
  }, [symbol]);

  const initChart = useCallback(async () => {
    if (!chartContainerRef.current || ohlcData.length === 0) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    }

    // OHLC 맵 구축
    ohlcMapRef.current = new Map(ohlcData.map((d) => [d.time, d]));

    const { createChart, CrosshairMode } = await import("lightweight-charts");

    const container = chartContainerRef.current;
    const chartHeight = window.innerWidth < 640 ? 160 : 220;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: chartHeight,
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
    candleSeriesRef.current = candleSeries;

    // 거래량 바
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    console.log("volume sample:", ohlcData.slice(0, 3));
    volumeSeries.setData(
      ohlcData.map((d) => ({
        time: d.time,
        value: d.volume,
        color:
          d.close >= d.open
            ? "rgba(38,166,154,0.5)"
            : "rgba(239,83,80,0.5)",
      }))
    );

    // 오버레이 높이를 차트에 맞춤
    if (overlayRef.current) {
      overlayRef.current.style.height = `${chartHeight}px`;
    }

    // 기간에 따른 범위 설정
    const PERIOD_DAYS: Record<string, number> = { "1M": 30, "3M": 90, "6M": 180, "1Y": 365 };
    const days = PERIOD_DAYS[period] ?? 90;
    const nowSec = Math.floor(Date.now() / 1000);
    const fromSec = nowSec - days * 24 * 3600;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chart.timeScale().setVisibleRange({ from: fromSec as any, to: nowSec as any });
    } catch {
      chart.timeScale().fitContent();
    }

    // 초기 마커 그리기 (범위 설정 이후 레이아웃 완료를 기다림)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        drawMarkers();
      });
    });

    // 스크롤/줌 시 마커 위치 재계산
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      drawMarkers();
    });

    // ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0) {
          chart.applyOptions({ width });
          drawMarkers();
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [ohlcData, symbol, period, drawMarkers]);

  useEffect(() => {
    const cleanup = initChart();
    return () => {
      cleanup?.then((fn) => fn?.());
    };
  }, [initChart]);

  return (
    <div ref={wrapperRef} className="relative w-full overflow-x-hidden" style={{ minHeight: 160 }}>
      <div className="flex gap-1 mb-2">
        {(["1M", "3M", "6M", "1Y"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`text-xs px-2 py-1 rounded ${
              period === p
                ? "bg-zinc-600 text-white"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {p}
          </button>
        ))}
      </div>
      <div ref={chartContainerRef} className="w-full overflow-x-hidden" />
      <div
        ref={overlayRef}
        className="absolute top-0 left-0 w-full z-10 overflow-x-hidden"
        style={{ pointerEvents: "none" }}
      />
    </div>
  );
}
