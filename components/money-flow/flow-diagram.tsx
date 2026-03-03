"use client";

import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PLAYER_META,
  PLAYER_COLORS,
  type FlowNode,
  type FlowArrow,
} from "@/lib/money-flow-data";

interface FlowDiagramProps {
  nodes: FlowNode[];
  arrows: FlowArrow[];
}

function NodeCard({ node }: { node: FlowNode }) {
  const player = PLAYER_META.find((p) => p.id === node.playerId);
  if (!player) return null;

  const colors = PLAYER_COLORS[player.color];
  const Icon = player.icon;
  const isActive = node.status === "active";
  const isDim = node.status === "dim";

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-xl border px-3 py-4 transition-all min-w-[100px]",
        isActive && [colors.border, colors.bg, "shadow-md"],
        node.status === "waiting" && "border-border bg-card",
        isDim && "border-border/50 bg-card/50 opacity-50"
      )}
    >
      <div
        className={cn(
          "flex size-9 items-center justify-center rounded-lg",
          isActive ? colors.bg : "bg-muted"
        )}
      >
        <Icon
          className={cn(
            "size-4",
            isActive ? colors.text : "text-muted-foreground"
          )}
        />
      </div>
      <span className="text-xs font-medium text-center leading-tight">
        {player.name.split(" (")[0]}
      </span>
      <span
        className={cn(
          "text-[10px] leading-tight text-center",
          isActive ? colors.text : "text-muted-foreground"
        )}
      >
        {node.statusText}
      </span>
    </div>
  );
}

function ArrowConnector({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 shrink-0">
      <ArrowRight className="size-4 text-muted-foreground" />
      <span className="text-[9px] text-muted-foreground whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}

export function FlowDiagram({ nodes, arrows }: FlowDiagramProps) {
  // 데스크탑: 가로 흐름, 모바일: 세로 그리드
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground">
        돈의 흐름 순서도
      </h3>

      {/* 데스크탑 가로 플로우 */}
      <div className="hidden md:flex items-center gap-3 overflow-x-auto pb-2">
        {nodes.map((node, i) => {
          const arrow = arrows.find((a) => a.from === node.playerId);
          return (
            <div key={node.playerId} className="flex items-center gap-3">
              <NodeCard node={node} />
              {i < nodes.length - 1 && arrow && (
                <ArrowConnector label={arrow.label} />
              )}
              {i < nodes.length - 1 && !arrow && (
                <div className="w-4" />
              )}
            </div>
          );
        })}
      </div>

      {/* 모바일 세로 그리드 */}
      <div className="grid grid-cols-2 gap-3 md:hidden">
        {nodes.map((node) => (
          <NodeCard key={node.playerId} node={node} />
        ))}
      </div>

      {/* 화살표 범례 (모바일) */}
      <div className="flex flex-wrap gap-2 md:hidden">
        {arrows.map((arrow) => {
          const fromPlayer = PLAYER_META.find((p) => p.id === arrow.from);
          const toPlayer = PLAYER_META.find((p) => p.id === arrow.to);
          if (!fromPlayer || !toPlayer) return null;
          return (
            <span
              key={`${arrow.from}-${arrow.to}`}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground"
            >
              {fromPlayer.name.split(" (")[0]}
              <ArrowRight className="size-3" />
              {toPlayer.name.split(" (")[0]}
              <span className="text-foreground font-medium">{arrow.label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
