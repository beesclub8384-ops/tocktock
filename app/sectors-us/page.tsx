import { redis } from "@/lib/redis";
import { UsSectorTile, type UsSector } from "./us-sector-tile";

export const dynamic = "force-dynamic";

interface UsSectorBoard {
  updatedAt: string;
  totalQuotes: number;
  joined: number;
  섹터: UsSector[];
}

const CACHE_KEY = "us-sector-board:data";

function fmtUpdatedAt(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  const k = new Date(d.getTime() + 9 * 3600 * 1000); // KST 표기
  return `${k.getUTCFullYear()}.${p(k.getUTCMonth() + 1)}.${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())} (KST)`;
}

export default async function SectorsUsPage() {
  const data = await redis.get<UsSectorBoard>(CACHE_KEY);

  if (!data || !Array.isArray(data.섹터)) {
    return (
      <div className="max-w-6xl px-4 sm:px-8 py-20">
        <h1 className="text-4xl font-bold tracking-tight">미국 섹터</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          미국 섹터 데이터가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl px-4 sm:px-8 py-20">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight">미국 섹터</h1>
        <p className="mt-2 text-muted-foreground">
          S&amp;P500 · GICS 11개 섹터 · 시가총액 순 · 등락률·거래대금(근사)·거래량
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          기준 {fmtUpdatedAt(data.updatedAt)} · 출처 위키피디아(명단·GICS) + 야후파이낸스(시세) · 거래대금은 현재가×거래량 근사
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {data.섹터.map((sec) => (
          <UsSectorTile key={sec.name} sub={sec} />
        ))}
      </div>
    </div>
  );
}
