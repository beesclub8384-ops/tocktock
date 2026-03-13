"use client";

import { useState, useEffect } from "react";
import { ChevronDown, TrendingUp, TrendingDown, Minus, HelpCircle, X } from "lucide-react";
import { useDraggable } from "@/hooks/useDraggable";
import { useResizable } from "@/hooks/useResizable";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { type Player, type Indicator, PLAYER_COLORS } from "@/lib/money-flow-data";
import { MONEY_FLOW_GUIDES } from "@/lib/money-flow-guides";

function ChangeIndicator({ change }: { change: number }) {
  if (change > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-green-400">
        <TrendingUp className="size-3" />
        상승
      </span>
    );
  }
  if (change < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-red-400">
        <TrendingDown className="size-3" />
        하락
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
      <Minus className="size-3" />
      보합
    </span>
  );
}

function IndicatorGuideModal({
  name,
  onClose,
}: {
  name: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const guide = MONEY_FLOW_GUIDES[name] ?? "";
  const { position, handleMouseDown } = useDraggable();
  const { size, handleResizeMouseDown } = useResizable();

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div data-draggable-modal className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" style={{ transform: `translate(${position.x}px, ${position.y}px)`, ...(size.width ? { width: size.width, height: size.height } : { width: "100%", maxWidth: "32rem" }) }}>
        <div className="overflow-y-auto p-6" style={{ maxHeight: size.height ? size.height - 2 : "85vh" }}>
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-10 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X size={20} />
          </button>

          <h2 className="mb-4 text-lg font-bold cursor-move select-none" onMouseDown={handleMouseDown}>{name} 보는 법</h2>
          <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
            {guide}
          </p>
        </div>
        <div onMouseDown={handleResizeMouseDown} className="absolute bottom-0 right-0 cursor-se-resize px-2 py-1 text-xs text-gray-400 hover:text-gray-200 select-none">↔ 크기조절</div>
      </div>
    </div>
  );
}

const STALE_THRESHOLD_DAYS = 90;

function isStale(updatedAt?: string): boolean {
  if (!updatedAt) return false;
  const updated = new Date(updatedAt);
  const now = new Date();
  const diffMs = now.getTime() - updated.getTime();
  return diffMs > STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
}

function ManualBadge({ indicator }: { indicator: Indicator }) {
  if (!indicator.isManual) return null;

  const stale = isStale(indicator.updatedAt);
  const tooltipText = indicator.updatedAt
    ? `마지막 업데이트: ${indicator.updatedAt} · ${indicator.name}는 분기별 수동 업데이트가 필요합니다`
    : `${indicator.name}는 수동 업데이트 항목입니다`;

  if (stale) {
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-medium text-orange-400 cursor-help"
        title={tooltipText}
      >
        ⚠️ 업데이트 필요
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground cursor-help"
      title={tooltipText}
    >
      수동 데이터
    </span>
  );
}

function IndicatorRow({ indicator }: { indicator: Indicator }) {
  const [guideOpen, setGuideOpen] = useState(false);
  const hasGuide = !!(MONEY_FLOW_GUIDES[indicator.name]);

  return (
    <>
      <div className="flex items-start justify-between gap-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium">{indicator.name}</p>
            {hasGuide && (
            <button
              onClick={() => setGuideOpen(true)}
              className="guide-btn inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] transition-all shrink-0"
            >
              <HelpCircle size={11} />
              보는 법
            </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{indicator.description}</p>
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <span className="font-mono text-sm font-semibold">{indicator.value}</span>
          <ChangeIndicator change={indicator.change} />
          <ManualBadge indicator={indicator} />
        </div>
      </div>
      {guideOpen && hasGuide && (
        <IndicatorGuideModal
          name={indicator.name}
          onClose={() => setGuideOpen(false)}
        />
      )}
    </>
  );
}

export function PlayerCard({ player }: { player: Player }) {
  const [open, setOpen] = useState(false);
  const colors = PLAYER_COLORS[player.color];
  const Icon = player.icon;

  return (
    <Card className={cn("border", colors.border)}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className={cn("flex size-10 items-center justify-center rounded-lg", colors.bg)}>
            <Icon className={cn("size-5", colors.text)} />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">{player.name}</CardTitle>
            <CardDescription className="text-xs">{player.subtitle}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-1">
        <p className="mb-3 text-sm text-muted-foreground">
          {player.roleSummary}
        </p>

        <div className="divide-y divide-border">
          {player.indicators.map((ind) => (
            <IndicatorRow key={ind.name} indicator={ind} />
          ))}
        </div>

        <div className="mt-2 rounded-md border border-dashed border-muted-foreground/20 px-3 py-2">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">의도:</span>{" "}
            {player.intention}
          </p>
        </div>

        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="mt-3 flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                open && "rotate-180"
              )}
            />
            초보자 해설
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className={cn("mt-2 rounded-md p-3 text-sm leading-relaxed", colors.bg)}>
              {player.beginnerExplanation}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
