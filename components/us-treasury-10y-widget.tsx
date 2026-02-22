"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const SYMBOL = "^TNX";
const REFRESH_INTERVAL_MS = 60_000; // 1분마다 갱신

interface QuoteData {
  price: number;
  change: number;
  changePercent: number;
}

export function UsTreasury10yWidget() {
  const [quote, setQuote] = useState<QuoteData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchQuote() {
      try {
        const res = await fetch(`/api/stock/${encodeURIComponent(SYMBOL)}/quote`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.price != null) {
          setQuote({
            price: data.price,
            change: data.change,
            changePercent: data.changePercent,
          });
        }
      } catch {
        // 네트워크 오류 시 기존 데이터 유지
      }
    }

    fetchQuote();
    const id = setInterval(fetchQuote, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!quote) {
    return (
      <div className="flex items-center gap-1.5 rounded-md border-2 border-foreground/40 px-2.5 py-1 text-xs text-muted-foreground">
        <span className="font-mono">미 10년물 국채 —</span>
      </div>
    );
  }

  const isDown = quote.change < 0;

  return (
    <Link
      href={`/stock/${encodeURIComponent(SYMBOL)}`}
      className="group flex items-center gap-1.5 rounded-md border-2 border-foreground/40 px-2.5 py-1 transition-colors hover:bg-accent"
    >
      <span className="text-[10px] font-medium text-muted-foreground">미 10년물 국채</span>
      <span className="font-mono text-sm font-semibold tabular-nums">
        {quote.price.toFixed(2)}%
      </span>
      <span
        className={`font-mono text-[10px] tabular-nums ${isDown ? "text-red-500" : "text-green-500"}`}
      >
        {isDown ? "" : "+"}
        {quote.change.toFixed(2)}
      </span>
    </Link>
  );
}
