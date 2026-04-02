"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { MarketEvent } from "@/lib/types/market-events";

interface MarketEventModalProps {
  event: MarketEvent | null;
  onClose: () => void;
}

export function MarketEventModal({ event, onClose }: MarketEventModalProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (event) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [event]);

  useEffect(() => {
    if (!event) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [event, onClose]);

  useEffect(() => {
    if (event) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [event]);

  if (!event) return null;

  const isUp = event.changePercent > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`relative flex w-[90%] max-w-md max-h-[80vh] flex-col rounded-2xl border border-border bg-card shadow-2xl transition-all duration-200 ease-out ${
          visible
            ? "scale-100 opacity-100"
            : "scale-95 opacity-0"
        }`}
      >
        {/* 헤더 (sticky) */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-2xl border-b border-border bg-card px-5 py-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-foreground truncate">
                {event.name}
              </h3>
              <p className="text-xs text-muted-foreground">{event.date}</p>
            </div>
            <span
              className={`font-mono text-2xl font-extrabold tabular-nums shrink-0 ${
                isUp ? "text-[#10b981]" : "text-[#ef4444]"
              }`}
            >
              {isUp ? "+" : ""}
              {event.changePercent.toFixed(2)}%
            </span>
          </div>

          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        {/* 바디 */}
        <div className="overflow-y-auto px-5 py-4 pb-6">
          <span className="mb-3 inline-flex items-center rounded-full bg-foreground/10 px-2.5 py-0.5 text-[10px] font-medium text-foreground">
            원인 분석
          </span>

          <p className="mt-2 text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
            {event.summary}
          </p>
        </div>
      </div>
    </div>
  );
}
