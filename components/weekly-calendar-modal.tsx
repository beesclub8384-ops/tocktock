"use client";

import { useEffect, useState } from "react";

interface EarningsDetail {
  surprisePercent?: number;
  epsActual?: number;
  epsEstimate?: number;
  revenue?: number;
  netIncome?: number;
  currency: "KRW" | "USD";
}

interface CalendarEvent {
  date: string;
  market: "KR" | "US";
  category: "earnings" | "indicator";
  name: string;
  status: "예정(추정)" | "확정" | null;
  detail: string;
  earnings?: EarningsDetail;
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

const POS_CLS = "text-green-600 dark:text-green-400";
const NEG_CLS = "text-red-600 dark:text-red-400";

function fmtMoney(v: number, currency: "KRW" | "USD"): string {
  if (currency === "KRW") {
    if (Math.abs(v) >= 1e12) return `${(v / 1e12).toFixed(1)}조 원`;
    if (Math.abs(v) >= 1e8) return `${Math.round(v / 1e8).toLocaleString()}억 원`;
    return `${Math.round(v).toLocaleString()}원`;
  }
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `$${Math.round(v / 1e6).toLocaleString()}M`;
  return `$${Math.round(v).toLocaleString()}`;
}

function fmtEps(v: number, currency: "KRW" | "USD"): string {
  return currency === "KRW"
    ? `${Math.round(v).toLocaleString()}원`
    : `$${v.toFixed(2)}`;
}

function SurpriseChip({ v }: { v: number }) {
  const up = v >= 0;
  return (
    <span
      className={`shrink-0 text-xs font-semibold ${up ? POS_CLS : NEG_CLS}`}
    >
      {up ? "+" : ""}
      {v.toFixed(1)}%
    </span>
  );
}

function EarningsStatusChip({ status }: { status: CalendarEvent["status"] }) {
  const label = status === "확정" ? "예정" : "예정(추정)";
  return (
    <span className="inline-flex shrink-0 items-center rounded bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-300">
      {label}
    </span>
  );
}

function EarningsDetailPanel({
  ev,
  isPast,
}: {
  ev: CalendarEvent;
  isPast: boolean;
}) {
  const e = ev.earnings;
  if (!e) {
    return (
      <div className="ml-9 mt-1 text-xs text-muted-foreground">
        상세 정보 없음
      </div>
    );
  }
  const cur = e.currency;
  const fin = [
    typeof e.revenue === "number" ? `매출 ${fmtMoney(e.revenue, cur)}` : null,
    typeof e.netIncome === "number"
      ? `순이익 ${fmtMoney(e.netIncome, cur)}`
      : null,
  ].filter(Boolean);

  return (
    <div className="ml-9 mt-1 space-y-0.5 text-xs text-muted-foreground">
      {isPast ? (
        <>
          {typeof e.surprisePercent === "number" && (
            <div>
              예상치{" "}
              <span
                className={e.surprisePercent >= 0 ? POS_CLS : NEG_CLS}
              >
                {Math.abs(e.surprisePercent).toFixed(1)}%{" "}
                {e.surprisePercent >= 0 ? "상회" : "하회"}
              </span>
            </div>
          )}
          {typeof e.epsActual === "number" && (
            <div>
              실제 EPS {fmtEps(e.epsActual, cur)}
              {typeof e.epsEstimate === "number"
                ? ` (예상 ${fmtEps(e.epsEstimate, cur)})`
                : ""}
            </div>
          )}
          {fin.length > 0 && <div>{fin.join(" · ")}</div>}
        </>
      ) : (
        <>
          {typeof e.epsEstimate === "number" && (
            <div>예상 EPS {fmtEps(e.epsEstimate, cur)}</div>
          )}
          {typeof e.revenue === "number" && (
            <div>예상 매출 {fmtMoney(e.revenue, cur)}</div>
          )}
        </>
      )}
    </div>
  );
}

export function WeeklyCalendarModal() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<CalendarData | null>(null);
  const [dontShow, setDontShow] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

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
                  {g.items.map((ev, i) => {
                    if (ev.category !== "earnings") {
                      // 지표/FOMC: 펼침 없음
                      return (
                        <li
                          key={`${ev.date}-${ev.name}-${i}`}
                          className="flex items-center gap-2"
                        >
                          <MarketTag market={ev.market} />
                          <span
                            className="flex-1 truncate text-sm"
                            title={ev.detail}
                          >
                            {ev.name}
                          </span>
                          <KindBadge ev={ev} />
                        </li>
                      );
                    }
                    // 실적: 클릭 시 펼침/접힘
                    const key = `${ev.date}|${ev.market}|${ev.name}`;
                    const isOpen = expanded.has(key);
                    const hasSurprise =
                      isPast && typeof ev.earnings?.surprisePercent === "number";
                    return (
                      <li key={`${ev.date}-${ev.name}-${i}`}>
                        <button
                          onClick={() => toggleExpand(key)}
                          className="flex w-full items-center gap-2 text-left"
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
                          {isPast ? (
                            hasSurprise ? (
                              <SurpriseChip
                                v={ev.earnings!.surprisePercent as number}
                              />
                            ) : (
                              <span className="shrink-0 text-xs text-muted-foreground">
                                발표 완료
                              </span>
                            )
                          ) : (
                            <EarningsStatusChip status={ev.status} />
                          )}
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {isOpen ? "▴" : "▾"}
                          </span>
                        </button>
                        {isOpen && (
                          <EarningsDetailPanel ev={ev} isPast={isPast} />
                        )}
                      </li>
                    );
                  })}
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
