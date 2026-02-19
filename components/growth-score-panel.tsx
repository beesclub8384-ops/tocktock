"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Loader2 } from "lucide-react";
import type { GrowthScoreResult } from "@/lib/stock-score";

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-green-500";
  if (score >= 60) return "text-yellow-500";
  return "text-red-500";
}

function barColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-yellow-500";
  return "bg-red-500";
}

export function GrowthScorePanel() {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [searchLoading, setSearchLoading] = useState(false);

  const [scoreResult, setScoreResult] = useState<GrowthScoreResult | null>(
    null
  );
  const [scoreLoading, setScoreLoading] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const search = useCallback(async (q: string) => {
    if (q.length < 1) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(
        `/api/stock/search?q=${encodeURIComponent(q)}`
      );
      const json = await res.json();
      setSearchResults(json.results || []);
      setSelectedIdx(-1);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.length > 0) {
      debounceRef.current = setTimeout(() => search(query), 300);
    } else {
      setSearchResults([]);
    }
    return () => clearTimeout(debounceRef.current);
  }, [query, search]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchScore = async (symbol: string) => {
    setSelectedSymbol(symbol);
    setScoreLoading(true);
    setScoreResult(null);
    try {
      const res = await fetch(
        `/api/stock/${encodeURIComponent(symbol)}/growth-score`
      );
      const data: GrowthScoreResult = await res.json();
      setScoreResult(data);
    } catch {
      setScoreResult({
        symbol,
        totalScore: null,
        metrics: [],
        error: "데이터 부족으로 점수 산출 불가",
        dataYears: null,
      });
    } finally {
      setScoreLoading(false);
    }
  };

  const selectSymbol = (symbol: string) => {
    setIsOpen(false);
    setQuery("");
    fetchScore(symbol);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((prev) =>
        Math.min(prev + 1, searchResults.length - 1)
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIdx >= 0 && searchResults[selectedIdx]) {
        selectSymbol(searchResults[selectedIdx].symbol);
      } else if (query.trim()) {
        selectSymbol(query.trim().toUpperCase());
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const showDropdown = isOpen && query.length > 0;

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="mb-4 text-lg font-semibold">성장성 종합 점수</h2>

      {/* 검색창 */}
      <div ref={containerRef} className="relative mb-6">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <Search size={16} className="shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => {
              if (query.length > 0) setIsOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder="종목 검색 (예: AAPL, TSLA, 005930.KS)"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {showDropdown && (
          <div className="absolute top-full left-0 z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
            {searchLoading && searchResults.length === 0 && (
              <div className="px-3 py-3 text-xs text-muted-foreground">
                검색 중...
              </div>
            )}
            {!searchLoading && searchResults.length === 0 && (
              <div className="px-3 py-3 text-xs text-muted-foreground">
                결과 없음
              </div>
            )}
            {searchResults.map((r, i) => (
              <button
                key={r.symbol}
                onClick={() => selectSymbol(r.symbol)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                  i === selectedIdx ? "bg-accent" : "hover:bg-accent/60"
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="shrink-0 font-mono font-medium">
                    {r.symbol}
                  </span>
                  <span className="truncate text-muted-foreground">
                    {r.name}
                  </span>
                </div>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                  {r.exchange}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 로딩 */}
      {scoreLoading && (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm">
            {selectedSymbol} 성장 점수 계산 중...
          </span>
        </div>
      )}

      {/* 결과 */}
      {!scoreLoading && scoreResult && (
        <div>
          {/* 에러 또는 데이터 부족 */}
          {scoreResult.error ? (
            <div className="rounded-lg border border-border bg-muted/50 px-4 py-8 text-center">
              <p className="text-2xl font-bold text-muted-foreground">—</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {scoreResult.symbol}: {scoreResult.error}
              </p>
            </div>
          ) : (
            <>
              {/* 종합 점수 */}
              <div className="mb-6 text-center">
                <p className="mb-1 text-sm text-muted-foreground">
                  {scoreResult.symbol} 종합 성장 점수
                  {scoreResult.dataYears &&
                    ` (${scoreResult.dataYears.previous} → ${scoreResult.dataYears.latest})`}
                </p>
                <p
                  className={`text-6xl font-extrabold tabular-nums ${scoreColor(scoreResult.totalScore!)}`}
                >
                  {scoreResult.totalScore!.toFixed(1)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">/ 100</p>
              </div>

              {/* 지표별 막대그래프 */}
              <div className="space-y-4">
                {scoreResult.metrics.map((m) => (
                  <div key={m.name}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium">
                        {m.name}{" "}
                        <span className="text-xs text-muted-foreground">
                          ({(m.weight * 100).toFixed(0)}%)
                        </span>
                      </span>
                      {m.score != null ? (
                        <span
                          className={`font-mono font-semibold tabular-nums ${scoreColor(m.score)}`}
                        >
                          {m.score.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          N/A
                        </span>
                      )}
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                      {m.score != null ? (
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${barColor(m.score)}`}
                          style={{ width: `${m.score}%` }}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <span className="text-[9px] text-muted-foreground">
                            데이터 부족
                          </span>
                        </div>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {m.description}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* 초기 상태 */}
      {!scoreLoading && !scoreResult && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          종목을 검색하면 5가지 재무 지표 기반 성장성 점수를 확인할 수 있습니다.
        </p>
      )}
    </div>
  );
}
