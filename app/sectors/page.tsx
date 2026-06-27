import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

/* ── 타입 (Redis sector-board:data 구조) ── */
interface SectorStock {
  code: string;
  name: string;
  marketCap: number; // 원
  price: number; // 원
  changeRate: number; // %
  tradingValue: number; // 원
  market: string;
}
interface SubSector {
  name: string;
  count: number;
  stocks: SectorStock[];
}
interface MajorSector {
  name: string;
  소분류: SubSector[];
}
interface SectorBoard {
  updatedAt: string;
  totalQuotes: number;
  joined: number;
  대분류: MajorSector[];
}

const CACHE_KEY = "sector-board:data";
const TOP_N = 10;

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
  const sign = rate > 0 ? "+" : "";
  return `${sign}${rate.toFixed(2)}%`;
}

function fmtUpdatedAt(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  const k = new Date(d.getTime() + 9 * 3600 * 1000); // KST 표기
  return `${k.getUTCFullYear()}.${p(k.getUTCMonth() + 1)}.${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())} (KST)`;
}

function SectorTile({ sub }: { sub: SubSector }) {
  const top = sub.stocks.slice(0, TOP_N);
  const more = sub.count - top.length;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-border pb-2">
        <h3 className="truncate text-sm font-semibold">{sub.name}</h3>
        <span className="shrink-0 text-xs text-muted-foreground">{sub.count}종목</span>
      </div>
      {top.length === 0 ? (
        <p className="text-xs text-muted-foreground">종목 없음</p>
      ) : (
        <ul className="space-y-1">
          {top.map((s) => (
            <li key={s.code} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate" title={`${s.name} · 시총 ${fmtKRW(s.marketCap)}`}>
                {s.name}
              </span>
              <span className={`w-16 shrink-0 text-right tabular-nums ${changeClass(s.changeRate)}`}>
                {fmtRate(s.changeRate)}
              </span>
              <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
                {fmtKRW(s.tradingValue)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {more > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">+{more}개 더</p>
      )}
    </div>
  );
}

export default async function SectorsPage() {
  const data = await redis.get<SectorBoard>(CACHE_KEY);

  if (!data || !Array.isArray(data.대분류)) {
    return (
      <div className="max-w-6xl px-4 sm:px-8 py-20">
        <h1 className="text-4xl font-bold tracking-tight">섹터</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          섹터 데이터가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl px-4 sm:px-8 py-20">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight">섹터</h1>
        <p className="mt-2 text-muted-foreground">
          산업 밸류체인 기준 60개 섹터 · 섹터별 시가총액 순 · 등락률·거래대금
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          기준 {fmtUpdatedAt(data.updatedAt)} · 시세 출처 네이버
        </p>
      </header>

      <div className="space-y-12">
        {data.대분류.map((maj) => (
          <section key={maj.name}>
            <h2 className="mb-3 text-lg font-bold">{maj.name}</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {maj.소분류.map((sub) => (
                <SectorTile key={sub.name} sub={sub} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
