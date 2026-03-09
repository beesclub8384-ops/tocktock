"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlayerCard } from "@/components/money-flow/player-card";
import { AiAnalysisSection } from "@/components/money-flow/ai-analysis";
import { LearnSection } from "@/components/money-flow/learn-section";
import {
  type Player,
  type MoneyFlowApiResponse,
  type SummaryIndicator,
  FALLBACK_PLAYERS,
  mergePlayers,
} from "@/lib/money-flow-data";

function SummaryBar({ indicators }: { indicators: SummaryIndicator[] }) {
  if (indicators.length === 0) return null;

  return (
    <div className="mb-6 flex flex-wrap gap-3">
      {indicators.map((ind) => (
        <div
          key={ind.id}
          className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2"
        >
          <span className="text-xs text-muted-foreground">{ind.label}</span>
          <span className="font-mono text-sm font-semibold">{ind.value}</span>
          {ind.change > 0 && (
            <span className="inline-flex items-center gap-0.5 text-xs text-green-400">
              <TrendingUp className="size-3" />
              {ind.change.toFixed(1)}%
            </span>
          )}
          {ind.change < 0 && (
            <span className="inline-flex items-center gap-0.5 text-xs text-red-400">
              <TrendingDown className="size-3" />
              {ind.change.toFixed(1)}%
            </span>
          )}
          {ind.change === 0 && (
            <Minus className="size-3 text-muted-foreground" />
          )}
        </div>
      ))}
    </div>
  );
}

function PlayerSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-6 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="size-10 rounded-lg bg-muted" />
        <div className="space-y-2 flex-1">
          <div className="h-4 w-32 rounded bg-muted" />
          <div className="h-3 w-48 rounded bg-muted" />
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-3 w-full rounded bg-muted" />
        <div className="h-10 w-full rounded bg-muted" />
        <div className="h-10 w-full rounded bg-muted" />
        <div className="h-10 w-full rounded bg-muted" />
      </div>
    </div>
  );
}

export default function MoneyFlowPage() {
  const [players, setPlayers] = useState<Player[]>(() =>
    mergePlayers(FALLBACK_PLAYERS)
  );
  const [summary, setSummary] = useState<SummaryIndicator[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState("learn");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/money-flow-data");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: MoneyFlowApiResponse = await res.json();
      setPlayers(mergePlayers(data.players));
      setSummary(data.summary);
      setFetchedAt(data.fetchedAt);
    } catch {
      setError(true);
      // 폴백 데이터 유지
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="max-w-5xl px-8 py-20">
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">
              돈의 흐름 지표
            </h1>
            <p className="mt-2 text-muted-foreground">
              전 세계 거시경제의 돈 흐름을 7개 주체별로 나누어 실시간 지표와 AI
              분석을 제공합니다.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
            className="shrink-0 mt-1"
          >
            <RefreshCw className={loading ? "animate-spin" : ""} />
            새로고침
          </Button>
        </div>

        {/* 업데이트 시각 + 에러 표시 */}
        <div className="mt-2 flex items-center gap-3">
          {fetchedAt && (
            <span className="text-xs text-muted-foreground">
              {new Date(fetchedAt).toLocaleString("ko-KR")} 기준
            </span>
          )}
          {error && (
            <Badge variant="destructive" className="text-xs">
              일부 데이터를 불러올 수 없습니다 (목업 표시 중)
            </Badge>
          )}
        </div>
      </header>

      {/* 종합 지표 바 */}
      <SummaryBar indicators={summary} />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-8 w-full justify-start">
          <TabsTrigger value="learn">쉽게 배우기</TabsTrigger>
          <TabsTrigger value="ai">AI 분석</TabsTrigger>
          <TabsTrigger value="players">주체별 지표</TabsTrigger>
        </TabsList>

        {/* 탭 1: 쉽게 배우기 */}
        <TabsContent value="learn">
          <LearnSection onNavigate={setActiveTab} />
        </TabsContent>

        {/* 탭 2: AI 분석 */}
        <TabsContent value="ai">
          <AiAnalysisSection />
        </TabsContent>

        {/* 탭 3: 주체별 지표 */}
        <TabsContent value="players">
          {loading ? (
            <div className="grid gap-6 md:grid-cols-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <PlayerSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {players.map((player) => (
                <PlayerCard key={player.id} player={player} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Separator className="my-10" />

      <p className="text-xs text-muted-foreground text-center">
        본 페이지의 모든 지표와 AI 분석은 참고용이며, 투자 권유가 아닙니다.
      </p>
    </div>
  );
}
