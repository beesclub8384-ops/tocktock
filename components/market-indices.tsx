"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";

const INDICES = [
  { symbol: "^KS11", name: "코스피" },
  { symbol: "^KQ11", name: "코스닥" },
  { symbol: "^GSPC", name: "S&P 500" },
  { symbol: "^IXIC", name: "나스닥" },
  { symbol: "^DJI", name: "다우존스" },
  { symbol: "DX-Y.NYB", name: "달러인덱스" },
] as const;

const REFRESH_MS = 60_000;

interface QuoteData {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
}

export function MarketIndices() {
  const [quotes, setQuotes] = useState<Map<string, QuoteData>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const results = await Promise.allSettled(
      INDICES.map(async (idx) => {
        const res = await fetch(
          `/api/stock/${encodeURIComponent(idx.symbol)}/quote`
        );
        if (!res.ok) return null;
        const data = await res.json();
        return {
          symbol: idx.symbol,
          name: idx.name,
          price: data.price,
          change: data.change,
          changePercent: data.changePercent,
        } as QuoteData;
      })
    );

    const map = new Map<string, QuoteData>();
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        map.set(r.value.symbol, r.value);
      }
    }
    setQuotes(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchAll]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-sm">시장 지수 불러오는 중...</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {INDICES.map((idx) => {
        const q = quotes.get(idx.symbol);
        if (!q || q.price == null) {
          return (
            <div
              key={idx.symbol}
              className="rounded-lg border border-border bg-card p-4"
            >
              <p className="text-xs text-muted-foreground">{idx.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">—</p>
            </div>
          );
        }

        const isUp = q.change != null && q.change >= 0;
        const colorCls = isUp ? "text-green-500" : "text-red-500";

        return (
          <Link
            key={idx.symbol}
            href={`/stock/${encodeURIComponent(idx.symbol)}`}
            className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/40"
          >
            <p className="text-xs text-muted-foreground">{idx.name}</p>
            <p className="mt-1 font-mono text-lg font-bold tabular-nums">
              {q.price.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
            {q.change != null && q.changePercent != null && (
              <p className={`mt-0.5 font-mono text-xs tabular-nums ${colorCls}`}>
                {isUp ? "+" : ""}
                {q.change.toFixed(2)}{" "}
                ({isUp ? "+" : ""}
                {q.changePercent.toFixed(2)}%)
              </p>
            )}
          </Link>
        );
      })}
    </div>
  );
}
