/* ── 타입 (Redis us-sector-board:data 구조) ── */
export interface UsStock {
  ticker: string;
  name: string; // 영문 회사명
  nameKo?: string; // 한글명(없으면 영문 폴백)
  marketCap: number; // USD
  price: number; // USD
  changeRate: number; // %
  tradingValue: number; // USD (현재가×거래량 근사)
  volume: number; // 주
}
export interface UsSector {
  name: string; // GICS 영문
  nameKo: string; // 한글
  count: number;
  stocks: UsStock[];
}

/* ── 단위 변환 (USD → $B / $M) ── */
function fmtUSD(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${Math.round(v / 1e6).toLocaleString()}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}
function fmtVol(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return `${v.toLocaleString()}`;
}
/* 한국식(사이트 일관성): 상승 빨강 / 하락 파랑 / 보합 회색 */
function changeClass(rate: number): string {
  if (rate > 0) return "text-red-600 dark:text-red-400";
  if (rate < 0) return "text-blue-600 dark:text-blue-400";
  return "text-muted-foreground";
}
function fmtRate(rate: number): string {
  return `${rate > 0 ? "+" : ""}${rate.toFixed(2)}%`;
}

function StockRow({ s }: { s: UsStock }) {
  const label = s.nameKo || s.name; // 한글명 우선, 없으면 영문
  return (
    <li className="flex items-center gap-2 text-xs">
      <span className="min-w-0 flex-1 truncate" title={`${label} (${s.ticker}) · ${s.name} · 시총 ${fmtUSD(s.marketCap)}`}>
        {label} <span className="text-muted-foreground">({s.ticker})</span>
      </span>
      <span className={`w-14 shrink-0 text-right tabular-nums ${changeClass(s.changeRate)}`}>{fmtRate(s.changeRate)}</span>
      <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">{fmtUSD(s.tradingValue)}</span>
      <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">{fmtVol(s.volume)}</span>
    </li>
  );
}

/* 전종목 펼침 타일 — 메이슨리(CSS columns) 안에서 break-inside-avoid로 한 열에 유지 */
export function UsSectorTile({ sub }: { sub: UsSector }) {
  return (
    <div className="mb-4 break-inside-avoid rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-border pb-2">
        <h3 className="min-w-0 truncate text-sm font-semibold">{sub.nameKo || sub.name}</h3>
        <span className="shrink-0 text-xs text-muted-foreground">{sub.count}종목</span>
      </div>
      {sub.stocks.length === 0 ? (
        <p className="text-xs text-muted-foreground">종목 없음</p>
      ) : (
        <ul className="space-y-1">
          {sub.stocks.map((s) => (
            <StockRow key={s.ticker} s={s} />
          ))}
        </ul>
      )}
    </div>
  );
}
