"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

interface StockSearchProps {
  currentSymbol: string;
}

export function StockSearch({ currentSymbol }: StockSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const search = useCallback(async (q: string) => {
    if (q.length < 1) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/stock/search?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setResults(json.results || []);
      setSelectedIdx(-1);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.length > 0) {
      debounceRef.current = setTimeout(() => search(query), 300);
    } else {
      setResults([]);
    }
    return () => clearTimeout(debounceRef.current);
  }, [query, search]);

  // 외부 클릭 시 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const navigate = (symbol: string) => {
    setIsOpen(false);
    setQuery("");
    router.push(`/stock/${encodeURIComponent(symbol)}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIdx >= 0 && results[selectedIdx]) {
        navigate(results[selectedIdx].symbol);
      } else if (query.trim()) {
        navigate(query.trim().toUpperCase());
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const showDropdown = isOpen && query.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5">
        <Search size={14} className="text-zinc-500 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => { if (query.length > 0) setIsOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder="종목 검색"
          className="bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500 w-44"
        />
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 mt-1 w-80 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl z-50 overflow-hidden">
          {loading && results.length === 0 && (
            <div className="px-3 py-3 text-xs text-zinc-500">검색 중...</div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-3 py-3 text-xs text-zinc-500">결과 없음</div>
          )}
          {results.map((r, i) => (
            <button
              key={r.symbol}
              onClick={() => navigate(r.symbol)}
              className={`flex items-center justify-between w-full px-3 py-2 text-left text-sm transition-colors ${
                i === selectedIdx ? "bg-zinc-800" : "hover:bg-zinc-800/60"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono font-medium text-zinc-100 shrink-0">{r.symbol}</span>
                <span className="text-zinc-400 truncate">{r.name}</span>
              </div>
              <span className="text-xs text-zinc-600 shrink-0 ml-2">{r.exchange}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
