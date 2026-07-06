import { BizAreaIcon } from "./biz-area";

/* ── 타입 (Redis sector-board:data 구조와 동일) ── */
export interface SectorStock {
  code: string;
  name: string;
  marketCap: number; // 원
  price: number; // 원
  changeRate: number; // %
  tradingValue: number; // 원
  market: string;
}
export interface SubSector {
  name: string;
  count: number;
  avgWeighted?: number; // 시총가중 등락 %
  avgSimple?: number; // 단순평균 등락 %
  avgCount?: number; // 평균 계산에 쓴 종목수
  stocks: SectorStock[];
}

/* 헤더 배경 tint — 시총가중 등락 기준(양수 빨강/음수 파랑), |등락| ±3%에서 최대 진하기 */
function headerTint(w: number): string {
  if (!Number.isFinite(w) || w === 0) return "transparent";
  const mag = Math.min(Math.abs(w) / 3, 1); // 0..1
  const alpha = (0.05 + mag * 0.25).toFixed(3); // 0.05 ~ 0.30 (텍스트 대비 유지)
  return w > 0 ? `rgba(220,38,38,${alpha})` : `rgba(37,99,235,${alpha})`;
}

/* ── 단위 변환 (원 → 조/억) ── */
function fmtKRW(won: number): string {
  const v = Math.abs(won);
  if (v >= 1e12) return `${(won / 1e12).toFixed(1)}조`;
  if (v >= 1e8) return `${Math.round(won / 1e8).toLocaleString()}억`;
  if (v >= 1e4) return `${Math.round(won / 1e4).toLocaleString()}만`;
  return `${Math.round(won).toLocaleString()}원`;
}
/* 한국식: 상승 빨강 / 하락 파랑 / 보합 회색 */
function changeClass(rate: number): string {
  if (rate > 0) return "text-red-600 dark:text-red-400";
  if (rate < 0) return "text-blue-600 dark:text-blue-400";
  return "text-muted-foreground";
}
function fmtRate(rate: number): string {
  return `${rate > 0 ? "+" : ""}${rate.toFixed(2)}%`;
}

function StockRow({ s }: { s: SectorStock }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      <span className="flex min-w-0 flex-1 items-center gap-1">
        <span className="truncate" title={`${s.name} · 시총 ${fmtKRW(s.marketCap)}`}>
          {s.name}
        </span>
        <BizAreaIcon code={s.code} name={s.name} />
      </span>
      <span className={`w-16 shrink-0 text-right tabular-nums ${changeClass(s.changeRate)}`}>
        {fmtRate(s.changeRate)}
      </span>
      <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
        {fmtKRW(s.tradingValue)}
      </span>
    </li>
  );
}

/* 전종목 펼침 타일 — 메이슨리(CSS columns) 안에서 break-inside-avoid로 한 열에 유지 */
export function SectorTile({ sub }: { sub: SubSector }) {
  const w = sub.avgWeighted ?? 0;
  const s = sub.avgSimple ?? 0;
  return (
    <div className="mb-4 break-inside-avoid overflow-hidden rounded-lg border border-border bg-card p-4">
      <div
        className="-mx-4 -mt-4 mb-2 border-b border-border px-4 pb-2 pt-4"
        style={{ backgroundColor: headerTint(w) }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate text-sm font-semibold">{sub.name}</h3>
          <span className="shrink-0 text-xs text-muted-foreground">{sub.count}종목</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-xs tabular-nums">
          <span className="text-muted-foreground">시총</span>
          <span className={changeClass(w)}>{fmtRate(w)}</span>
          <span className="text-muted-foreground">· 평균</span>
          <span className={changeClass(s)}>{fmtRate(s)}</span>
        </div>
      </div>
      {sub.stocks.length === 0 ? (
        <p className="text-xs text-muted-foreground">종목 없음</p>
      ) : (
        <ul className="space-y-1">
          {sub.stocks.map((s) => (
            <StockRow key={s.code} s={s} />
          ))}
        </ul>
      )}
    </div>
  );
}
