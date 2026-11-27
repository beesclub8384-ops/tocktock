import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import {
  buildRotationSnapshot,
  getRotationSnapshot,
  kstDate,
  saveRotationSnapshot,
  ROTATION_BASE_KEY,
  ROTATION_MARKET_KEY,
  type InstrumentInfo,
  type RotationSnapshot,
} from "@/lib/rotation";
import type { Num, RotationRow, Verdict } from "@/lib/rotation-core";
import { RotationLineChart, type LineSeries } from "./line-chart";
import { ScrollEnd } from "./scroll-end";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const metadata: Metadata = {
  title: "순환매 점검 - TockTock",
  description: "반도체가 빠질 때 먼저 꺾였던 조선·방산이 돌아오고 있는지, 업종별 흐름을 숫자로 확인합니다.",
};

/* ───────────────────────── 표시 도우미 ───────────────────────── */

function fp(v: Num, d = 1): string {
  if (v === null) return "–";
  return `${v > 0 ? "+" : ""}${v.toFixed(d)}%`;
}

/** 등락 배경색 — 상승 빨강 / 하락 파랑 (사이트 섹터 화면과 같은 색), cap% 에서 가장 진하다 */
function heat(v: Num, cap: number): { style: CSSProperties; strong: boolean } {
  if (v === null) return { style: {}, strong: false };
  const t = Math.max(-1, Math.min(1, v / cap));
  const a = Math.pow(Math.abs(t), 0.75) * 0.9;
  return {
    style: { backgroundColor: t >= 0 ? `rgba(220,38,38,${a.toFixed(3)})` : `rgba(37,99,235,${a.toFixed(3)})` },
    strong: a > 0.75,
  };
}

/** 좁은 화면용 짧은 표기: 부호 + 정수 (% 생략) */
function fi(v: Num): string {
  if (v === null) return "–";
  if (Math.abs(v) < 0.5) return "0";
  return `${v > 0 ? "+" : ""}${v.toFixed(0)}`;
}

/** 등락 칸 — 모바일은 정수만(표가 화면에 들어오게), PC 는 소수 첫째 자리까지 */
function HeatCell({ v, cap }: { v: Num; cap: number }) {
  const h = heat(v, cap);
  return (
    <td style={h.style} className={`px-1 py-1.5 text-center tabular-nums sm:px-2 ${h.strong ? "text-white" : ""}`}>
      <span className="sm:hidden">{fi(v)}</span>
      <span className="hidden sm:inline">{fp(v)}</span>
    </td>
  );
}

