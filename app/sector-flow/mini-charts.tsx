import type { Num } from "@/lib/rotation-core";

/**
 * 업종마다 작은 선 차트 하나 (서버에서 그리는 SVG — 클라이언트 JS 없음).
 *
 *  - 모든 칸의 세로 눈금이 같다(비율 눈금) → 업종끼리 높낮이를 바로 비교할 수 있다.
 *  - 굵은 선 = 그 업종, 회색 점선 = 코스피. 첫 달 말 종가 = 100.
 *  - 빈 동그라미 = 최근 12개월 월말 종가 고점, 채운 동그라미 = 지금.
 *  - 선 색은 글자색(라이트 검정·다크 흰색) 하나만 쓴다. 오르내림은 모양으로 읽고,
 *    선 끝의 등락률 숫자에만 사이트 관례(상승 빨강·하락 파랑)를 쓴다.
 */
export interface MiniItem {
  key: string;
  name: string;
  /** 첫 값 = 100 인 월말 지수. 길이 = 달 수 */
  values: Num[];
  /** 고점 달의 values 인덱스 */
  peakPos: number | null;
  /** "6월" 같은 고점 달 이름 */
  peakLabel: string;
}

export interface MiniGroup {
  title: string;
  items: MiniItem[];
}

const GRAY = "#8a8a84";
const W = 160;
const H = 104;
const L = 4;
const R = 42;
const T = 8;
const B = 16;

function lastIndex(v: Num[]): number {
  for (let i = v.length - 1; i >= 0; i--) if (v[i] !== null) return i;
  return -1;
}

function pathOf(v: Num[], x: (i: number) => number, y: (n: number) => number): string {
  let d = "";
  let pen = false;
  v.forEach((n, i) => {
    if (n === null || n <= 0) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(n).toFixed(1)}`;
    pen = true;
  });
  return d;
}

export function MiniCharts({
  groups,
  market,
  firstLabel,
  lastLabel,
}: {
  groups: MiniGroup[];
  /** 코스피 (첫 값 = 100) */
  market: Num[];
  firstLabel: string;
  lastLabel: string;
}) {
  const all = [...groups.flatMap((g) => g.items.flatMap((i) => i.values)), ...market].filter((v): v is number => v !== null && v > 0);
  if (all.length === 0) return null;
  const n = market.length;
  // 모든 칸이 같은 세로 눈금을 쓴다
  const la = Math.log(Math.min(...all, 100) * 0.92);
  const lb = Math.log(Math.max(...all, 100) * 1.08);
  const x = (i: number) => L + (i / Math.max(1, n - 1)) * (W - L - R);
  const y = (v: number) => T + ((lb - Math.log(v)) / (lb - la)) * (H - T - B);
  const marketPath = pathOf(market, x, y);

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.title}>
          <h3 className="text-xs font-bold text-muted-foreground">{g.title}</h3>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
            {g.items.map((it) => {
              const li = lastIndex(it.values);
              const end = li >= 0 ? (it.values[li] as number) : null;
              const chg = end === null ? null : end - 100;
              const chgCls = chg === null ? "fill-muted-foreground" : chg >= 0 ? "fill-red-600 dark:fill-red-400" : "fill-blue-600 dark:fill-blue-400";
              const peakV = it.peakPos !== null ? it.values[it.peakPos] : null;
              return (
                <div key={it.key} className="rounded-lg border border-border bg-card px-2.5 pt-2 pb-1 text-foreground">
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="truncate text-sm font-bold">{it.name}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">고점 {it.peakLabel}</span>
                  </div>
                  <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${it.name} 최근 12개월 흐름, 고점 ${it.peakLabel}`}>
                    <line x1={L} x2={W - R} y1={y(100)} y2={y(100)} stroke={GRAY} strokeOpacity={0.45} strokeWidth={1} />
                    <path d={marketPath} fill="none" stroke={GRAY} strokeWidth={1.5} strokeDasharray="4 3" />
                    <path d={pathOf(it.values, x, y)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                    {it.peakPos !== null && peakV !== null && it.peakPos !== li && (
                      <circle cx={x(it.peakPos)} cy={y(peakV)} r={3.5} className="fill-background" stroke="currentColor" strokeWidth={1.5} />
                    )}
                    {end !== null && (
                      <>
                        <circle cx={x(li)} cy={y(end)} r={3.5} fill="currentColor" />
                        <text x={W - R + 6} y={Math.min(H - B, Math.max(T + 8, y(end) + 4))} fontSize={11.5} fontWeight={700} className={chgCls}>
                          {chg !== null && chg > 0 ? "+" : ""}
                          {chg?.toFixed(0)}%
                        </text>
                      </>
                    )}
                    <text x={L} y={H - 3} fontSize={10} className="fill-muted-foreground">
                      {firstLabel}
                    </text>
                    <text x={W - R} y={H - 3} fontSize={10} textAnchor="end" className="fill-muted-foreground">
                      {lastLabel}
                    </text>
                  </svg>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
