"use client";

import { useEffect, useState, useCallback } from "react";
import { CandlestickChart } from "@/components/CandlestickChart";
import { MarketEventModal } from "@/components/MarketEventModal";
import type { MarketEvent } from "@/lib/types/market-events";

interface OHLCPoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type SymbolTab = "^GSPC" | "^IXIC" | "^KS11" | "^KQ11";

const TABS: { symbol: SymbolTab; label: string }[] = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^IXIC", label: "나스닥" },
  { symbol: "^KS11", label: "코스피" },
  { symbol: "^KQ11", label: "코스닥" },
];

const EVENTS_REFRESH_MS = 30_000;

export default function MarketEventsPage() {
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [ohlc, setOhlc] = useState<Record<string, OHLCPoint[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<SymbolTab>("^GSPC");
  const [selectedEvent, setSelectedEvent] = useState<MarketEvent | null>(null);

  // 초기 로드: OHLC + events 모두
  const fetchAll = useCallback(async () => {
    try {
      const res = await fetch("/api/market-events");
      if (!res.ok) throw new Error("API 오류");
      const json = await res.json();
      setEvents(json.events || []);
      setOhlc(json.ohlc || {});
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터 로드 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  // events만 polling (ohlc는 1시간 캐시)
  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/market-events");
      if (!res.ok) return;
      const json = await res.json();
      setEvents(json.events || []);
    } catch {
      // 폴링 실패 시 기존 데이터 유지
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const id = setInterval(fetchEvents, EVENTS_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchEvents]);

  const tabEvents = events.filter((e) => e.symbol === activeTab);
  const tabOhlc = ohlc[activeTab] || [];

  return (
    <main className="max-w-5xl mx-auto px-4 py-12 sm:px-8 sm:py-20 overflow-x-hidden">
      <header className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          지수 급등락 원인 분석
        </h1>
        <p className="mt-2 text-muted-foreground">
          ±1.5% 이상 움직인 날의 원인을 찾아서 경제 흐름을 읽어봅시다.
        </p>
      </header>

      {/* 지수 탭 */}
      <div className="flex flex-wrap gap-1.5 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.symbol}
            onClick={() => setActiveTab(tab.symbol)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.symbol
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 로딩 */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          차트 데이터를 불러오는 중...
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="py-20 text-center text-red-500">
          데이터를 불러오지 못했습니다: {error}
        </div>
      )}

      {/* 메인 콘텐츠 */}
      {!loading && !error && (
        <>
          {/* 캔들스틱 차트 */}
          <div className="rounded-lg border border-border bg-card p-3 mb-6 max-w-2xl mx-auto">
            {tabOhlc.length > 0 ? (
              <CandlestickChart
                key={activeTab}
                symbol={activeTab}
                ohlcData={tabOhlc}
                events={events}
                onMarkerClick={(e) => setSelectedEvent(e)}
              />
            ) : (
              <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
                차트 데이터가 없습니다.
              </div>
            )}
          </div>

          {/* 이벤트 테이블 */}
          {tabEvents.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium">날짜</th>
                    <th className="text-right px-4 py-3 font-medium">등락률</th>
                    <th className="text-left px-4 py-3 font-medium">원인 분석 요약</th>
                  </tr>
                </thead>
                <tbody>
                  {tabEvents.map((event) => (
                    <tr
                      key={`${event.date}-${event.symbol}`}
                      onClick={() => setSelectedEvent(event)}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                        {event.date}
                      </td>
                      <td
                        className={`px-4 py-3 text-right tabular-nums font-mono font-semibold ${
                          event.changePercent >= 0
                            ? "text-emerald-500"
                            : "text-red-500"
                        }`}
                      >
                        {event.changePercent > 0 ? "+" : ""}
                        {event.changePercent.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 text-muted-foreground truncate max-w-xs sm:max-w-md">
                        {event.summary.split("\n")[0]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground text-sm">
              아직 분석된 데이터가 없습니다. 매일 장 마감 후 자동으로
              업데이트됩니다.
            </div>
          )}
        </>
      )}

      {/* 이벤트 팝업 */}
      <MarketEventModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </main>
  );
}
