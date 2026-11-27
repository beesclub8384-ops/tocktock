"use client";

import { useState, type PointerEvent } from "react";

/**
 * 모든 업종을 한 차트에 겹쳐 보는 선 차트.
 *
 *  - 전 업종을 옅은 회색 선으로 깔고, 고른 업종만 색 선으로 띄운다(최대 5개).
 *    20개를 전부 색으로 그리면 서로 구분할 수 없어서다.
 *  - 세로축은 시작점 대비 등락률(%)을 비율 눈금으로 그린다: -50% 와 +100% 가 같은 거리.
 *  - 선 끝에 이름과 등락률을 직접 적는다(색에만 기대지 않게).
 *  - 차트 위에 손가락·마우스를 올리면 그 시점의 값이 위쪽 줄에 나온다.
 *  - 색 4개(#0072B2·#D55E00·#009E73·#CC79A7)는 라이트·다크 모두 색각 이상 구분 검사를
 *    통과한 조합이고(이름을 직접 적는 조건), 다섯째는 글자색(검정·흰색)이다.
 */
type Num = number | null;

export interface OverlaySeries {
  key: string;
  name: string;
  group: string;
  /** 시작점 = 100 */
  values: Num[];
}

export interface OverlayPeriod {
  id: string;
  /** 탭 이름 (예: "12개월") */
  tab: string;
  /** 기준 설명 (예: "2025년 12월 말 종가 대비") */
  basis: string;
  /** 점마다의 이름 (예: "5월", "11/26") */
  pointLabels: string[];
  /** 가로축에 적을 라벨 (빈 문자열 = 생략) */
  ticks: string[];
  ticksMobile: string[];
  series: OverlaySeries[];
  market: Num[];
}

const GRAY = "#8a8a84";
const SLOT_COLORS = ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "currentColor"];
const MAX = SLOT_COLORS.length;
const TICKS = [10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 100, 120, 150, 200, 300, 400, 500, 700, 1000];

function pctText(v: Num): string {
  if (v === null) return "–";
  const p = v - 100;
  if (Math.abs(p) < 0.5) return "0%";
  return `${p > 0 ? "+" : ""}${p.toFixed(0)}%`;
}

function lastIndex(v: Num[]): number {
  for (let i = v.length - 1; i >= 0; i--) if (v[i] !== null) return i;
  return -1;
}

