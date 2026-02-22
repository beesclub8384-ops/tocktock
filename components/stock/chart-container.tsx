"use client";

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type Time,
} from "lightweight-charts";
import type { OHLCData } from "@/lib/types/stock";
import type { DrawingToolType, DrawingData } from "@/lib/types/drawing";
import { DrawingManager } from "@/lib/drawing/drawing-manager";

interface ChartContainerProps {
  data: OHLCData[];
  symbol: string;
  activeTool: DrawingToolType;
  onSelectionChange: (id: string | null) => void;
  onContextMenu: (x: number, y: number, id: string) => void;
  onToolReset: () => void;
  isAdmin: boolean;
  adminPassword: string | null;
}

export interface ChartContainerHandle {
  deleteDrawing: (id: string) => void;
  changeColor: (id: string, color: string) => void;
}

export const ChartContainer = forwardRef<ChartContainerHandle, ChartContainerProps>(
  function ChartContainer(
    {
      data,
      symbol,
      activeTool,
      onSelectionChange,
      onContextMenu,
      onToolReset,
      isAdmin,
      adminPassword,
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

    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingSaveRef = useRef<{ drawings: DrawingData[]; sym: string } | null>(null);
    const adminPasswordRef = useRef(adminPassword);
    adminPasswordRef.current = adminPassword;

    // 서버에서 드로잉 로드
    const [initialDrawings, setInitialDrawings] = useState<DrawingData[] | null>(null);

    useEffect(() => {
      setInitialDrawings(null);
      fetch(`/api/stock/${encodeURIComponent(symbol)}/drawings`)
        .then((res) => res.json())
        .then((data) => setInitialDrawings(data.drawings ?? []))
        .catch(() => setInitialDrawings([]));
    }, [symbol]);

    // 디바운스 서버 저장
    const handleSave = useCallback((drawings: DrawingData[]) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      pendingSaveRef.current = { drawings, sym: symbol };
      saveTimeoutRef.current = setTimeout(async () => {
        pendingSaveRef.current = null;
        saveTimeoutRef.current = null;
        try {
          await fetch(`/api/stock/${encodeURIComponent(symbol)}/drawings`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "x-admin-password": adminPasswordRef.current ?? "",
            },
            body: JSON.stringify({ version: 1, drawings }),
          });
        } catch { /* 저장 실패 무시 — 다음 저장 시 재시도 */ }
      }, 300);
    }, [symbol]);

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
        // 대기 중인 저장이 있으면 즉시 실행
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        if (pendingSaveRef.current) {
          const { drawings, sym } = pendingSaveRef.current;
          pendingSaveRef.current = null;
          fetch(`/api/stock/${encodeURIComponent(sym)}/drawings`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "x-admin-password": adminPasswordRef.current ?? "",
            },
            body: JSON.stringify({ version: 1, drawings }),
          }).catch(() => {});
        }
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
      if (!chart || !el || data.length === 0 || initialDrawings === null) return;

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
            onSave: isAdmin ? handleSave : undefined,
          },
          initialDrawings,
          readOnly: !isAdmin,
        });
      } else {
        managerRef.current.reattachAll(candles as ISeriesApi<SeriesType>);
      }

      chart.timeScale().fitContent();
    }, [data, symbol, initialDrawings, isAdmin, handleSave]);

    useEffect(() => {
      rebuildSeries();
    }, [rebuildSeries]);

    return (
      <div ref={containerRef} className="w-full rounded-lg border border-zinc-800 overflow-hidden" />
    );
  }
);
