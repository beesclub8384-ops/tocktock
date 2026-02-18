"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChartContainer } from "./chart-container";
import type { ChartInterval, OHLCData, StockChartResponse } from "@/lib/types/stock";

const INTERVALS: { value: ChartInterval; label: string }[] = [
  { value: "1d", label: "일봉" },
  { value: "1wk", label: "주봉" },
  { value: "1mo", label: "월봉" },
];

interface StockChartProps {
  symbol: string;
}

export function StockChart({ symbol }: StockChartProps) {
  const [interval, setInterval] = useState<ChartInterval>("1d");
  const [data, setData] = useState<OHLCData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const lastPrice = data.length > 0 ? data[data.length - 1] : null;
  const prevClose = data.length > 1 ? data[data.length - 2].close : null;
  const change = lastPrice && prevClose ? lastPrice.close - prevClose : null;
  const changePercent = change && prevClose ? (change / prevClose) * 100 : null;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold">{symbol}</h1>
          {lastPrice && (
            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-2xl font-semibold">
                ${lastPrice.close.toFixed(2)}
              </span>
              {change !== null && changePercent !== null && (
                <span
                  className={`text-sm font-medium ${
                    change >= 0 ? "text-green-500" : "text-red-500"
                  }`}
                >
                  {change >= 0 ? "+" : ""}
                  {change.toFixed(2)} ({changePercent >= 0 ? "+" : ""}
                  {changePercent.toFixed(2)}%)
                </span>
              )}
            </div>
          )}
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

      {error ? (
        <div className="flex h-[500px] items-center justify-center rounded-lg border border-zinc-800 text-red-400">
          {error}
        </div>
      ) : loading ? (
        <div className="flex h-[500px] items-center justify-center rounded-lg border border-zinc-800 text-zinc-500">
          차트 로딩 중...
        </div>
      ) : (
        <ChartContainer data={data} />
      )}
    </div>
  );
}
