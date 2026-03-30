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

  // 등장 애니메이션
  useEffect(() => {
    if (event) {
      // 다음 프레임에서 visible 설정 (transition 트리거)
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [event]);

  // ESC 키 닫기
  useEffect(() => {
    if (!event) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [event, onClose]);

  // 배경 스크롤 방지
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
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`relative flex w-full max-w-md flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-card shadow-2xl mx-0 sm:mx-4 max-h-[80vh] transition-all duration-200 ${
          visible
            ? "translate-y-0 opacity-100"
            : "translate-y-4 opacity-0"
        }`}
      >
        {/* 헤더 (sticky) */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-2xl border-b border-border bg-card px-5 py-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-foreground truncate">
              {event.name}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {event.date}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <span
                className={`font-mono text-2xl font-extrabold tabular-nums ${
                  isUp ? "text-[#10b981]" : "text-[#ef4444]"
                }`}
              >
                {isUp ? "+" : ""}
                {event.changePercent.toFixed(2)}%
              </span>
            </div>

            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 바디 (스크롤 가능) */}
        <div className="overflow-y-auto px-5 py-4 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
          {/* AI 분석 라벨 */}
          <span className="mb-3 inline-flex items-center rounded-full bg-foreground/10 px-2.5 py-0.5 text-[10px] font-medium text-foreground">
            AI 분석
          </span>

          <p className="mt-2 text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
            {event.summary}
          </p>
        </div>
      </div>
    </div>
  );
}
