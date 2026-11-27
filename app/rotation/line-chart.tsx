import type { Num } from "@/lib/rotation-core";

/**
 * 순환매 점검용 선 차트 (서버에서 그리는 SVG — 클라이언트 JS 없음).
 *
 *  - 세로축은 비율(로그) 눈금: 100 → 50 과 100 → 200 이 같은 거리로 보인다.
 *  - 선 끝에 이름과 값을 직접 적는다(범례를 따로 찾지 않게).
 *  - 화면 폭에 따라 글자가 작아지지 않도록 모바일용·PC용 두 벌을 그려 CSS 로 하나만 보인다.
 *  - 색: 기준 업종은 글자색(라이트 검정·다크 흰색), 지수는 회색 점선.
 *    나머지 3색(#0072B2·#D55E00·#CC79A7)은 라이트·다크 모두 색각 이상 구분 검사를 통과한 조합이다.
 */
export interface LineSeries {
  name: string;
  values: Num[];
  /** "base" = 기준 업종(굵은 글자색 선), "market" = 지수(회색 점선) */
  role?: "base" | "market";
  color?: string;
}

const GRAY = "#8a8a84";
const TICKS = [10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 150, 200, 300, 400, 500, 700, 1000];

function Chart({
  series,
  xLabels,
  note,
  W,
  H,
  R,
  font,
}: {
  series: LineSeries[];
  xLabels: string[];
  note: string;
  W: number;
  H: number;
  R: number;
  font: number;
}) {
  const L = 34;
  const T = 22;
  const B = 24;
  const n = xLabels.length;
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null && v > 0);
  if (n < 2 || all.length === 0) return null;
  const lo = Math.min(...all, 100) * 0.94;
  const hi = Math.max(...all, 100) * 1.06;
  const la = Math.log(lo);
  const lb = Math.log(hi);
  const x = (i: number) => L + (i / (n - 1)) * (W - L - R);
  const y = (v: number) => T + ((lb - Math.log(v)) / (lb - la)) * (H - T - B);

  // 눈금: 범위 안의 후보 가운데 서로 14px 이상 떨어진 것만
  const ticks: number[] = [];
  for (const t of TICKS) {
    if (t < lo || t > hi) continue;
    if (ticks.length && Math.abs(y(t) - y(ticks[ticks.length - 1])) < 14) continue;
    ticks.push(t);
  }
  if (!ticks.includes(100) && 100 >= lo && 100 <= hi) ticks.push(100);

  // 끝 라벨 겹침 정리
  const ends = series
    .map((s) => {
      let last = -1;
      for (let i = s.values.length - 1; i >= 0; i--) {
        if (s.values[i] !== null) {
          last = i;
          break;
        }
      }
      return last < 0 ? null : { s, i: last, v: s.values[last] as number, ly: y(s.values[last] as number) };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .sort((a, b) => a.ly - b.ly);
  const gap = font + 3;
  for (let k = 1; k < ends.length; k++) if (ends[k].ly - ends[k - 1].ly < gap) ends[k].ly = ends[k - 1].ly + gap;
  const over = ends.length ? ends[ends.length - 1].ly - (H - B) : 0;
  if (over > 0) for (const e of ends) e.ly -= over;

  const stroke = (s: LineSeries) => (s.role === "base" ? "currentColor" : s.role === "market" ? GRAY : s.color ?? GRAY);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={note} className="text-foreground">
      <text x={L} y={12} fontSize={font - 1} className="fill-muted-foreground">
        {note}
      </text>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={GRAY} strokeOpacity={t === 100 ? 0.9 : 0.25} strokeWidth={1} />
          <text x={L - 4} y={y(t) + 3.5} textAnchor="end" fontSize={font - 1} className="fill-muted-foreground">
            {t}
          </text>
        </g>
      ))}
      {xLabels.map((lab, i) =>
        lab ? (
          <text key={i} x={x(i)} y={H - 7} textAnchor="middle" fontSize={font - 1} className="fill-muted-foreground">
            {lab}
          </text>
        ) : null
      )}
      {series.map((s) => {
        let d = "";
        let pen = false;
        s.values.forEach((v, i) => {
          if (v === null || v <= 0) {
            pen = false;
            return;
          }
          d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
          pen = true;
        });
        return (
          <path
            key={s.name}
            d={d}
            fill="none"
            stroke={stroke(s)}
            strokeWidth={s.role === "base" ? 3 : 2}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={s.role === "market" ? "5 3" : undefined}
          />
        );
      })}
      {ends.map((e) => (
        <g key={e.s.name}>
          <circle cx={x(e.i)} cy={y(e.v)} r={3.5} fill={stroke(e.s)} className="stroke-background" strokeWidth={1.5} />
          <text x={W - R + 8} y={e.ly + 3.5} fontSize={font} fontWeight={700} fill={stroke(e.s)}>
            {e.s.name} {e.v.toFixed(0)}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function RotationLineChart({
  series,
  xLabels,
  xLabelsMobile,
  note,
}: {
  series: LineSeries[];
  xLabels: string[];
  /** 모바일에서 덜 촘촘하게 보일 라벨(없으면 xLabels) */
  xLabelsMobile?: string[];
  note: string;
}) {
  return (
    <>
      <div className="sm:hidden">
        <Chart series={series} xLabels={xLabelsMobile ?? xLabels} note={note} W={360} H={300} R={96} font={10.5} />
      </div>
      <div className="hidden sm:block">
        <Chart series={series} xLabels={xLabels} note={note} W={860} H={360} R={124} font={11.5} />
      </div>
    </>
  );
}
