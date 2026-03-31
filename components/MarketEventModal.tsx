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
      className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* 모바일: 바텀시트 / PC: 중앙 모달 */}
      <div
        className={`
          relative flex w-full flex-col border border-border bg-card shadow-2xl
          max-h-[85vh] md:max-h-[80vh]
          rounded-t-2xl md:rounded-2xl
          mx-0 md:mx-4 md:max-w-md
          transition-all duration-300 ease-out md:duration-200
          ${
            visible
              ? "translate-y-0 opacity-100"
              : "translate-y-full md:translate-y-4 opacity-0 md:opacity-0"
          }
        `}
      >
        {/* 모바일 드래그 핸들 */}
        <div className="md:hidden">
          <div className="w-10 h-1 bg-zinc-500 rounded-full mx-auto mt-3 mb-4" />
        </div>

        {/* 헤더 */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card px-5 py-3 md:py-4 md:rounded-t-2xl">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="min-w-0">
              <h3 className="text-base md:text-lg font-bold text-foreground truncate">
                {event.name}
              </h3>
              <p className="text-xs text-muted-foreground">{event.date}</p>
            </div>
            <span
              className={`font-mono text-xl md:text-2xl font-extrabold tabular-nums shrink-0 ${
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

        {/* 바디 (스크롤 가능) */}
        <div className="overflow-y-auto px-5 py-4 pb-8 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
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
