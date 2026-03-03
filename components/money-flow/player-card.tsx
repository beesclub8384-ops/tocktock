"use client";

import { useState } from "react";
import { ChevronDown, TrendingUp, TrendingDown, Minus } from "lucide-react";
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

function IndicatorRow({ indicator }: { indicator: Indicator }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{indicator.name}</p>
        <p className="text-xs text-muted-foreground">{indicator.description}</p>
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className="font-mono text-sm font-semibold">{indicator.value}</span>
        <ChangeIndicator change={indicator.change} />
      </div>
    </div>
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