function Chart({
  period,
  slots,
  hover,
  setHover,
  W,
  H,
  R,
  font,
  ticks,
}: {
  period: OverlayPeriod;
  slots: (string | null)[];
  hover: number | null;
  setHover: (i: number | null) => void;
  W: number;
  H: number;
  R: number;
  font: number;
  ticks: string[];
}) {
  const L = 40;
  const T = 10;
  const B = 24;
  const n = period.pointLabels.length;
  const all = [...period.series.flatMap((s) => s.values), ...period.market].filter((v): v is number => v !== null && v > 0);
  if (n < 2 || all.length === 0) return null;
  // 눈금은 전 업종 기준 — 고르는 업종이 바뀌어도 축이 움직이지 않는다
  const lo = Math.min(...all, 100) * 0.94;
  const hi = Math.max(...all, 100) * 1.06;
  const la = Math.log(lo);
  const lb = Math.log(hi);
  const x = (i: number) => L + (i / (n - 1)) * (W - L - R);
  const y = (v: number) => T + ((lb - Math.log(v)) / (lb - la)) * (H - T - B);
  const path = (v: Num[]) => {
    let d = "";
    let pen = false;
    v.forEach((p, i) => {
      if (p === null || p <= 0) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(p).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const yTicks: number[] = [];
  for (const t of TICKS) {
    if (t < lo || t > hi) continue;
    if (yTicks.length && Math.abs(y(t) - y(yTicks[yTicks.length - 1])) < 16) continue;
    yTicks.push(t);
  }
  if (!yTicks.includes(100)) yTicks.push(100);

  const picked = slots
    .map((k, slot) => {
      const s = k ? period.series.find((z) => z.key === k) : undefined;
      return s ? { s, color: SLOT_COLORS[slot] } : null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);
  const pickedKeys = new Set(picked.map((p) => p.s.key));

  // 선 끝 이름표 — 겹치지 않게 위아래로 민다
  const mi = lastIndex(period.market);
  const ends = [
    ...picked.map((p) => {
      const i = lastIndex(p.s.values);
      return i < 0 ? null : { name: p.s.name, color: p.color, i, v: p.s.values[i] as number, bold: true };
    }),
    mi < 0 ? null : { name: "코스피", color: GRAY, i: mi, v: period.market[mi] as number, bold: false },
  ]
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .map((e) => ({ ...e, ly: y(e.v) }))
    .sort((a, b) => a.ly - b.ly);
  const gap = font + 3;
  for (let k = 1; k < ends.length; k++) if (ends[k].ly - ends[k - 1].ly < gap) ends[k].ly = ends[k - 1].ly + gap;
  const over = ends.length ? ends[ends.length - 1].ly - (H - B) : 0;
  if (over > 0) for (const e of ends) e.ly -= over;

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - L) / (W - L - R)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`업종별 주가 흐름 겹쳐 보기, ${period.basis}`} className="touch-pan-y text-foreground select-none">
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={GRAY} strokeOpacity={t === 100 ? 0.9 : 0.22} strokeWidth={1} />
          <text x={L - 5} y={y(t) + 3.5} textAnchor="end" fontSize={font - 1} className="fill-muted-foreground">
            {pctText(t)}
          </text>
        </g>
      ))}
      {ticks.map((lab, i) =>
        lab ? (
          <text key={i} x={x(i)} y={H - 7} textAnchor="middle" fontSize={font - 1} className="fill-muted-foreground">
            {lab}
          </text>
        ) : null
      )}
      {period.series
        .filter((s) => !pickedKeys.has(s.key))
        .map((s) => (
          <path key={s.key} d={path(s.values)} fill="none" stroke={GRAY} strokeOpacity={0.38} strokeWidth={1} strokeLinejoin="round" />
        ))}
      <path d={path(period.market)} fill="none" stroke={GRAY} strokeWidth={2} strokeDasharray="5 3" />
      {picked.map((p) => (
        <path key={p.s.key} d={path(p.s.values)} fill="none" stroke={p.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {hover !== null && (
        <g>
          <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="currentColor" strokeOpacity={0.5} strokeWidth={1} />
          {picked.map((p) => {
            const v = p.s.values[hover];
            return v === null || v === undefined ? null : (
              <circle key={p.s.key} cx={x(hover)} cy={y(v)} r={4} fill={p.color} className="stroke-background" strokeWidth={1.5} />
            );
          })}
        </g>
      )}
      {ends.map((e) => (
        <g key={e.name}>
          <circle cx={x(e.i)} cy={y(e.v)} r={e.bold ? 4 : 3} fill={e.color} className="stroke-background" strokeWidth={1.5} />
          <text x={W - R + 8} y={e.ly + 3.5} fontSize={font} fontWeight={e.bold ? 700 : 400} fill={e.color === "currentColor" ? "currentColor" : e.color}>
            {e.name} {pctText(e.v)}
          </text>
        </g>
      ))}
      <rect x={L} y={0} width={W - L - R} height={H - B} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
    </svg>
  );
}

export function OverlayChart({
  periods,
  groupOrder,
  defaultKeys,
}: {
  periods: OverlayPeriod[];
  groupOrder: string[];
  /** 처음에 색으로 띄울 업종 (최대 5개) */
  defaultKeys: string[];
}) {
  const [periodId, setPeriodId] = useState(periods[0]?.id ?? "");
  const initial: (string | null)[] = Array.from({ length: MAX }, (_, i) => defaultKeys[i] ?? null);
  const [slots, setSlots] = useState<(string | null)[]>(initial);
  const [hover, setHover] = useState<number | null>(null);
  const [full, setFull] = useState(false);

  const period = periods.find((p) => p.id === periodId) ?? periods[0];
  if (!period) return null;

  const toggle = (key: string) => {
    const at = slots.indexOf(key);
    if (at >= 0) {
      setFull(false);
      setSlots(slots.map((k, i) => (i === at ? null : k)));
      return;
    }
    const hole = slots.indexOf(null);
    if (hole < 0) {
      setFull(true);
      return;
    }
    setFull(false);
    setSlots(slots.map((k, i) => (i === hole ? key : k)));
  };
  const count = slots.filter(Boolean).length;
  const at = hover ?? period.pointLabels.length - 1;
  const names = new Map(period.series.map((s) => [s.key, s]));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-border text-sm">
          {periods.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={p.id === period.id}
              onClick={() => {
                setPeriodId(p.id);
                setHover(null);
              }}
              className={`px-3 py-1.5 ${p.id === period.id ? "bg-foreground font-bold text-background" : "text-muted-foreground"}`}
            >
              {p.tab}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{period.basis} · 세로축은 비율 눈금</span>
      </div>

      {/* 손가락·마우스를 올린 시점의 값 */}
      <div className="mt-3 flex min-h-[3.25rem] flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/50 px-3 py-2 text-xs sm:min-h-0">
        <span className="font-bold">{period.pointLabels[at]}</span>
        {slots.map((k, slot) => {
          const s = k ? names.get(k) : undefined;
          if (!s) return null;
          return (
            <span key={s.key} className="flex items-center gap-1 whitespace-nowrap">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SLOT_COLORS[slot] }} />
              {s.name} <b className="tabular-nums">{pctText(s.values[at] ?? null)}</b>
            </span>
          );
        })}
        <span className="flex items-center gap-1 whitespace-nowrap text-muted-foreground">
          코스피 <b className="tabular-nums">{pctText(period.market[at] ?? null)}</b>
        </span>
      </div>

      <div className="mt-2 sm:hidden">
        <Chart period={period} slots={slots} hover={hover} setHover={setHover} W={360} H={340} R={104} font={10.5} ticks={period.ticksMobile} />
      </div>
      <div className="mt-2 hidden sm:block">
        <Chart period={period} slots={slots} hover={hover} setHover={setHover} W={900} H={440} R={132} font={11.5} ticks={period.ticks} />
      </div>

      <div className="mt-3 rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold">
            색으로 볼 업종 고르기 <span className="font-normal text-muted-foreground">({count}/{MAX}개 · 누르면 켜지고 다시 누르면 꺼집니다)</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setSlots(Array.from({ length: MAX }, () => null));
              setFull(false);
            }}
            className="rounded border border-border px-2 py-0.5 text-muted-foreground"
          >
            모두 끄기
          </button>
        </div>
        {full && <p className="mt-1 text-xs font-bold text-amber-600 dark:text-amber-400">한 번에 {MAX}개까지 볼 수 있습니다. 하나를 끄고 다시 눌러 주세요.</p>}
        <div className="mt-2 space-y-2">
          {groupOrder.map((g) => {
            const items = period.series.filter((s) => s.group === g);
            if (items.length === 0) return null;
            return (
              <div key={g} className="flex flex-wrap items-center gap-1.5">
                <span className="w-full text-[11px] text-muted-foreground sm:w-20">{g}</span>
                {items.map((s) => {
                  const slot = slots.indexOf(s.key);
                  const on = slot >= 0;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(s.key)}
                      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${on ? "border-foreground font-bold" : "border-border text-muted-foreground"}`}
                    >
                      {on && <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SLOT_COLORS[slot] }} />}
                      {s.name}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
