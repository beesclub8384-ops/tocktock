import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import {
  buildRotationSnapshot,
  getRotationSnapshot,
  kstDate,
  saveRotationSnapshot,
  ROTATION_BASE_KEY,
  ROTATION_MARKET_KEY,
  SECTOR_CATEGORIES,
  type InstrumentInfo,
  type RotationSnapshot,
} from "@/lib/rotation";
import type { Num, RotationRow, Verdict } from "@/lib/rotation-core";
import { RotationLineChart, type LineSeries } from "./line-chart";
import { MiniCharts, type MiniGroup } from "./mini-charts";
import { ScrollEnd } from "./scroll-end";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const metadata: Metadata = {
  title: "업종별 주가 흐름 - TockTock",
  description: "몇 달 동안 업종별 주가가 어떻게 흘렀는지 사실만 모았습니다. 판단은 직접 하세요.",
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

/** 월간 등락률 몇 개를 이어 붙인 누적 등락률(%) */
function compound(rets: Num[]): Num {
  let f = 1;
  for (const r of rets) {
    if (r === null) return null;
    f *= 1 + r / 100;
  }
  return (f - 1) * 100;
}

/** 보는 법 예시의 기준 충족 여부 — 판정이 아니라 규칙에 맞는지만 보여 준다 */
const CHECK_LABEL: Record<string, string> = {
  예: "충족",
  아니오: "미충족",
  "같은 달": "미충족",
  "아직 짧음": "1주뿐",
  "시장보다 덜 내림": "시장보다 덜 내림",
  "자료 없음": "자료 없음",
};
function Check({ v }: { v: string }) {
  const label = CHECK_LABEL[v] ?? v;
  const cls = label === "충족" ? "bg-foreground text-background" : "border border-foreground text-foreground";
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>{label}</span>;
}

function Section({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** 4가지 선 색 — 라이트·다크에서 색각 이상 구분 검사를 통과한 조합, 선 끝에 이름을 직접 적어 색에만 기대지 않는다 */
const LINE_COLORS = ["#0072B2", "#D55E00", "#009E73", "#CC79A7"];

/* ───────────────────────── 페이지 ───────────────────────── */

export default async function SectorFlowPage() {
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
        <h1 className="text-4xl font-bold tracking-tight">업종별 주가 흐름</h1>
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
  const isIndex = (k: string) => inst.get(k)?.group === "지수";

  const baseRow = row(ROTATION_BASE_KEY);
  const marketRow = row(ROTATION_MARKET_KEY);
  const baseLabel = label(ROTATION_BASE_KEY);
  const targets = res.verdicts;
  const targetNames = targets.map((v) => label(v.key)).join("·");

  /** 업종 묶음 순서대로 행을 나눈다 (지수 → 기술·성장 → 산업재 → 금융 → 소비·콘텐츠) */
  const grouped = SECTOR_CATEGORIES.map((cat) => ({
    cat,
    rows: res.rows.filter((r) => inst.get(r.key)?.category === cat),
  })).filter((g) => g.rows.length > 0);
  const sectorRows = res.rows.filter((r) => !isIndex(r.key));

  // ── 한눈에 보기: 순위만, 해석 없이 ──
  const rank = (pick: (r: RotationRow) => Num) =>
    sectorRows
      .map((r) => ({ key: r.key, v: pick(r) }))
      .filter((x): x is { key: string; v: number } => x.v !== null)
      .sort((a, b) => b.v - a.v);
  const by8w = rank((r) => r.cum8w);
  const byMtd = rank((r) => r.mtd);
  const peakGroups = new Map<number, string[]>();
  for (const r of sectorRows) {
    if (r.peakIdx === null) continue;
    peakGroups.set(r.peakIdx, [...(peakGroups.get(r.peakIdx) ?? []), label(r.key)]);
  }
  // 최근 12개월을 모두 적는다 — 고점 업종이 없는 달도 "없음"으로 보여 줘야 빠진 달로 오해하지 않는다
  const peakList: [number, string[]][] = [];
  for (let i = Math.max(0, months.length - 12); i < months.length; i++) peakList.push([i, peakGroups.get(i) ?? []]);

  // ── 경고 ──
  const today = kstDate(new Date());
  const staleDays = daysBetween(res.asOf, today);
  const recentMismatch = instruments.filter((i) => i.check.status === "불일치" && i.check.recentMismatched > 0);
  const fallbacks = instruments.filter((i) => i.fallback);
  const staleSeries = instruments.filter((i) => i.stale);

  // ── 차트: 코스피 + 최근 8주 가장 많이 오른 2개·내린 2개 업종 ──
  const chartPick = [...by8w.slice(0, 2), ...by8w.slice(-2)].map((x) => x.key);
  const chartKeys: { key: string; role?: "market"; color?: string }[] = [
    { key: ROTATION_MARKET_KEY, role: "market" },
    ...chartPick.map((k, i) => ({ key: k, color: LINE_COLORS[i] })),
  ];
  const seriesFor = (src: { key: string; values: Num[] }[], keys = chartKeys): LineSeries[] =>
    keys
      .map((c) => {
        const s = src.find((x) => x.key === c.key);
        // 차트 끝 이름은 짧게(업종 이름만) — 대표 종목 이름까지 붙이면 휴대폰에서 잘린다
        return s ? { name: inst.get(c.key)?.label ?? c.key, values: s.values, role: c.role, color: c.color } : null;
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

  const m12 = res.chart12m.labels;
  // ── 작은 차트 모음: 업종 묶음별, 지수는 코스닥만(코스피는 모든 칸에 점선으로 들어간다) ──
  const miniOffset = months.length - m12.length;
  const miniMarket = res.chart12m.series.find((x) => x.key === ROTATION_MARKET_KEY)?.values ?? [];
  const miniGroups: MiniGroup[] = grouped
    .map((g) => ({
      title: g.cat,
      items: g.rows
        .filter((r) => r.key !== ROTATION_MARKET_KEY)
        .map((r) => ({
          key: r.key,
          name: label(r.key),
          values: res.chart12m.series.find((x) => x.key === r.key)?.values ?? [],
          peakPos: r.peakIdx === null ? null : r.peakIdx - miniOffset,
          peakLabel: monthName(r.peakIdx),
        })),
    }))
    .filter((g) => g.items.length > 0);
  const x12 = m12.map((m, i) => (i === 0 ? `${m.slice(2, 4)}.${Number(m.slice(5))}` : `${Number(m.slice(5))}월`));
  const x12m = x12.map((l, i) => ((m12.length - 1 - i) % 2 === 0 ? l : ""));
  const weekEndSet = new Map(res.weeks.map((w, j) => [w.end, j]));
  const d8 = res.chart8w.labels;
  const x8 = d8.map((d, i) => (i === 0 || weekEndSet.has(d) ? md(d) : ""));
  const x8m = d8.map((d) => {
    const j = weekEndSet.get(d);
    return j !== undefined && (res.weeks.length - 1 - j) % 2 === 0 ? md(d) : "";
  });

  /** 주간 표의 열 순서: 가장 최근 주부터 */
  const weekOrder = res.weeks.map((_, j) => j).reverse();
  const nameCell = (k: string, extra = "") =>
    `sticky left-0 z-10 bg-background px-1.5 py-1.5 text-left whitespace-nowrap sm:px-2 font-normal ${isIndex(k) ? "text-muted-foreground" : ""} ${extra}`;
  // 묶음 이름은 첫 칸(이름 칸)에만 둔다 — 여러 칸을 합친 칸을 고정(sticky)하면 표를 옆으로 밀었을 때 글자가 화면 밖으로 나간다
  const groupHeader = (cat: string, colSpan: number) => (
    <tr key={`h-${cat}`}>
      <th className="sticky left-0 z-10 bg-background px-1.5 pt-3 pb-1 text-left text-[11px] font-bold whitespace-nowrap text-muted-foreground sm:px-2">{cat}</th>
      <td colSpan={colSpan - 1} />
    </tr>
  );
  const threeMonths = (r: RotationRow) => compound(r.monthlyRet.slice(-3));

  // ── 보는 법 예시 문장 (사실만) ──
  const q1Text = (v: Verdict): string => {
    const r = row(v.key);
    if (!r || v.q1 === "자료 없음") return "자료가 부족합니다.";
    const a = `${label(v.key)}의 월말 종가 고점은 ${monthName(r.peakIdx)}, ${baseLabel}는 ${monthName(res.basePeakIdx)}입니다.`;
    if (v.q1 !== "예") return a;
    return `${a} 그 사이 ${baseLabel} ${fp(v.leadBaseRet)}, ${label(v.key)} ${fp(v.leadTargetRet)}.`;
  };
  const q2Text = (v: Verdict): string => {
    const r = row(v.key);
    if (!r || v.q2 === "자료 없음") return "자료가 부족합니다.";
    return `최근 8주 ${label(v.key)} ${fp(r.cum8w)}, 코스피 ${fp(marketRow?.cum8w ?? null)}, ${baseLabel} ${fp(baseRow?.cum8w ?? null)}.`;
  };
  const q3Text = (v: Verdict): string => {
    const r = row(v.key);
    if (!r || v.q3 === "자료 없음" || v.streak === null) return "자료가 부족합니다.";
    const lastW = r.weekly[r.weekly.length - 1];
    const lastB = baseRow?.weekly[baseRow.weekly.length - 1] ?? null;
    return `오르면서 ${baseLabel}보다 나았던 주가 최근 ${v.streak}주 연속입니다(가장 최근 주 ${label(v.key)} ${fp(lastW)}, ${baseLabel} ${fp(lastB)}).`;
  };
  const exampleKeys = [ROTATION_BASE_KEY, ...targets.map((t) => t.key), ROTATION_MARKET_KEY];

  return (
    // [contain:inline-size]: 가로로 긴 표가 페이지 폭을 밀어내지 않게 한다.
    // (layout 의 <main> 이 flex 항목이라, 이게 없으면 모바일에서 본문 전체가 화면보다 넓어져 잘린다)
    <div className="mx-auto max-w-[1100px] px-4 py-20 [contain:inline-size] sm:px-8">
      <header>
        <h1 className="text-4xl font-bold tracking-tight">업종별 주가 흐름</h1>
        <p className="mt-2 text-muted-foreground">몇 달 동안 업종별 주가가 어떻게 흘렀는지 사실만 모았습니다. 판단은 직접 하세요.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          기준 {res.asOf} 종가 · 업종 {sectorRows.length}개 · 평일 장 마감 뒤 자동 갱신 · 시세 출처 네이버(야후와 날짜별 대조) · 오늘 하루 등락은{" "}
          <Link href="/sectors" className="underline">
            섹터별 현황
          </Link>
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

      {/* ── 한눈에 보기 ── */}
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {(
          [
            [`최근 8주 (${res.windowBase ? md(res.windowBase) : "–"} 종가 대비)`, by8w],
            [`이번 달 (${md(res.asOf)}까지)`, byMtd],
          ] as const
        ).map(([title, list]) => (
          <div key={title} className="rounded-lg border border-border bg-card p-4 text-sm">
            <p className="font-bold">{title}</p>
            <p className="mt-2 text-xs text-muted-foreground">가장 많이 오른 3개</p>
            <ol className="mt-1 space-y-0.5">
              {list.slice(0, 3).map((x) => (
                <li key={x.key} className="flex justify-between gap-2">
                  <span>{label(x.key)}</span>
                  <span className="tabular-nums font-semibold text-red-600 dark:text-red-400">{fp(x.v)}</span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs text-muted-foreground">가장 많이 내린 3개</p>
            <ol className="mt-1 space-y-0.5">
              {list
                .slice(-3)
                .reverse()
                .map((x) => (
                  <li key={x.key} className="flex justify-between gap-2">
                    <span>{label(x.key)}</span>
                    <span className="tabular-nums font-semibold text-blue-600 dark:text-blue-400">{fp(x.v)}</span>
                  </li>
                ))}
            </ol>
            <p className="mt-2 text-xs text-muted-foreground">같은 기간 코스피 {fp(title.startsWith("최근") ? marketRow?.cum8w ?? null : marketRow?.mtd ?? null)}</p>
          </div>
        ))}
        <div className="rounded-lg border border-border bg-card p-4 text-sm">
          <p className="font-bold">최근 12개월 월말 종가 고점</p>
          <p className="mt-1 text-xs text-muted-foreground">업종 {sectorRows.length}개가 각각 어느 달에 가장 높았나 (&ldquo;없음&rdquo; = 그 달에 고점을 찍은 업종이 없음)</p>
          <ul className="mt-2 space-y-1">
            {peakList.map(([idx, names]) => (
              <li key={idx} className="flex gap-2">
                <span className="w-20 shrink-0 font-semibold whitespace-nowrap">{monthName(idx).replace(/^20(\d\d)년 /, "$1년 ")}</span>
                <span className="text-muted-foreground">{names.length ? names.join(", ") : "없음"}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── 1. 업종마다 작은 차트 ── */}
      <Section
        title="1. 업종별 최근 12개월 흐름"
        sub={`업종마다 차트 하나입니다. ${monthName(miniOffset)} 말 종가를 100으로 놓았고, 모든 칸의 세로 눈금이 같아서 서로 비교할 수 있습니다.`}
      >
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 bg-foreground" />그 업종
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: "#8a8a84" }} />
            코스피
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full border-[1.5px] border-foreground" />
            고점
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-foreground" />
            지금 ({md(res.asOf)})
          </span>
          <span>오른쪽 숫자 = 12개월 전 대비</span>
        </div>
        <MiniCharts groups={miniGroups} market={miniMarket} firstLabel={`${Number(m12[0].slice(5))}월`} lastLabel={`${Number(m12[m12.length - 1].slice(5))}월`} />
        <p className="mt-2 text-xs text-muted-foreground">
          월말 종가를 이은 선이고, 마지막 점은 {md(res.asOf)} 종가입니다. 점선보다 위에 있으면 12개월 동안 코스피보다 많이 오른 업종입니다.
        </p>

        <details className="mt-4 rounded-lg border border-border">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">월별 숫자 자세히 보기 (최근 3년 월간 등락률 표)</summary>
          <p className="px-3 pb-2 text-xs text-muted-foreground">
            빨강은 상승, 파랑은 하락입니다. 진할수록 폭이 큽니다(±30%에서 가장 진함). 굵은 테두리는 최근 12개월 중 월말 종가가 가장 높았던 달입니다.
          </p>
        <ScrollEnd className="border-t border-border">
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
              {grouped.flatMap((g) => [
                groupHeader(g.cat, months.length),
                ...g.rows.map((r) => (
                  <tr key={r.key}>
                    <th className={nameCell(r.key)}>{label(r.key)}</th>
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
                )),
              ])}
            </tbody>
          </table>
        </ScrollEnd>
          <p className="px-3 py-2 text-xs text-muted-foreground">마지막 칸은 {md(res.asOf)}까지입니다. 빈칸은 상장 전이라 자료가 없는 달입니다. 표는 옆으로 밀어 볼 수 있습니다.</p>
        </details>
      </Section>

      {/* ── 2·3. 차트 ── */}
      <Section
        title="2. 겹쳐 보기: 최근 12개월"
        sub={`최근 8주 동안 가장 많이 오른 2개·가장 많이 내린 2개 업종과 코스피입니다. ${monthName(months.length - res.chart12m.labels.length)} 말 종가를 100으로 놓았습니다.`}
      >
        <RotationLineChart series={seriesFor(res.chart12m.series)} xLabels={x12} xLabelsMobile={x12m} note="첫 달 말 = 100, 월말 종가, 세로축은 비율 눈금" />
      </Section>

      <Section title="3. 겹쳐 보기: 최근 8주" sub={`같은 업종을 ${res.windowBase ? md(res.windowBase) : "–"} 종가를 100으로 놓고 일별로 봅니다.`}>
        <RotationLineChart series={seriesFor(res.chart8w.series)} xLabels={x8} xLabelsMobile={x8m} note="8주 전 주의 마지막 종가 = 100, 세로축은 비율 눈금" />
      </Section>

      {/* ── 4. 고점 표 ── */}
      <Section title="4. 업종별 고점과 그 뒤 흐름" sub="최근 12개월 중 월말 종가가 가장 높았던 달과, 그 뒤 얼마나 움직였는지입니다.">
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
                  최근
                  <br className="sm:hidden" /> 3개월
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
              {grouped.flatMap((g) => [
                groupHeader(g.cat, 6),
                ...g.rows.map((r) => (
                  <tr key={r.key}>
                    <th className={nameCell(r.key, "border-t border-border")}>{label(r.key)}</th>
                    <td className="border-t border-border px-1 py-1.5 text-center whitespace-nowrap sm:px-2">{monthName(r.peakIdx)}</td>
                    <HeatCell v={r.fromPeak} cap={65} />
                    <HeatCell v={threeMonths(r)} cap={45} />
                    <HeatCell v={r.cum8w} cap={45} />
                    <HeatCell v={r.mtd} cap={30} />
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          단위 %. &ldquo;고점 대비&rdquo;는 고점 달의 월말 종가와 {md(res.asOf)} 종가를 비교한 값입니다. &ldquo;최근 3개월&rdquo;은 3개월 전 월말 종가 대비입니다. 고점은 월말 종가 기준이라 달 안의 최고가와는 다를 수 있습니다.
        </p>
      </Section>

      {/* ── 5. 주간 표 ── */}
      <Section title="5. 최근 8주, 주마다" sub="각 칸은 그 주 마지막 거래일 종가를 전주 마지막 거래일 종가와 비교한 값입니다. 왼쪽이 가장 최근 주입니다.">
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
                {weekOrder.map((j) => {
                  const w = res.weeks[j];
                  return (
                    <th key={w.end}>
                      {md(w.end)}
                      {w.tradingDays < 5 && <span className="block text-[10px]">({w.tradingDays}일)</span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {grouped.flatMap((g) => [
                groupHeader(g.cat, weekOrder.length + 2),
                ...g.rows.map((r) => (
                  <tr key={r.key}>
                    <th className={nameCell(r.key, "border-t border-border")}>{label(r.key)}</th>
                    <HeatCell v={r.cum8w} cap={45} />
                    {weekOrder.map((j) => (
                      <HeatCell key={res.weeks[j].end} v={r.weekly[j]} cap={20} />
                    ))}
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">단위 %. 날짜 아래 (3일)은 그 주 거래일 수입니다.</p>
      </Section>

      {/* ── 6. 보는 법 예시 ── */}
      <Section
        title={`6. 보는 법 예시: ${baseLabel}가 빠질 때 ${targetNames}이 돌아오고 있나`}
        sub="이 페이지의 숫자로 '순환매(돈이 한 업종에서 다른 업종으로 옮겨 가는 것)'를 직접 확인하는 방법입니다. 판정이 아니라 데이터를 읽는 순서입니다."
      >
        <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
          <p className="font-bold">확인 순서</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            <li>
              <b>먼저 꺾였나</b>: 4번 표에서 {targetNames}의 고점 월이 {baseLabel}보다 앞인지 봅니다.
            </li>
            <li>
              <b>최근에 올랐나</b>: 4번 표 &ldquo;최근 8주&rdquo; 칸이 플러스인지, 아니면 적어도 코스피보다 나은지 봅니다.
            </li>
            <li>
              <b>이어지고 있나</b>: 아래 표에서 &ldquo;{baseLabel}↓&rdquo; 주에 {targetNames} 칸이 빨간 주가 2주 이상 이어지는지 봅니다.
            </li>
          </ol>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {targets.map((v) => (
            <div key={v.key} className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-lg font-bold">{label(v.key)}</h3>
              <dl className="mt-3 space-y-3 text-sm">
                {(
                  [
                    ["1. 먼저 꺾였나", v.q1, q1Text(v)],
                    ["2. 최근 8주에 올랐나", v.q2, q2Text(v)],
                    ["3. 2주 이상 이어지나", v.q3, q3Text(v)],
                  ] as const
                ).map(([q, a, t]) => (
                  <div key={q}>
                    <dt className="flex items-center justify-between gap-2 font-semibold">
                      <span>{q}</span>
                      <Check v={a} />
                    </dt>
                    <dd className="mt-1 text-muted-foreground">{t}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-separate border-spacing-0 text-xs sm:text-sm">
            <thead>
              <tr className="text-[11px] leading-tight text-muted-foreground sm:text-xs [&_th]:px-1 [&_th]:py-2 [&_th]:font-normal [&_th]:whitespace-nowrap sm:[&_th]:px-2">
                <th className="sticky left-0 z-10 bg-background text-left">최근 주부터</th>
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
                      {w.baseDown && <span className="block font-bold text-blue-600 dark:text-blue-400">{baseLabel}↓</span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {exampleKeys
                .map((k) => row(k))
                .filter((r): r is RotationRow => !!r)
                .map((r) => (
                  <tr key={r.key}>
                    <th className={nameCell(r.key, "border-t border-border")}>{label(r.key)}</th>
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
        <p className="mt-2 text-xs text-muted-foreground">
          다른 업종도 같은 방법으로 볼 수 있습니다. 예를 들어 5번 표에서 {baseLabel} 줄이 파란 주에 어느 업종 줄이 빨간지 찾아보세요. 오른 이유가 돈의 이동인지, 그 업종만의 재료(정책·뉴스) 때문인지는 숫자만으로 가릴 수 없습니다.
        </p>
      </Section>

      {/* ── 7. 자료·한계 ── */}
      <Section title="7. 자료와 한계">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>업종지수가 아니라 대표 ETF 가격입니다. ETF에 담긴 종목과 비중에 따라 실제 업종 흐름과 다를 수 있습니다.</li>
          <li>ETF 가격은 분배금을 받은 것으로 친 수정주가입니다. 배당이 많은 업종(은행·보험·증권 등)은 거래소 종가로 계산한 등락률보다 조금 높게 나옵니다.</li>
          {fallbacks.length > 0 && (
            <li>
              ETF 자료를 받지 못해 대표 종목 한 개로 대신한 업종이 있습니다: {fallbacks.map((i) => `${i.label}(${i.name})`).join(", ")}. 한 종목의 사정이 섞입니다.
            </li>
          )}
          <li>장 마감 뒤 확정된 종가만 씁니다. 장중 움직임은 들어 있지 않습니다.</li>
        </ul>

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
              {SECTOR_CATEGORIES.flatMap((cat) => instruments.filter((i) => i.category === cat)).map((i) => (
                <tr key={i.key}>
                  <td className="border-t border-border px-2 py-1.5 whitespace-nowrap">{i.label}</td>
                  <td className="border-t border-border px-2 py-1.5 whitespace-nowrap">
                    {i.name} <span className="text-muted-foreground">({i.kind}{i.kind === "지수" ? "" : ` ${i.code}`})</span>
                  </td>
                  <td className="border-t border-border px-2 py-1.5 whitespace-nowrap">{i.source}</td>
                  <td className="border-t border-border px-2 py-1.5 whitespace-nowrap">
                    {i.check.status === "일치" && `일치 (${i.check.compared}일)`}
                    {i.check.status === "조정 차이" && (
                      <>
                        일치 ({i.check.compared}일){" "}
                        <span className="text-muted-foreground">· 분배금 조정 차이 최대 {i.check.maxDiffPct?.toFixed(2)}%</span>
                      </>
                    )}
                    {i.check.status === "불일치" && (
                      <b>
                        불일치 {i.check.returnMismatched}일 / {i.check.compared}일 (최근 8주 안 {i.check.recentMismatched}일)
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
          대조는 야후의 수정종가와 두 출처에 모두 있는 날짜끼리 합니다. 하루 등락률이 1%p 넘게 다른 날이 있으면 &ldquo;불일치&rdquo;입니다. 등락률은 같은데 분배금을 반영하는 계산 방식 차이로 가격 수준만 조금 어긋나면 &ldquo;분배금 조정 차이&rdquo;로 따로 적습니다.
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
          출처: 네이버 금융 일별 시세, 야후 파이낸스. 등락률·고점·순위는 이 사이트가 계산한 값입니다. 계산 시각 {snap.builtAt.slice(0, 16).replace("T", " ")} UTC.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">이 페이지는 투자 권유가 아닙니다. 모든 투자 판단은 본인의 책임입니다.</p>
      </Section>
    </div>
  );
}
