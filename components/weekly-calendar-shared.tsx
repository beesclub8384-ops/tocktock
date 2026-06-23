"use client";

/**
 * weekly-calendar 공용 표시 요소 (팝업 모달 + /calendar 페이지 공용).
 * 모달(components/weekly-calendar-modal.tsx)의 표시 로직과 동일한 모양을 재현한다.
 * ⚠️ 모달 자체는 이 파일을 쓰지 않는다(모달 동작 보존). 페이지 전용 재활용.
 */

export interface EarningsDetail {
  surprisePercent?: number;
  epsActual?: number;
  epsEstimate?: number;
  revenue?: number;
  netIncome?: number;
  currency: "KRW" | "USD";
}

export interface CalendarEvent {
  date: string;
  market: "KR" | "US";
  category: "earnings" | "indicator";
  name: string;
  status: "예정(추정)" | "확정" | null;
  detail: string;
  earnings?: EarningsDetail;
  timeLocal?: string;
  timeKst?: string;
  timeNote?: string;
}

export interface CalendarData {
  updatedAt: string | null;
  rangeStart: string | null;
  rangeEnd: string | null;
  events: CalendarEvent[];
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function localTodayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDaysStr(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

export function formatDateLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}월 ${d}일 (${wd})`;
}

export function formatUpdatedAt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

/** 시각 표시 문구. 미국=현지/한국 라벨, 한국=현지(=한국)라 라벨 생략 */
export function eventTimeText(ev: CalendarEvent): string | null {
  if (ev.timeKst) return `현지 ${ev.timeLocal} (한국 ${ev.timeKst})`;
  if (ev.timeLocal)
    return ev.timeNote ? `${ev.timeLocal} (${ev.timeNote})` : ev.timeLocal;
  return null;
}

/** 날짜순 정렬된 events를 날짜별로 그룹화 */
export function groupByDate(
  events: CalendarEvent[]
): { date: string; items: CalendarEvent[] }[] {
  const groups: { date: string; items: CalendarEvent[] }[] = [];
  for (const ev of events) {
    const last = groups[groups.length - 1];
    if (last && last.date === ev.date) last.items.push(ev);
    else groups.push({ date: ev.date, items: [ev] });
  }
  return groups;
}

export function eventKey(ev: CalendarEvent): string {
  return `${ev.date}|${ev.market}|${ev.name}`;
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

export function MarketTag({ market }: { market: "KR" | "US" }) {
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

export function KindBadge({ ev }: { ev: CalendarEvent }) {
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

function SurpriseChip({ v }: { v: number }) {
  const up = v >= 0;
  return (
    <span className={`shrink-0 text-xs font-semibold ${up ? POS_CLS : NEG_CLS}`}>
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
              <span className={e.surprisePercent >= 0 ? POS_CLS : NEG_CLS}>
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

/**
 * 일정 한 줄. 실적은 클릭 시 펼침(상세). 지표/FOMC는 펼침 없음.
 * 모달의 행 표시와 동일한 모양.
 */
export function EventRow({
  ev,
  isPast,
  expanded,
  onToggle,
}: {
  ev: CalendarEvent;
  isPast: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const itime = eventTimeText(ev);

  if (ev.category !== "earnings") {
    return (
      <li className="flex items-center gap-2">
        <MarketTag market={ev.market} />
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm" title={ev.detail}>
            {ev.name}
          </span>
          {itime && (
            <span className="block text-xs text-muted-foreground">{itime}</span>
          )}
        </div>
        <KindBadge ev={ev} />
      </li>
    );
  }

  const hasSurprise =
    isPast && typeof ev.earnings?.surprisePercent === "number";
  return (
    <li>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 text-left"
      >
        <MarketTag market={ev.market} />
        <div className="min-w-0 flex-1">
          <span
            className={`block truncate text-sm ${
              isPast ? "text-muted-foreground" : ""
            }`}
            title={ev.detail}
          >
            {ev.name}
          </span>
          {itime && (
            <span className="block text-xs text-muted-foreground">{itime}</span>
          )}
        </div>
        {isPast ? (
          hasSurprise ? (
            <SurpriseChip v={ev.earnings!.surprisePercent as number} />
          ) : (
            <span className="shrink-0 text-xs text-muted-foreground">
              발표 완료
            </span>
          )
        ) : (
          <EarningsStatusChip status={ev.status} />
        )}
        <span className="shrink-0 text-xs text-muted-foreground">
          {expanded ? "▴" : "▾"}
        </span>
      </button>
      {expanded && <EarningsDetailPanel ev={ev} isPast={isPast} />}
    </li>
  );
}
