"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const REFRESH_MS = 60_000;

function statusOf(vix: number) {
  if (vix < 15) return { text: "안정", cls: "text-green-500" };
  if (vix < 25) return { text: "경계", cls: "text-yellow-500" };
  if (vix < 35) return { text: "공포", cls: "text-orange-500" };
  return { text: "극도의 공포", cls: "text-red-500" };
}

export function VixSidebarWidget() {
  const [vix, setVix] = useState<number | null>(null);
  const [change, setChange] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchVix() {
      try {
        const res = await fetch("/api/stock/%5EVIX/quote");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.price != null) {
          setVix(data.price);
          if (data.change != null) setChange(data.change);
        }
      } catch {
        /* keep existing data */
      }
    }

    fetchVix();
    const id = setInterval(fetchVix, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!vix) {
    return (
      <div className="flex items-center gap-1.5 rounded-md border-2 border-foreground/40 px-2.5 py-1 text-xs text-muted-foreground">
        <span className="font-mono">VIX —</span>
      </div>
    );
  }

  const status = statusOf(vix);
  const isDown = change != null && change < 0;

  return (
    <Link
      href="/indices/fear-greed"
      className="group flex flex-col items-start rounded-md border-2 border-foreground/40 px-2.5 py-1 transition-colors hover:bg-accent"
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-medium text-muted-foreground">VIX</span>
        <span className="font-mono text-sm font-semibold tabular-nums">
          {vix.toFixed(2)}
        </span>
        {change != null && (
          <span
            className={`font-mono text-[10px] tabular-nums ${isDown ? "text-red-500" : "text-green-500"}`}
          >
            {isDown ? "" : "+"}
            {change.toFixed(2)}
          </span>
        )}
      </div>
      <span className={`text-[10px] font-medium ${status.cls}`}>
        {status.text}
      </span>
    </Link>
  );
}
