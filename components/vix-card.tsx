"use client";

import { useEffect, useState } from "react";
import { VixGuideModal } from "@/components/vix-guide-modal";

const REFRESH_MS = 60_000;

interface VixQuote {
  price: number | null;
  change: number | null;
  changePercent: number | null;
}

export function VixCard() {
  const [quote, setQuote] = useState<VixQuote | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchVix() {
      try {
        const res = await fetch("/api/stock/%5EVIX/quote");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setQuote({
          price: data.price ?? null,
          change: data.change ?? null,
          changePercent: data.changePercent ?? null,
        });
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

  const change = quote?.change ?? null;
  const diffLabel =
    change === null
      ? "데이터 없음"
      : change > 0
        ? `▲ ${change.toFixed(2)}`
        : change < 0
          ? `▼ ${Math.abs(change).toFixed(2)}`
          : "변동 없음";
  const diffColor =
    change === null
      ? "text-zinc-400"
      : change > 0
        ? "text-rose-600"
        : change < 0
          ? "text-blue-600"
          : "text-zinc-500";

  return (
    <>
      {guideOpen && <VixGuideModal onClose={() => setGuideOpen(false)} />}
      <button
        type="button"
        onClick={() => setGuideOpen(true)}
        className="text-left rounded-xl p-4 sm:p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 transition-colors hover:border-zinc-300 dark:hover:border-zinc-700 cursor-pointer"
      >
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              VIX
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5 leading-snug">
              S&amp;P500 향후 30일 예상 변동성 (공포지수)
            </div>
          </div>
        </div>
        <div className="mt-3 text-3xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
          {quote?.price === null || quote?.price === undefined
            ? "—"
            : quote.price.toFixed(2)}
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-zinc-500">index · 전일 대비</span>
          <span className={diffColor}>{diffLabel}</span>
        </div>
      </button>
    </>
  );
}
