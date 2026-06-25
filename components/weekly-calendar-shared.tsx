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
  /** 최근 최대 4분기 서프라이즈 이력 (오래된→최신). 차트용 */
  history?: { quarter: string; surprisePercent: number }[];
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

/**
 * 이 실적 항목이 "발표 완료"인가 — 날짜가 아니라 실제 결과 유무로 판정.
 * earnings.surprisePercent 또는 epsActual이 유효(finite)하게 들어와 있으면 발표 완료.
 * (발표 당일이라도 결과가 채워졌으면 완료. 같은 날 그룹에 완료/예정이 섞여도 항목별로 정확)
 */
export function isEarningsReported(ev: CalendarEvent): boolean {
  return (
    ev.category === "earnings" &&
    (Number.isFinite(ev.earnings?.surprisePercent) ||
      Number.isFinite(ev.earnings?.epsActual))
  );
}

/**
 * 지표 이름(name) → 해설(무엇/왜). 데이터의 name과 정확히 매칭.
 * 매핑에 없는 지표명은 해설 펼침 비활성(한 줄로만 표시).
 */
export const INDICATOR_DESC: Record<string, { what: string; why: string }> = {
  "소비자물가지수(CPI)": {
    what: "소비자가 사는 상품·서비스 가격이 얼마나 올랐는지 보여주는 대표 물가 지표입니다.",
    why: "인플레이션을 가장 먼저·널리 보는 숫자라 연준의 금리 결정과 시장이 크게 반응합니다.",
  },
  "PCE 물가(개인소득·지출)": {
    what: "소비자가 실제 지출한 내역까지 반영한 물가 지표로, 연준이 통화정책의 공식 기준으로 삼습니다.",
    why: "CPI보다 발표는 늦지만 연준이 더 중시해 금리 향방의 핵심 단서가 됩니다.",
  },
  "생산자물가지수(PPI)": {
    what: "기업이 물건을 만들어 팔 때 받는 가격, 즉 생산자 단계의 물가입니다.",
    why: "생산 단가가 시차를 두고 소비자 물가로 옮겨가, CPI보다 앞선 인플레이션 선행 신호로 봅니다.",
  },
  고용보고서: {
    what: "한 달간 늘어난 일자리 수와 실업률을 보여주는 핵심 고용 지표입니다(매월 첫째 주 발표).",
    why: "고용은 경기·소비의 바탕이라, 연준이 물가와 함께 가장 무겁게 보는 두 축 중 하나입니다.",
  },
  소매판매: {
    what: "소비자가 실제로 얼마나 돈을 썼는지 보여주는 지표입니다.",
    why: "미국은 소비 비중이 커서, 늘면 경기 호조·줄면 둔화 우려로 읽힙니다.",
  },
  GDP: {
    what: "한 나라가 일정 기간 만들어낸 경제 활동의 총량으로, 경기 전체의 성적표입니다.",
    why: "분기마다 1·2·3차로 나눠 발표되며(뒤로 갈수록 확정치), 예상과 다르면 시장이 크게 움직입니다.",
  },
  "FOMC 회의": {
    what: "미국의 기준금리를 결정하는 연준의 통화정책 회의입니다(연 8회).",
    why: "금리와 함께 발표되는 방향성·점도표가 시장 전체에 가장 큰 영향을 주는 이벤트입니다.",
  },
};

