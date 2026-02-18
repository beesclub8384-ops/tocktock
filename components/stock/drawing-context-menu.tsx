"use client";

import { useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import { DRAWING_COLORS } from "@/lib/types/drawing";

interface DrawingContextMenuProps {
  x: number;
  y: number;
  onChangeColor: (color: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function DrawingContextMenu({
  x,
  y,
  onChangeColor,
  onDelete,
  onClose,
}: DrawingContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-xl"
      style={{ left: x, top: y }}
    >
      <div className="flex gap-1 mb-2">
        {DRAWING_COLORS.map((color) => (
          <button
            key={color}
            onClick={() => { onChangeColor(color); onClose(); }}
            className="w-5 h-5 rounded-full border border-zinc-600 hover:scale-125 transition-transform"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      <button
        onClick={() => { onDelete(); onClose(); }}
        className="flex items-center gap-2 w-full px-2 py-1 text-sm text-red-400 hover:bg-zinc-800 rounded"
      >
        <Trash2 size={14} />
        삭제
      </button>
    </div>
  );
}
