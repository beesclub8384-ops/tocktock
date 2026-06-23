"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  type CalendarData,
  localTodayStr,
  addDaysStr,
  formatDateLabel,
  formatUpdatedAt,
  groupByDate,
  eventKey,
  EventRow,
} from "@/components/weekly-calendar-shared";

type MarketFilter = "전체" | "한국" | "미국";
type KindFilter = "전체" | "실적" | "지표";

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-sm transition-colors ${
        active
          ? "bg-foreground text-background"
          : "border border-border text-muted-foreground hover:bg-accent"
      }`}
    >
      {children}
    </button>
  );
}

export default function CalendarPage() {
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedEarnings, setExpandedEarnings] = useState<Set<string>>(
    new Set()
  );
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("전체");
  const [kindFilter, setKindFilter] = useState<KindFilter>("전체");

  const toggleEarnings = (key: string) =>
    setExpandedEarnings((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleDate = (date: string) =>
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/weekly-calendar", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as CalendarData;
        if (cancelled) return;
        setData(json);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const today = localTodayStr();
  const twoWeekEnd = addDaysStr(today, 14);
  const earnStart = addDaysStr(today, -7);
  const upStart = addDaysStr(today, 15);
  const upEnd = addDaysStr(today, 45);

  const events = data?.events ?? [];
  // 시장·종류 필터 (서버 재요청 없이 클라이언트에서만)
  const filteredEvents = events.filter((e) => {
    if (marketFilter === "한국" && e.market !== "KR") return false;
    if (marketFilter === "미국" && e.market !== "US") return false;
    if (kindFilter === "실적" && e.category !== "earnings") return false;
    if (kindFilter === "지표" && e.category !== "indicator") return false;
    return true;
  });
  // 이번 2주: 지표 오늘~+14, 실적 오늘-7~+14
  const twoWeek = filteredEvents.filter((e) =>
    e.category === "earnings"
      ? e.date >= earnStart && e.date <= twoWeekEnd
      : e.date >= today && e.date <= twoWeekEnd
  );
  // 다가오는 일정: +15~+45
  const upcoming = filteredEvents.filter(
    (e) => e.date >= upStart && e.date <= upEnd
  );

  const twoWeekGroups = groupByDate(twoWeek);
  const upcomingGroups = groupByDate(upcoming);

  return (
    <div className="max-w-3xl px-4 sm:px-8 py-20">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight">주요 일정</h1>
        <p className="mt-2 text-muted-foreground">
          한·미 기업 실적 · 경제지표 발표 일정
        </p>
      </header>

      {loading ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">
          일정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      ) : (
        <>
          {/* 요약 메트릭 */}
          <div className="mb-10 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground">이번 2주</p>
              <p className="mt-1 text-2xl font-bold">{twoWeek.length}건</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground">다가오는 일정</p>
              <p className="mt-1 text-2xl font-bold">{upcoming.length}건</p>
            </div>
          </div>

          {/* 필터 */}
          <div className="mb-8 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-xs text-muted-foreground">
                시장
              </span>
              {(["전체", "한국", "미국"] as MarketFilter[]).map((m) => (
                <FilterPill
                  key={m}
                  active={marketFilter === m}
                  onClick={() => setMarketFilter(m)}
                >
                  {m}
                </FilterPill>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-xs text-muted-foreground">
                종류
              </span>
              {(["전체", "실적", "지표"] as KindFilter[]).map((k) => (
                <FilterPill
                  key={k}
                  active={kindFilter === k}
                  onClick={() => setKindFilter(k)}
                >
                  {k}
                </FilterPill>
              ))}
            </div>
          </div>

          {/* 섹션 1: 이번 2주 */}
          <section className="mb-12">
            <h2 className="mb-4 text-lg font-semibold">이번 2주</h2>
            {twoWeekGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                해당 조건의 일정이 없습니다.
              </p>
            ) : (
              <div className="space-y-3">
                {twoWeekGroups.map((g) => {
                  const isPast = g.date < today;
                  return (
                    <div key={g.date}>
                      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                        <span className={isPast ? "opacity-60" : ""}>
                          {formatDateLabel(g.date)}
                        </span>
                        {isPast && (
                          <span className="rounded bg-zinc-100 px-1 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                            발표 완료
                          </span>
                        )}
                      </p>
                      <ul className="space-y-1.5">
                        {g.items.map((ev) => (
                          <EventRow
                            key={eventKey(ev)}
                            ev={ev}
                            isPast={isPast}
                            expanded={expandedEarnings.has(eventKey(ev))}
                            onToggle={() => toggleEarnings(eventKey(ev))}
                          />
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 섹션 2: 다가오는 일정 (날짜별 접힘) */}
          <section>
            <h2 className="mb-4 text-lg font-semibold">다가오는 일정</h2>
            {upcomingGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                해당 조건의 일정이 없습니다.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {upcomingGroups.map((g) => {
                  const isOpen = expandedDates.has(g.date);
                  return (
                    <li key={g.date}>
                      <button
                        onClick={() => toggleDate(g.date)}
                        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-accent/40"
                      >
                        <span className="text-sm font-medium">
                          {formatDateLabel(g.date)}
                        </span>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          {g.items.length}건
                          <span>{isOpen ? "▴" : "▾"}</span>
                        </span>
                      </button>
                      {isOpen && (
                        <ul className="space-y-1.5 px-4 pb-3">
                          {g.items.map((ev) => (
                            <EventRow
                              key={eventKey(ev)}
                              ev={ev}
                              isPast={false}
                              expanded={expandedEarnings.has(eventKey(ev))}
                              onToggle={() => toggleEarnings(eventKey(ev))}
                            />
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {data.updatedAt && (
            <p className="mt-10 text-xs text-muted-foreground">
              업데이트 {formatUpdatedAt(data.updatedAt)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