/** 지표 해설 펼침 패널. 해설이 있으면 무엇/왜 2줄, 없으면 null */
export function IndicatorDescPanel({ name }: { name: string }) {
  const desc = INDICATOR_DESC[name];
  if (!desc) return null;
  return (
    <div className="ml-9 mt-1 space-y-0.5 text-xs text-muted-foreground">
      <div>{desc.what}</div>
      <div>{desc.why}</div>
    </div>
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

/** "2025-06" → "25.06" (YYYY-MM → YY.MM) */
function fmtQuarterShort(q: string): string {
  const m = q.match(/^(\d{4})-(\d{2})/);
  if (!m) return q;
  return `${m[1].slice(2)}.${m[2]}`;
}

const POS_BAR = "bg-green-600 dark:bg-green-400";
const NEG_BAR = "bg-red-600 dark:bg-red-400";

/**
 * 최근 4분기 서프라이즈 막대 차트 (순수 CSS).
 * 0% 기준선 위(상회=초록)/아래(하회=빨강)로 갈리며, 막대 높이는
 * 그룹 내 |surprisePercent| 최대값 기준 상대 정규화. 항목 2개 이상일 때만 렌더.
 */
function SurpriseBarChart({
  history,
}: {
  history: { quarter: string; surprisePercent: number }[];
}) {
  if (!history || history.length < 2) return null;
  const MAXH = 30; // 기준선 한쪽 막대 최대 높이(px)
  const maxAbs = Math.max(...history.map((h) => Math.abs(h.surprisePercent)), 0);
  const barPx = (v: number) =>
    maxAbs > 0 ? Math.max(3, Math.round((Math.abs(v) / maxAbs) * MAXH)) : 1;

  return (
    <div className="mt-2">
      <div className="mb-1 text-[11px] text-muted-foreground">
        최근 4분기 서프라이즈
      </div>
      <div className="flex items-stretch gap-3">
        {history.map((h) => {
          const up = h.surprisePercent >= 0;
          const label = `${up ? "+" : ""}${h.surprisePercent.toFixed(1)}%`;
          const hpx = barPx(h.surprisePercent);
          return (
            <div
              key={h.quarter}
              className="flex flex-1 flex-col items-center gap-0.5"
            >
              {/* 양수(상회): 기준선 위 */}
              <div className="flex h-9 w-full flex-col items-center justify-end">
                {up && (
                  <>
                    <span
                      className={`text-[10px] font-semibold leading-none ${POS_CLS}`}
                    >
                      {label}
                    </span>
                    <div
                      className={`mt-0.5 w-3 rounded-t-sm ${POS_BAR}`}
                      style={{ height: hpx }}
                    />
                  </>
                )}
              </div>
              {/* 0% 기준선 */}
              <div className="h-px w-full bg-border" />
              {/* 음수(하회): 기준선 아래 */}
              <div className="flex h-9 w-full flex-col items-center justify-start">
                {!up && (
                  <>
                    <div
                      className={`mb-0.5 w-3 rounded-b-sm ${NEG_BAR}`}
                      style={{ height: hpx }}
                    />
                    <span
                      className={`text-[10px] font-semibold leading-none ${NEG_CLS}`}
                    >
                      {label}
                    </span>
                  </>
                )}
              </div>
              <span className="text-[10px] leading-none text-muted-foreground">
                {fmtQuarterShort(h.quarter)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EarningsDetailPanel({ ev }: { ev: CalendarEvent }) {
  const e = ev.earnings;
  if (!e) {
    return (
      <div className="ml-9 mt-1 text-xs text-muted-foreground">
        상세 정보 없음
      </div>
    );
  }
  const reported = isEarningsReported(ev);
  const cur = e.currency;
  const fin = [
    typeof e.revenue === "number" ? `매출 ${fmtMoney(e.revenue, cur)}` : null,
    typeof e.netIncome === "number"
      ? `순이익 ${fmtMoney(e.netIncome, cur)}`
      : null,
  ].filter(Boolean);

  return (
    <div className="ml-9 mt-1 space-y-0.5 text-xs text-muted-foreground">
      {reported ? (
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
          {fin.length > 0 && (
            <div>
              <span className="mr-1 text-muted-foreground/60">실적</span>
              {fin.join(" · ")}
            </div>
          )}
          {e.history && <SurpriseBarChart history={e.history} />}
        </>
      ) : (
        <>
          {typeof e.epsEstimate === "number" && (
            <div>예상 EPS {fmtEps(e.epsEstimate, cur)}</div>
          )}
          {typeof e.revenue === "number" && (
            <div>예상 매출 {fmtMoney(e.revenue, cur)}</div>
          )}
          {e.history && (
            <div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                과거 흐름
              </div>
              <SurpriseBarChart history={e.history} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * 일정 한 줄. 실적은 클릭 시 펼침(결과 상세). 지표는 해설이 있으면 클릭 시 펼침(무엇/왜).
 * 모달의 행 표시와 동일한 모양.
 */
export function EventRow({
  ev,
  expanded,
  onToggle,
}: {
  ev: CalendarEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  const itime = eventTimeText(ev);
  const reported = isEarningsReported(ev);

  if (ev.category !== "earnings") {
    const hasDesc = !!INDICATOR_DESC[ev.name];
    // 해설 없는 지표는 펼침 없이 기존처럼 한 줄
    if (!hasDesc) {
      return (
        <li className="flex items-center gap-2">
          <MarketTag market={ev.market} />
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm" title={ev.detail}>
              {ev.name}
            </span>
            {itime && (
              <span className="block text-xs text-muted-foreground">
                {itime}
              </span>
            )}
          </div>
          <KindBadge ev={ev} />
        </li>
      );
    }
    // 해설 있는 지표: 실적과 동일한 모양으로 클릭 펼침
    return (
      <li>
        <button
          onClick={onToggle}
          className="flex w-full items-center gap-2 text-left"
        >
          <MarketTag market={ev.market} />
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm" title={ev.detail}>
              {ev.name}
            </span>
            {itime && (
              <span className="block text-xs text-muted-foreground">
                {itime}
              </span>
            )}
          </div>
          <KindBadge ev={ev} />
          <span className="shrink-0 text-xs text-muted-foreground">
            {expanded ? "▴" : "▾"}
          </span>
        </button>
        {expanded && <IndicatorDescPanel name={ev.name} />}
      </li>
    );
  }

  const hasSurprise =
    reported && typeof ev.earnings?.surprisePercent === "number";
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
              reported ? "text-muted-foreground" : ""
            }`}
            title={ev.detail}
          >
            {ev.name}
          </span>
          {itime && (
            <span className="block text-xs text-muted-foreground">{itime}</span>
          )}
        </div>
        {reported ? (
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
      {expanded && <EarningsDetailPanel ev={ev} />}
    </li>
  );
}
