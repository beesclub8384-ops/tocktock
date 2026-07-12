import { redis } from "@/lib/redis";
import { SectorTile, type SubSector } from "./sector-tile";
import { SectorTabs } from "@/components/sector-tabs";

export const dynamic = "force-dynamic";

/* ── 타입 (Redis sector-board:data 구조) ── */
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

function fmtUpdatedAt(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  const k = new Date(d.getTime() + 9 * 3600 * 1000); // KST 표기
  return `${k.getUTCFullYear()}.${p(k.getUTCMonth() + 1)}.${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())} (KST)`;
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
    <div className="mx-auto max-w-[1600px] px-4 sm:px-8 py-20">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight">섹터</h1>
        <p className="mt-2 text-muted-foreground">
          산업 밸류체인 기준 섹터별 시가총액 순 · 등락률·거래대금
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          기준 {fmtUpdatedAt(data.updatedAt)} · 시세 출처 네이버
        </p>
      </header>

      <SectorTabs active="kr" />

      {/* 대분류 묶음 카드를 메이슨리(columns)로 테트리스 패킹 */}
      <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
        {data.대분류.map((maj) => (
          <section
            key={maj.name}
            className="mb-4 break-inside-avoid rounded-lg border border-border bg-muted/30 p-3"
          >
            <h2 className="mb-2 text-lg font-bold">{maj.name}</h2>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
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
