"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChartContainer, type ChartContainerHandle } from "./chart-container";
import { DrawingToolbar } from "./drawing-toolbar";
import { DrawingContextMenu } from "./drawing-context-menu";
import { StockSearch } from "./stock-search";
import type {
  ChartInterval,
  OHLCData,
  StockChartResponse,
  ChannelData,
  TrendlineResponse,
} from "@/lib/types/stock";
import type { DrawingToolType } from "@/lib/types/drawing";

const INTERVALS: { value: ChartInterval; label: string }[] = [
  { value: "1d", label: "일봉" },
  { value: "1wk", label: "주봉" },
  { value: "1mo", label: "월봉" },
];

interface StockChartProps {
  symbol: string;
}

export function StockChart({ symbol }: StockChartProps) {
  const [interval, setInterval] = useState<ChartInterval>("1wk");
  const [data, setData] = useState<OHLCData[]>([]);
  const [channels, setChannels] = useState<ChannelData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI 컨트롤
  const [pivotN, setPivotN] = useState(10);
  const [dropThreshold, setDropThreshold] = useState(-30);
  const [tunnelTolerance, setTunnelTolerance] = useState(2);
  const [showTrendlines, setShowTrendlines] = useState(true);
  const [showTunnels, setShowTunnels] = useState(true);

  // 드로잉 상태
  const [activeTool, setActiveTool] = useState<DrawingToolType>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string } | null>(null);

  const chartRef = useRef<ChartContainerHandle>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setChannels([]);
    try {
      const res = await fetch(`/api/stock/${symbol}/chart?interval=${interval}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json: StockChartResponse = await res.json();
      setData(json.data);
    } catch {
      setError("데이터를 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [symbol, interval]);

  const fetchTrendlines = useCallback(async () => {
    if (interval === "1d") { setChannels([]); return; }
    try {
      const params = new URLSearchParams({
        pivotN: String(pivotN),
        dropThreshold: String(dropThreshold),
        tunnelTolerance: String(tunnelTolerance),
      });
      const res = await fetch(`/api/stock/${symbol}/trendlines?${params}`);
      if (!res.ok) throw new Error("Failed");
      const json: TrendlineResponse = await res.json();
      setChannels(json.channels);
    } catch {
      setChannels([]);
    }
  }, [symbol, interval, pivotN, dropThreshold, tunnelTolerance]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 슬라이더 변경 시 디바운스 적용 (500ms)
  useEffect(() => {
    if (data.length === 0 || interval === "1d") return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchTrendlines, 500);
    return () => clearTimeout(debounceRef.current);
  }, [data.length, fetchTrendlines, interval]);

  // Delete 키로 선택된 드로잉 삭제
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedDrawingId) {
        chartRef.current?.deleteDrawing(selectedDrawingId);
        setSelectedDrawingId(null);
      }
      if (e.key === "Escape") {
        setActiveTool(null);
        setContextMenu(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedDrawingId]);

  const handleSelectionChange = useCallback((id: string | null) => {
    setSelectedDrawingId(id);
  }, []);

  const handleContextMenu = useCallback((x: number, y: number, id: string) => {
    setContextMenu({ x, y, id });
  }, []);

  const handleToolReset = useCallback(() => {
    setActiveTool(null);
  }, []);

  const lastPrice = data.length > 0 ? data[data.length - 1] : null;
  const prevClose = data.length > 1 ? data[data.length - 2].close : null;
  const change = lastPrice && prevClose ? lastPrice.close - prevClose : null;
  const changePercent = change && prevClose ? (change / prevClose) * 100 : null;

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-end justify-between">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{symbol}</h1>
              <StockSearch currentSymbol={symbol} />
            </div>
            {lastPrice && (
              <div className="flex items-baseline gap-3 mt-1">
                <span className="text-2xl font-semibold">
                  {lastPrice.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                {change !== null && changePercent !== null && (
                  <span className={`text-sm font-medium ${change >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {change >= 0 ? "+" : ""}{change.toFixed(2)} ({changePercent >= 0 ? "+" : ""}{changePercent.toFixed(2)}%)
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          {INTERVALS.map((item) => (
            <Button
              key={item.value}
              variant={interval === item.value ? "default" : "outline"}
              size="sm"
              onClick={() => setInterval(item.value)}
              disabled={loading}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>

      {/* 차트 + 드로잉 툴바 */}
      {error ? (
        <div className="flex h-[500px] items-center justify-center rounded-lg border border-zinc-800 text-red-400">
          {error}
        </div>
      ) : loading ? (
        <div className="flex h-[500px] items-center justify-center rounded-lg border border-zinc-800 text-zinc-500">
          차트 로딩 중...
        </div>
      ) : (
        <div className="flex gap-2">
          <DrawingToolbar activeTool={activeTool} onToolChange={setActiveTool} />
          <div className="flex-1">
            <ChartContainer
              ref={chartRef}
              data={data}
              channels={channels}
              showTrendlines={showTrendlines}
              showTunnels={showTunnels}
              symbol={symbol}
              activeTool={activeTool}
              onSelectionChange={handleSelectionChange}
              onContextMenu={handleContextMenu}
              onToolReset={handleToolReset}
            />
          </div>
        </div>
      )}

      {/* 우클릭 컨텍스트 메뉴 */}
      {contextMenu && (
        <DrawingContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onChangeColor={(color) => chartRef.current?.changeColor(contextMenu.id, color)}
          onDelete={() => {
            chartRef.current?.deleteDrawing(contextMenu.id);
            setSelectedDrawingId(null);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* 컨트롤 패널 */}
      {interval !== "1d" && (
        <div className="rounded-lg border border-zinc-800 p-4 space-y-3">
          {/* 토글 */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showTrendlines}
                onChange={(e) => setShowTrendlines(e.target.checked)}
                className="accent-blue-500"
              />
              추세선
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={showTunnels}
                onChange={(e) => setShowTunnels(e.target.checked)}
                className="accent-blue-500"
              />
              터널
            </label>
          </div>

          {/* 슬라이더 */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-zinc-400 block mb-1">
                N값 (감도): {pivotN}
              </label>
              <input
                type="range" min={3} max={30} value={pivotN}
                onChange={(e) => setPivotN(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">
                낙폭 기준: {dropThreshold}%
              </label>
              <input
                type="range" min={-70} max={-10} value={dropThreshold}
                onChange={(e) => setDropThreshold(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">
                터널 오차: ±{tunnelTolerance}%
              </label>
              <input
                type="range" min={0.5} max={5} step={0.5} value={tunnelTolerance}
                onChange={(e) => setTunnelTolerance(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
          </div>

          {/* 접점 표시 */}
          {channels.length > 0 && (
            <div className="flex gap-4 text-xs">
              {channels.map((ch) => (
                <span
                  key={ch.direction}
                  className={ch.direction === "uptrend" ? "text-blue-400" : "text-red-400"}
                >
                  {ch.direction === "uptrend" ? "상승" : "하강"} 채널: 추세선 {ch.mainTouchCount + 2}점 / 터널 {ch.tunnelTouchCount}점
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
