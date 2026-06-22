"use client";

import { useEffect, useState } from "react";

interface CalendarEvent {
  date: string;
  market: "KR" | "US";
  category: "earnings" | "indicator";
  name: string;
  status: "예정(추정)" | "확정" | null;
  detail: string;
}

interface CalendarData {
  updatedAt: string | null;
  rangeStart: string | null;
  rangeEnd: string | null;
  events: CalendarEvent[];
}

const HIDE_KEY = "weekly-calendar:hideUntil";
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function localTodayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function formatDateLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}월 ${d}일 (${wd})`;
}

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

function MarketTag({ market }: { market: "KR" | "US" }) {
  const isKR = market === "KR";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-xs font-bold ${
        isKR
          ? "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
          : "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300"
      }`}
    >
      {isKR ? "KR" : "US"}
    </span>
  );
}

function KindBadge({ ev }: { ev: CalendarEvent }) {
  let cls = "";
  let label = "";
  if (ev.category === "indicator") {
    cls = "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
    label = "지표";
  } else if (ev.status === "확정") {
    cls = "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300";
    label = "실적·확정";
  } else {
    cls = "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-300";
    label = "실적·예정";
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

export function WeeklyCalendarModal() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<CalendarData | null>(null);
  const [dontShow, setDontShow] = useState(false);

  useEffect(() => {
    let hideUntil: string | null = null;
    try {
      hideUntil = localStorage.getItem(HIDE_KEY);
    } catch {
      /* ignore */
    }
    if (hideUntil === localTodayStr()) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/weekly-calendar", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as CalendarData;
        if (cancelled) return;
        if (json && Array.isArray(json.events) && json.events.length > 0) {
          setData(json);
          setOpen(true);
        }
      } catch {
        /* 조용히 무시 — 팝업은 부가 기능 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!open || !data) return null;

  const handleClose = () => {
    if (dontShow) {
      try {
        localStorage.setItem(HIDE_KEY, localTodayStr());
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
  };

  const today = localTodayStr();

  // 날짜별 그룹화 (events는 이미 날짜순 정렬됨)
  const groups: { date: string; items: CalendarEvent[] }[] = [];
  for (const ev of data.events) {
    const last = groups[groups.length - 1];
    if (last && last.date === ev.date) last.items.push(ev);
    else groups.push({ date: ev.date, items: [ev] });
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      onClick={handleClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-bold">이번 주 주요 일정</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              오늘부터 7일간 · 미국 지표 / FOMC / 한·미 실적
            </p>
          </div>
          <button
            onClick={handleClose}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {groups.map((g) => {
            const isPast = g.date < today;
            return (
              <div key={g.date} className="py-2">
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
                  {g.items.map((ev, i) => (
                    <li
                      key={`${ev.date}-${ev.name}-${i}`}
                      className="flex items-center gap-2"
                    >
                      <MarketTag market={ev.market} />
                      <span
                        className={`flex-1 truncate text-sm ${
                          isPast ? "text-muted-foreground" : ""
                        }`}
                        title={ev.detail}
                      >
                        {ev.name}
                      </span>
                      <KindBadge ev={ev} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={dontShow}
              onChange={(e) => setDontShow(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            오늘 하루 보지 않기
          </label>
          <span className="text-xs text-muted-foreground">
            업데이트 {formatUpdatedAt(data.updatedAt)}
          </span>
        </div>
      </div>
    </div>
  );
}
