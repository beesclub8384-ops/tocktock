"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import type { MarketEvent } from "@/lib/types/market-events";

interface MarketEventModalProps {
  event: MarketEvent | null;
  onClose: () => void;
}

export function MarketEventModal({ event, onClose }: MarketEventModalProps) {
  useEffect(() => {
    if (!event) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [event, onClose]);

  if (!event) return null;

  const isUp = event.changePercent > 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl">
        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X size={18} />
        </button>

        {/* 헤더 */}
        <div className="mb-4">
          <p className="text-sm text-muted-foreground">{event.date}</p>
          <h3 className="mt-1 text-lg font-bold">{event.name}</h3>
        </div>

        {/* 등락률 */}
        <div className="mb-4">
          <span
            className={`font-mono text-3xl font-extrabold ${
              isUp ? "text-emerald-500" : "text-red-500"
            }`}
          >
            {isUp ? "+" : ""}
            {event.changePercent.toFixed(2)}%
          </span>
          <span
            className={`ml-2 text-sm font-medium ${
              isUp ? "text-emerald-500" : "text-red-500"
            }`}
          >
            {event.direction}
          </span>
        </div>

        {/* AI 요약 */}
        <div className="rounded-lg bg-muted/30 p-4">
          <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
            {event.summary}
          </p>
        </div>
      </div>
    </div>
  );
}
