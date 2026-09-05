"use client";

import { useEffect } from "react";
import { useDraggable } from "@/hooks/useDraggable";

/**
 * 한 줄 요약이 붙은 답변의 원문을 보여주는 팝업.
 * 제목 바를 잡고 옮길 수 있다(마우스 + 터치).
 */
export function SourceModal({
  content,
  onClose,
}: {
  content: string;
  onClose: () => void;
}) {
  const { position, handleMouseDown, handleTouchStart } = useDraggable();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // 팝업이 떠 있는 동안 뒤 화면이 같이 스크롤되지 않게 막는다
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-draggable-modal
        className="relative flex max-h-[80dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card"
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      >
        {/* 이 바를 잡고 드래그 (마우스 + 터치) */}
        <div
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          className="flex shrink-0 cursor-move select-none items-center justify-between gap-2 border-b border-border px-4 py-2.5"
        >
          <span className="text-[15px] font-bold text-foreground">원문</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-[16px] leading-none text-muted-foreground transition-colors active:bg-border/40"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto whitespace-pre-wrap break-words px-4 py-3.5 text-[16px] leading-[1.6] text-foreground">
          {content}
        </div>
      </div>
    </div>
  );
}
