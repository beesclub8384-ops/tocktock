"use client";

import {
  TrendingUp,
  Minus,
  MoveUpRight,
  Columns2,
  MousePointer2,
} from "lucide-react";
import type { DrawingToolType } from "@/lib/types/drawing";

const TOOLS: { type: DrawingToolType; icon: React.ElementType; label: string }[] = [
  { type: null, icon: MousePointer2, label: "선택" },
  { type: "trendline", icon: TrendingUp, label: "추세선" },
  { type: "horizontal_line", icon: Minus, label: "수평선" },
  { type: "ray", icon: MoveUpRight, label: "레이" },
  { type: "parallel_channel", icon: Columns2, label: "채널" },
];

interface DrawingToolbarProps {
  activeTool: DrawingToolType;
  onToolChange: (tool: DrawingToolType) => void;
}

export function DrawingToolbar({ activeTool, onToolChange }: DrawingToolbarProps) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
      {TOOLS.map(({ type, icon: Icon, label }) => {
        const isActive = activeTool === type;
        return (
          <button
            key={type ?? "pointer"}
            onClick={() => onToolChange(type)}
            title={label}
            className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${
              isActive
                ? "bg-blue-600 text-white"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            <Icon size={16} />
          </button>
        );
      })}
    </div>
  );
}
