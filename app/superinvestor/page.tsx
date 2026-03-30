"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, ExternalLink, Users, TrendingDown, UserCheck } from "lucide-react";

interface Signal1 {
  buyerCount: number;
  buyers: string[];
  points: number;
}

interface Signal2 {
  maxWeight: number;
  priceChange: number;
  points: number;
}

interface Signal3 {
  insiderBuys: number;
  points: number;
}

interface SuperinvestorStock {
  ticker: string;
  companyName: string;
  score: number;
  grade: string;
  signal1: Signal1;
  signal2: Signal2;
  signal3: Signal3;
  currentPrice: number;
  reportedPrice: number;
  priceChangePercent: number;
  lastUpdated: string;
}

interface SuperinvestorData {
  stocks: SuperinvestorStock[];
  lastUpdated: string;
  error?: string;
}

const gradeConfig: Record<string, { emoji: string; color: string; bg: string }> = {
  강력추천: { emoji: "🔥", color: "text-red-400", bg: "bg-red-500/15 border-red-500/30" },
  주목: { emoji: "⭐", color: "text-amber-400", bg: "bg-amber-500/15 border-amber-500/30" },
  관심: { emoji: "👀", color: "text-blue-400", bg: "bg-blue-500/15 border-blue-500/30" },
};

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(score, 100);
  let barColor = "bg-blue-500";
  if (score >= 80) barColor = "bg-red-500";
  else if (score >= 60) barColor = "bg-amber-500";

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 rounded-full bg-muted">
        <div
          className={`h-2 rounded-full ${barColor} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className="text-sm font-bold tabular-nums"
        style={{ fontFamily: "'DM Mono', monospace", minWidth: "2.5rem" }}
      >
        {score}점
      </span>
    </div>
  );
}

function SignalRow({
  icon,
  label,
  points,
  maxPoints,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  points: number;
  maxPoints: number;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{label}</span>
          <span
            className="font-medium"
            style={{ fontFamily: "'DM Mono', monospace" }}
          >
            {points}/{maxPoints}
          </span>
        </div>
        <p className="text-xs text-muted-foreground/70">{detail}</p>
      </div>
    </div>
  );
}

function StockCard({ stock }: { stock: SuperinvestorStock }) {
  const gc = gradeConfig[stock.grade] ?? gradeConfig["관심"];
  const isDown = stock.priceChangePercent < 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5 transition-colors hover:bg-accent/30">
      {/* 헤더 */}
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">{stock.ticker}</span>
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-bold ${gc.bg} ${gc.color}`}
            >
              {gc.emoji} {stock.grade}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {stock.companyName}
          </p>
        </div>
        <a
          href={`https://www.tradingview.com/chart/?symbol=${stock.ticker}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          차트 <ExternalLink size={11} />
        </a>
      </div>

      {/* 종합점수 게이지 */}
      <div className="mb-4">
        <ScoreBar score={stock.score} />
      </div>

      {/* 시그널 상세 */}
      <div className="mb-4 space-y-2.5">
        <SignalRow
          icon={<Users size={14} />}
          label="합의 매수"
          points={stock.signal1.points}
          maxPoints={40}
          detail={
            stock.signal1.buyers.length > 0
              ? `${stock.signal1.buyerCount}명: ${stock.signal1.buyers.join(", ")}`
              : "매수자 없음"
          }
        />
        <SignalRow
          icon={<TrendingDown size={14} />}
          label="고확신+할인"
          points={stock.signal2.points}
          maxPoints={35}
          detail={`최대 비중 ${stock.signal2.maxWeight.toFixed(2)}% | 보고가 대비 ${stock.signal2.priceChange >= 0 ? "+" : ""}${stock.signal2.priceChange.toFixed(1)}%`}
        />
        <SignalRow
          icon={<UserCheck size={14} />}
          label="인사이더 매수"
          points={stock.signal3.points}
          maxPoints={25}
          detail={
            stock.signal3.insiderBuys > 0
              ? `최근 인사이더 매수 ${stock.signal3.insiderBuys}건`
              : "인사이더 매수 없음"
          }
        />
      </div>

      {/* 가격 정보 */}
      <div className="flex items-center gap-4 border-t border-border pt-3 text-sm">
        <div>
          <span className="text-xs text-muted-foreground">현재가</span>
          <div
            className="font-medium"
            style={{ fontFamily: "'DM Mono', monospace" }}
          >
            ${stock.currentPrice.toLocaleString()}
          </div>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">보고가</span>
          <div
            className="font-medium"
            style={{ fontFamily: "'DM Mono', monospace" }}
          >
            ${stock.reportedPrice.toLocaleString()}
          </div>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">변동률</span>
          <div
            className={`font-bold ${isDown ? "text-blue-400" : "text-red-400"}`}
            style={{ fontFamily: "'DM Mono', monospace" }}
          >
            {stock.priceChangePercent >= 0 ? "+" : ""}
            {stock.priceChangePercent.toFixed(2)}%
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SuperinvestorPage() {
  const [data, setData] = useState<SuperinvestorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(() => {
    setLoading(true);
    setError("");
    fetch("/api/superinvestor")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setData(json);
      })
      .catch(() => setError("데이터를 불러올 수 없습니다."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground/30 border-t-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">
            슈퍼투자자 데이터를 분석하는 중...
          </p>
          <p className="mt-1 text-xs text-muted-foreground/50">
            최초 로딩 시 Dataroma 데이터 수집으로 시간이 걸릴 수 있습니다
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="mb-4 text-red-400">
            {error || "데이터를 불러올 수 없습니다."}
          </p>
          <button
            onClick={fetchData}
            className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-accent"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  const { stocks, lastUpdated } = data;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-12">
        {/* 헤더 */}
        <header className="mb-8">
          <h1 className="mb-2 text-3xl font-bold tracking-tight">
            슈퍼투자자 종목 선정
          </h1>
          <p className="text-sm text-muted-foreground">
            버핏, 애크먼 등 82명의 슈퍼투자자 SEC 13F 공시 기반 종목 선별
          </p>
          <div className="mt-3 flex items-center gap-3">
            <span className="text-xs text-muted-foreground/60">
              기준일:{" "}
              {new Date(lastUpdated).toLocaleString("ko-KR", {
                timeZone: "Asia/Seoul",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <button
              onClick={fetchData}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-all hover:bg-accent"
            >
              <RefreshCw size={13} />
              새로고침
            </button>
          </div>
        </header>

        {/* 등급 범례 */}
        <div className="mb-6 flex flex-wrap gap-3 rounded-lg border border-border bg-card px-4 py-3 text-xs">
          <span className="text-muted-foreground">등급 기준:</span>
          <span>🔥 <strong>강력추천</strong> 80점↑</span>
          <span>⭐ <strong>주목</strong> 60~79점</span>
          <span>👀 <strong>관심</strong> 40~59점</span>
        </div>

        {/* 종목 카드 목록 */}
        {stocks.length === 0 ? (
          <div className="flex h-60 items-center justify-center rounded-xl border border-border bg-card">
            <p className="text-sm text-muted-foreground">
              현재 40점 이상인 종목이 없습니다
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {stocks.map((stock) => (
              <StockCard key={stock.ticker} stock={stock} />
            ))}
          </div>
        )}

        {/* 면책 고지 */}
        <div className="mt-8 rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          <p>
            본 정보는 SEC 13F 공시(Dataroma 제공) 기반이며 투자 권유가 아닙니다.
            13F는 분기 종료 후 최대 45일 지연 공시되므로 현재 실제 보유 현황과 다를 수 있습니다.
            모든 투자 판단은 본인의 책임입니다.
          </p>
        </div>

        {/* 업데이트 시각 */}
        <p className="mt-4 text-right text-xs text-muted-foreground/50">
          마지막 업데이트:{" "}
          {new Date(lastUpdated).toLocaleString("ko-KR", {
            timeZone: "Asia/Seoul",
          })}
        </p>
      </div>
    </div>
  );
}
