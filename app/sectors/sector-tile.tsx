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
  stocks: SectorStock[];
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
      <span
        className="min-w-0 flex-1 truncate"
        title={`${s.name} · 시총 ${fmtKRW(s.marketCap)}`}
      >
        {s.name}
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
  return (
    <div className="mb-4 break-inside-avoid rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-border pb-2">
        <h3 className="truncate text-sm font-semibold">{sub.name}</h3>
        <span className="shrink-0 text-xs text-muted-foreground">{sub.count}종목</span>
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