function md(day: string): string {
  return `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

const BADGE: Record<string, string> = {
  예: "bg-foreground text-background",
  확인: "bg-foreground text-background",
  조짐: "bg-muted text-foreground border border-foreground",
  "아직 짧음": "bg-muted text-foreground border border-foreground",
  "시장보다 덜 내림": "bg-muted text-foreground border border-foreground",
  "같은 달": "bg-muted text-foreground border border-foreground",
};
function Badge({ children }: { children: string }) {
  const cls = BADGE[children] ?? "border border-foreground text-foreground";
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>{children}</span>;
}

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/* ───────────────────────── 페이지 ───────────────────────── */

export default async function RotationPage() {
  let snap: RotationSnapshot | null = await getRotationSnapshot().catch(() => null);
  let buildError: string | null = null;
  if (!snap) {
    // 아직 한 번도 수집하지 않았으면(첫 배포 직후) 그 자리에서 한 번 만든다
    try {
      snap = await buildRotationSnapshot();
      await saveRotationSnapshot(snap).catch(() => undefined);
    } catch (e) {
      buildError = e instanceof Error ? e.message : String(e);
    }
  }

  if (!snap) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-20 sm:px-8">
        <h1 className="text-4xl font-bold tracking-tight">순환매 점검</h1>
        <p className="mt-4 text-sm text-muted-foreground">가격 자료를 아직 받지 못했습니다. 잠시 후 다시 열어 주세요.</p>
        {buildError && <p className="mt-2 text-xs text-muted-foreground">원인: {buildError}</p>}
      </div>
    );
  }

  const { result: res, instruments } = snap;
  const inst = new Map<string, InstrumentInfo>(instruments.map((i) => [i.key, i]));
  /** 화면 이름 — ETF 대신 대표 종목을 썼으면 "엔터(하이브)" 처럼 밝힌다 */
  const label = (k: string): string => {
    const i = inst.get(k);
    if (!i) return k;
    return i.fallback ? `${i.label}(${i.name})` : i.label;
  };
  const row = (k: string): RotationRow | undefined => res.rows.find((r) => r.key === k);
  const months = res.months;
  const asOfYear = res.asOf.slice(0, 4);
  const monthName = (idx: number | null): string => {
    if (idx === null) return "–";
    const [y, m] = months[idx].split("-");
    return y === asOfYear ? `${Number(m)}월` : `${y}년 ${Number(m)}월`;
  };

  const baseRow = row(ROTATION_BASE_KEY);
  const marketRow = row(ROTATION_MARKET_KEY);
  const baseLabel = label(ROTATION_BASE_KEY);
  const targets = res.verdicts;
  const targetNames = targets.map((v) => label(v.key)).join("·");
  const isIndex = (k: string) => inst.get(k)?.group === "지수";

  // ── 한 줄 결론 ──
  const confirmed = targets.filter((v) => v.overall === "확인");
  const hint = targets.filter((v) => v.overall === "조짐");
  let headline: string;
  let detail: string;
  if (res.baseFalling === false) {
    headline = `지금은 ${baseLabel}가 내리는 국면이 아닙니다.`;
    detail = `${baseLabel}의 최근 8주 누적은 ${fp(baseRow?.cum8w ?? null)}입니다. 아래 판정은 참고로만 보세요.`;
  } else if (confirmed.length > 0) {
    headline = `${confirmed.map((v) => label(v.key)).join("·")}: 순환매가 숫자로 확인됩니다.`;
    detail = `${baseLabel}보다 먼저 꺾였고, 최근 8주에 올랐고, 2주 이상 이어졌습니다.`;
  } else if (hint.length > 0) {
    headline = `${hint.map((v) => label(v.key)).join("·")}: 조짐은 있지만 아직 짧습니다.`;
    detail = "먼저 꺾였고 최근 주에 반도체와 반대로 움직였지만, 2주 이상 이어지지는 않았습니다.";
  } else {
    headline = "아직 아닙니다.";
    detail = `${targetNames}이 ${baseLabel}가 내리는 동안 함께 내렸거나, 반등이 한 주를 넘지 못했습니다.`;
  }

  // ── 경고 ──
  const today = kstDate(new Date());
  const staleDays = daysBetween(res.asOf, today);
  const recentMismatch = instruments.filter((i) => i.check.status === "불일치" && i.check.recentMismatched > 0);
  const fallbacks = instruments.filter((i) => i.fallback);
  const staleSeries = instruments.filter((i) => i.stale);

  // ── 차트 ──
  const topRiser = res.risers.find((r) => !targets.some((t) => t.key === r.key) && r.key !== ROTATION_BASE_KEY);
  const chartKeys: { key: string; role?: "base" | "market"; color?: string }[] = [
    { key: ROTATION_BASE_KEY, role: "base" },
    ...targets.map((t, i) => ({ key: t.key, color: i === 0 ? "#0072B2" : "#D55E00" })),
    { key: ROTATION_MARKET_KEY, role: "market" as const },
    ...(topRiser ? [{ key: topRiser.key, color: "#CC79A7" }] : []),
  ];
  const seriesFor = (src: { key: string; values: Num[] }[]): LineSeries[] =>
    chartKeys
      .map((c) => {
        const s = src.find((x) => x.key === c.key);
        return s ? { name: label(c.key), values: s.values, role: c.role, color: c.color } : null;
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

  const m12 = res.chart12m.labels;
  const x12 = m12.map((m, i) => (i === 0 ? `${m.slice(2, 4)}.${Number(m.slice(5))}` : `${Number(m.slice(5))}월`));
  const x12m = x12.map((l, i) => ((m12.length - 1 - i) % 2 === 0 ? l : ""));
  const weekEndSet = new Map(res.weeks.map((w, j) => [w.end, j]));
  const d8 = res.chart8w.labels;
  const x8 = d8.map((d, i) => (i === 0 || weekEndSet.has(d) ? md(d) : ""));
  const x8m = d8.map((d) => {
    const j = weekEndSet.get(d);
    return j !== undefined && (res.weeks.length - 1 - j) % 2 === 0 ? md(d) : "";
  });

  // ── 표 정렬: 지수 먼저, 그다음 고점이 이른 순 ──
  const peakSorted = [...res.rows].sort((a, b) => {
    const ia = isIndex(a.key) ? 0 : 1;
    const ib = isIndex(b.key) ? 0 : 1;
    if (ia !== ib) return ia - ib;
    if (ia === 0) return 0;
    return (a.peakIdx ?? 99) - (b.peakIdx ?? 99) || (a.fromPeak ?? 0) - (b.fromPeak ?? 0);
  });
  /** 주간 표의 열 순서: 가장 최근 주부터 */
  const weekOrder = res.weeks.map((_, j) => j).reverse();
  const emph = (k: string) => k === ROTATION_BASE_KEY || targets.some((t) => t.key === k);
  const nameCell = (k: string) =>
    `sticky left-0 z-10 bg-background px-1.5 py-1.5 text-left whitespace-nowrap sm:px-2 ${emph(k) ? "font-bold" : ""} ${isIndex(k) ? "text-muted-foreground" : ""}`;

  const q1Text = (v: Verdict): string => {
    const r = row(v.key);
    if (!r || v.q1 === "자료 없음") return "자료가 부족합니다.";
    const a = `월말 종가 고점이 ${monthName(r.peakIdx)}, ${baseLabel}는 ${monthName(res.basePeakIdx)}입니다.`;
    if (v.q1 !== "예") return a;
    return `${a} 그 사이 ${baseLabel} ${fp(v.leadBaseRet)}, ${label(v.key)} ${fp(v.leadTargetRet)}.`;
  };
  const q2Text = (v: Verdict): string => {
    const r = row(v.key);
    if (!r || v.q2 === "자료 없음") return "자료가 부족합니다.";
    return `최근 8주 누적 ${fp(r.cum8w)}. 같은 기간 코스피 ${fp(marketRow?.cum8w ?? null)}, ${baseLabel} ${fp(baseRow?.cum8w ?? null)}.`;
  };
  const q3Text = (v: Verdict): string => {
    const r = row(v.key);
    if (!r || v.q3 === "자료 없음" || v.streak === null) return "자료가 부족합니다.";
    const lastW = r.weekly[r.weekly.length - 1];
    const lastB = baseRow?.weekly[baseRow.weekly.length - 1] ?? null;
    if (v.streak === 0) return `가장 최근 주 ${fp(lastW)} (${baseLabel} ${fp(lastB)}). 오르면서 ${baseLabel}보다 나았던 주가 아닙니다.`;
    return `오르면서 ${baseLabel}보다 나았던 주가 최근 ${v.streak}주 연속입니다(가장 최근 주 ${fp(lastW)}, ${baseLabel} ${fp(lastB)}). 기준은 2주 이상입니다.`;
  };

  return (
    // [contain:inline-size]: 가로로 긴 표가 페이지 폭을 밀어내지 않게 한다.
    // (layout 의 <main> 이 flex 항목이라, 이게 없으면 모바일에서 본문 전체가 화면보다 넓어져 잘린다)
    <div className="mx-auto max-w-[1100px] px-4 py-20 [contain:inline-size] sm:px-8">
      <header>
        <h1 className="text-4xl font-bold tracking-tight">순환매 점검</h1>
        <p className="mt-2 text-muted-foreground">
          {baseLabel}가 빠질 때, 먼저 꺾였던 {targetNames}이 돌아오고 있는지 숫자로 봅니다.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          기준 {res.asOf} 종가 · 평일 장 마감 뒤 자동 갱신 · 시세 출처 네이버(야후와 날짜별 대조)
        </p>
      </header>

      {(staleDays > 5 || recentMismatch.length > 0 || staleSeries.length > 0) && (
        <div className="mt-4 space-y-1 rounded-lg border-2 border-amber-500 bg-amber-500/10 p-3 text-sm">
          {staleDays > 5 && (
            <p>
              <b>갱신이 멈춘 것 같습니다.</b> 마지막 기준일이 {res.asOf}로 {staleDays}일 전입니다.
            </p>
          )}
          {recentMismatch.length > 0 && (
            <p>
              <b>출처 불일치.</b> 최근 값이 네이버와 야후에서 다릅니다: {recentMismatch.map((i) => `${i.label}(${i.check.recentMismatched}일)`).join(", ")}. 아래 숫자를 그대로 믿지 마세요.
            </p>
          )}
          {staleSeries.length > 0 && (
            <p>
              <b>갱신 지연.</b> {staleSeries.map((i) => `${i.label}(${i.lastDate}까지)`).join(", ")}
            </p>
          )}
        </div>
      )}

      {/* ── 결론 ── */}
      <div className="mt-6 rounded-lg border-l-4 border-foreground bg-muted/50 p-4">
        <p className="text-2xl font-bold">{headline}</p>
        <p className="mt-1 text-sm">{detail}</p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {targets.map((v) => (
          <div key={v.key} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold">{label(v.key)}</h2>
              <Badge>{v.overall}</Badge>
            </div>
            <dl className="mt-3 space-y-3 text-sm">
              {(
                [
                  ["1. 먼저 꺾였나", v.q1, q1Text(v)],
                  ["2. 최근 8주에 올랐나", v.q2, q2Text(v)],
                  ["3. 이어지고 있나", v.q3, q3Text(v)],
                ] as const
              ).map(([q, a, t]) => (
                <div key={q}>
                  <dt className="flex items-center justify-between gap-2 font-semibold">
                    <span>{q}</span>
                    <Badge>{a}</Badge>
                  </dt>
                  <dd className="mt-1 text-muted-foreground">{t}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-border p-4 text-sm">
        <p className="font-bold">
          그 사이 실제로 오른 곳 <span className="font-normal text-muted-foreground">(최근 8주, {res.windowBase ? md(res.windowBase) : "–"} 종가 대비)</span>
        </p>
        {res.risers.length === 0 ? (
          <p className="mt-1 text-muted-foreground">최근 8주 누적이 플러스인 업종이 없습니다.</p>
        ) : (
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {res.risers.map((r) => (
              <li key={r.key}>
                <b>{label(r.key)}</b> {fp(r.cum8w)}
                {r.ups !== null && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {baseLabel}가 내린 {res.baseDownWeeks}주 중 {r.ups}주 상승
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          오른 이유가 순환매인지, 그 업종만의 재료(정책·뉴스) 때문인지는 이 숫자로 가릴 수 없습니다.
        </p>
      </div>

      {/* ── 차트 ── */}
      <Section title="1. 최근 12개월 흐름" sub={`${monthName(months.length - res.chart12m.labels.length)} 말 종가를 100으로 놓았습니다. 월말 종가이고, 마지막 점은 ${md(res.asOf)}입니다.`}>
        <RotationLineChart series={seriesFor(res.chart12m.series)} xLabels={x12} xLabelsMobile={x12m} note="첫 달 말 = 100, 세로축은 비율 눈금" />
      </Section>

      <Section title="2. 최근 8주 흐름" sub={`${res.windowBase ? md(res.windowBase) : "–"} 종가를 100으로 놓은 일별 종가입니다.`}>
        <RotationLineChart series={seriesFor(res.chart8w.series)} xLabels={x8} xLabelsMobile={x8m} note="8주 전 주의 마지막 종가 = 100, 세로축은 비율 눈금" />
      </Section>

      {/* ── 히트맵 ── */}
      <Section title="3. 업종별 월간 등락률" sub="빨강은 상승, 파랑은 하락입니다. 진할수록 폭이 큽니다(±30%에서 가장 진함). 굵은 테두리는 최근 12개월 중 월말 종가가 가장 높았던 달입니다.">
        <ScrollEnd className="rounded-lg border border-border">
          <table className="border-separate border-spacing-0 text-[11px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-background px-2 py-1 text-left font-normal text-muted-foreground">전월 말 대비 %</th>
                {months.slice(1).map((m) => (
                  <th key={m} className={`min-w-[34px] px-0.5 py-1 text-center font-normal text-muted-foreground ${m.endsWith("-01") ? "border-l border-foreground" : ""}`}>
                    {m.endsWith("-01") ? <span className="block font-bold text-foreground">{m.slice(2, 4)}년</span> : <span className="block">&nbsp;</span>}
                    {Number(m.slice(5))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="[&_td]:border [&_td]:border-background [&_td]:px-0.5 [&_td]:py-1.5 [&_td]:text-center [&_td]:tabular-nums">
              {res.rows.map((r) => (
                <tr key={r.key}>
                  <th className={`${nameCell(r.key)} font-normal`}>{label(r.key)}</th>
                  {r.monthlyRet.map((v, i) => {
                    const h = heat(v, 30);
                    const m = months[i + 1];
                    const peak = r.peakIdx === i + 1;
                    return (
                      <td
                        key={m}
                        style={h.style}
                        className={[h.strong ? "text-white" : "", m.endsWith("-01") ? "!border-l-foreground" : "", peak ? "outline-2 -outline-offset-2 outline-foreground" : ""].filter(Boolean).join(" ") || undefined}
                      >
                        {v === null ? "" : fi(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollEnd>
        <p className="mt-2 text-xs text-muted-foreground">마지막 칸은 {md(res.asOf)}까지입니다. 빈칸은 상장 전이라 자료가 없는 달입니다. 표는 옆으로 밀어 볼 수 있습니다.</p>
      </Section>

      {/* ── 고점 표 ── */}
      <Section title="4. 누가 먼저 꺾였나" sub={`${baseLabel}의 월말 종가 고점은 ${monthName(res.basePeakIdx)}입니다. 그보다 고점이 이른 업종이 먼저 꺾인 업종입니다.`}>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-separate border-spacing-0 text-xs sm:text-sm">
            <thead>
              <tr className="text-[11px] leading-tight text-muted-foreground sm:text-xs [&_th]:px-1 [&_th]:py-2 [&_th]:font-normal sm:[&_th]:px-2">
                <th className="sticky left-0 z-10 bg-background text-left">업종</th>
                <th>
                  고점
                  <br className="sm:hidden" /> 월
                </th>
                <th>
                  고점
                  <br className="sm:hidden" /> 대비
                </th>
                <th>
                  <span className="whitespace-nowrap">{baseLabel}</span>
                  <br />
                  <span className="whitespace-nowrap">고점 전</span> <span className="whitespace-nowrap">2개월</span>
                </th>
                <th>
                  <span className="whitespace-nowrap">{baseLabel}</span>
                  <br />
                  <span className="whitespace-nowrap">고점 이후</span>
                </th>
                <th>
                  최근
                  <br className="sm:hidden" /> 8주
                </th>
                <th>
                  이번
                  <br className="sm:hidden" /> 달
                </th>
              </tr>
            </thead>
            <tbody>
              {peakSorted.map((r) => (
                <tr key={r.key}>
                  <th className={`${nameCell(r.key)} border-t border-border font-normal`}>{label(r.key)}</th>
                  <td className="border-t border-border px-1 py-1.5 text-center whitespace-nowrap sm:px-2">{monthName(r.peakIdx)}</td>
                  <HeatCell v={r.fromPeak} cap={65} />
                  <HeatCell v={r.preBasePeak} cap={45} />
                  <HeatCell v={r.sinceBasePeak} cap={65} />
                  <HeatCell v={r.cum8w} cap={45} />
                  <HeatCell v={r.mtd} cap={30} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          단위 %. 읽는 법: &ldquo;{baseLabel} 고점 전 2개월&rdquo; 칸이 파란 업종은 {baseLabel}가 오르는 동안 이미 내리고 있던 업종입니다. 그 업종의 &ldquo;최근 8주&rdquo; 칸이 빨갛게 바뀌면 순환매 후보입니다. 고점은 월말 종가 기준이라 달 안의 최고가와는 다를 수 있습니다.
        </p>
      </Section>

      {/* ── 주간 표 ── */}
      <Section title="5. 최근 8주, 주마다" sub={`순환매라면 "${baseLabel}↓" 표시가 있는 주에 ${targetNames} 칸이 빨갛게 나와야 합니다.`}>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-separate border-spacing-0 text-xs sm:text-sm">
            <thead>
              <tr className="text-[11px] leading-tight text-muted-foreground sm:text-xs [&_th]:px-1 [&_th]:py-2 [&_th]:font-normal [&_th]:whitespace-nowrap sm:[&_th]:px-2">
                <th className="sticky left-0 z-10 bg-background text-left">최근 주부터</th>
                <th>
                  8주
                  <br />
                  누적
                </th>
                <th>
                  {baseLabel}↓ {res.baseDownWeeks}주 중
                  <br />
                  오른 주
                </th>
                {weekOrder.map((j) => {
                  const w = res.weeks[j];
                  return (
                    <th key={w.end}>
                      {md(w.end)}
                      {w.tradingDays < 5 && <span className="block text-[10px]">({w.tradingDays}일)</span>}
                      {w.baseDown && <span className="block font-bold text-blue-600 dark:text-blue-400">{baseLabel}↓</span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {res.rows.map((r) => (
                <tr key={r.key}>
                  <th className={`${nameCell(r.key)} border-t border-border font-normal`}>{label(r.key)}</th>
                  <HeatCell v={r.cum8w} cap={45} />
                  <td className="border-t border-border px-1 py-1.5 text-center font-bold tabular-nums sm:px-2">
                    {r.key === ROTATION_BASE_KEY || r.upsOnBaseDown === null ? "–" : `${r.upsOnBaseDown}주`}
                  </td>
                  {weekOrder.map((j) => (
                    <HeatCell key={res.weeks[j].end} v={r.weekly[j]} cap={20} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">단위 %. 왼쪽이 가장 최근 주입니다. 각 칸은 그 주 마지막 거래일 종가를 전주 마지막 거래일 종가와 비교한 값입니다. 날짜 아래 (3일)은 그 주 거래일 수입니다.</p>
      </Section>

      {/* ── 기준·한계·자료 ── */}
      <Section title="6. 판정 기준과 한계">
        <div className="grid gap-6 text-sm md:grid-cols-2">
          <div>
            <h3 className="font-bold">판정 기준</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <b>먼저 꺾였나</b>: 최근 12개월 월말 종가 고점이 {baseLabel}의 고점 월보다 앞이면 &ldquo;예&rdquo;.
              </li>
              <li>
                <b>최근 8주에 올랐나</b>: 8주 누적이 플러스면 &ldquo;예&rdquo;. 마이너스지만 코스피보다 낫면 &ldquo;시장보다 덜 내림&rdquo;.
              </li>
              <li>
                <b>이어지고 있나</b>: 가장 최근 주부터 거슬러, 오르면서 {baseLabel}보다 나았던 주가 연속 2주 이상이면 &ldquo;예&rdquo;, 1주면 &ldquo;아직 짧음&rdquo;.
              </li>
              <li>
                <b>종합</b>: 셋 다 &ldquo;예&rdquo;면 &ldquo;확인&rdquo;. 먼저 꺾였고 1주 이상 이어졌고 2번이 &ldquo;아니오&rdquo;가 아니면 &ldquo;조짐&rdquo;. 그 밖은 &ldquo;아직 아님&rdquo;.
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-bold">한계</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>업종지수가 아니라 대표 ETF 가격입니다. ETF에 담긴 종목과 비중에 따라 실제 업종 흐름과 다를 수 있습니다.</li>
              <li>ETF 가격은 분배금을 받은 것으로 친 수정주가입니다. 배당이 많은 업종(은행·보험·증권 등)은 거래소 종가로 계산한 등락률보다 조금 높게 나옵니다.</li>
              {fallbacks.length > 0 && (
                <li>
                  ETF 자료를 받지 못해 대표 종목 한 개로 대신한 업종이 있습니다: {fallbacks.map((i) => `${i.label}(${i.name})`).join(", ")}. 한 종목의 사정이 섞입니다.
                </li>
              )}
              <li>판정은 기계적인 규칙입니다. 오른 이유(순환매인지 개별 재료인지)는 구분하지 못합니다.</li>
              <li>장 마감 뒤 확정된 종가만 씁니다. 장중 움직임은 들어 있지 않습니다.</li>
            </ul>
          </div>
        </div>

        <h3 className="mt-8 text-sm font-bold">쓴 자료와 출처 대조</h3>
        <div className="mt-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="px-2 py-2 text-left font-normal">업종</th>
                <th className="px-2 py-2 text-left font-normal">쓴 자료</th>
                <th className="px-2 py-2 text-left font-normal">출처</th>
                <th className="px-2 py-2 text-left font-normal">야후와 대조</th>
                <th className="px-2 py-2 text-left font-normal">자료 기간</th>
              </tr>
            </thead>
            <tbody>
              {instruments.map((i) => (
                <tr key={i.key}>
                  <td className="border-t border-border px-2 py-1.5 whitespace-nowrap">{i.label}</td>
                  <td className="border-t border-border px-2 py-1.5 whitespace-nowrap">
                    {i.name} <span className="text-muted-foreground">({i.kind}{i.kind === "지수" ? "" : ` ${i.code}`})</span>
                  </td>
                  <td className="border-t border-border px-2 py-1.5 whitespace-nowrap">{i.source}</td>
                  <td className="border-t border-border px-2 py-1.5 whitespace-nowrap">
                    {i.check.status === "일치" && `일치 (${i.check.compared}일)`}
                    {i.check.status === "불일치" && (
                      <b>
                        불일치 {i.check.mismatched}일 / {i.check.compared}일 (최대 {i.check.maxDiffPct?.toFixed(2)}%, 최근 8주 안 {i.check.recentMismatched}일)
                      </b>
                    )}
                    {i.check.status === "대조 못 함" && <span className="text-muted-foreground">대조 못 함 (한 출처)</span>}
                  </td>
                  <td className="border-t border-border px-2 py-1.5 whitespace-nowrap text-muted-foreground">
                    {i.firstDate} ~ {i.lastDate}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          가격은 분배금(ETF 배당)을 반영한 수정주가입니다. 그래서 오래전 값은 그날 실제 거래 가격보다 조금 낮게 나옵니다. 대조는 야후의 수정종가와 두 출처에 모두 있는 날짜끼리 하며, 0.1% 넘게 다르면 불일치로 셉니다.
        </p>
        {snap.notes.length > 0 && (
          <details className="mt-2 text-xs text-muted-foreground">
            <summary>수집 메모 {snap.notes.length}건</summary>
            <ul className="mt-1 list-disc pl-5">
              {snap.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </details>
        )}
        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
          출처: 네이버 금융 일별 시세, 야후 파이낸스. 등락률·고점·판정은 이 사이트가 계산한 값입니다. 계산 시각 {snap.builtAt.slice(0, 16).replace("T", " ")} UTC.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">이 페이지는 투자 권유가 아닙니다. 모든 투자 판단은 본인의 책임입니다.</p>
      </Section>
    </div>
  );
}
