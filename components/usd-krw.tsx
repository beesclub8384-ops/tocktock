"use client";

import { useEffect, useState } from "react";

const REFRESH_MS = 30_000; // 30초마다 갱신

interface QuoteData {
  price: number;
  change: number;
  changePercent: number;
}

export function UsdKrwWidget() {
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchQuote() {
      try {
        const res = await fetch("/api/usd-krw");
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled && data.price != null) {
          setQuote({
            price: data.price,
            change: data.change,
            changePercent: data.changePercent,
          });
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }

    fetchQuote();
    const id = setInterval(fetchQuote, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (error && !quote) {
    return (
      <div className="flex items-center gap-1.5 rounded-md border-2 border-foreground/40 px-2.5 py-1 text-xs text-muted-foreground">
        <span className="font-mono">USD/KRW —</span>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="flex items-center gap-1.5 rounded-md border-2 border-foreground/40 px-2.5 py-1 text-xs text-muted-foreground">
        <span className="font-mono">USD/KRW —</span>
      </div>
    );
  }

  const isUp = quote.change > 0;
  const isDown = quote.change < 0;

  return (
    <div className="flex flex-col items-start rounded-md border-2 border-foreground/40 px-2.5 py-1">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-medium text-muted-foreground">USD/KRW</span>
        <span className="font-mono text-sm font-semibold tabular-nums">
          {quote.price.toFixed(2)}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className={`font-mono text-[10px] tabular-nums ${isUp ? "text-red-500" : isDown ? "text-blue-500" : "text-muted-foreground"}`}
        >
          {isUp ? "+" : ""}
          {quote.change.toFixed(2)}
        </span>
        <span
          className={`font-mono text-[10px] tabular-nums ${isUp ? "text-red-500" : isDown ? "text-blue-500" : "text-muted-foreground"}`}
        >
          ({isUp ? "+" : ""}
          {quote.changePercent.toFixed(2)}%)
        </span>
      </div>
    </div>
  );
}
