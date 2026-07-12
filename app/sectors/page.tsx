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

/* 대분류별 테두리·헤더 색 — 등락색(빨강 상승/파랑 하락)과 혼동 없게 순수 빨강·파랑은 피하고
   서로 구분되는 11가지 톤. 라이트/다크 모두 보이도록 500/dark:400 활용. 미매핑 시 기본색 폴백. */
const MAJOR_STYLE: Record<string, { border: string; text: string }> = {
  "에너지": { border: "border-amber-500 dark:border-amber-400", text: "text-amber-700 dark:text-amber-300" },
  "소재": { border: "border-emerald-600 dark:border-emerald-400", text: "text-emerald-700 dark:text-emerald-300" },
  "산업재": { border: "border-indigo-500 dark:border-indigo-400", text: "text-indigo-700 dark:text-indigo-300" },
  "경기소비재": { border: "border-pink-600 dark:border-pink-400", text: "text-pink-700 dark:text-pink-300" },
  "필수소비재": { border: "border-lime-600 dark:border-lime-400", text: "text-lime-700 dark:text-lime-300" },
  "헬스케어": { border: "border-teal-500 dark:border-teal-400", text: "text-teal-700 dark:text-teal-300" },
  "IT": { border: "border-violet-600 dark:border-violet-400", text: "text-violet-700 dark:text-violet-300" },
  "커뮤니케이션": { border: "border-orange-500 dark:border-orange-400", text: "text-orange-700 dark:text-orange-300" },
  "금융": { border: "border-cyan-600 dark:border-cyan-400", text: "text-cyan-700 dark:text-cyan-300" },
  "유틸리티": { border: "border-fuchsia-600 dark:border-fuchsia-400", text: "text-fuchsia-700 dark:text-fuchsia-300" },
  "부동산": { border: "border-stone-500 dark:border-stone-400", text: "text-stone-600 dark:text-stone-300" },
};
const DEFAULT_STYLE = { border: "border-border", text: "" };

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
        {data.대분류.map((maj) => {
          const style = MAJOR_STYLE[maj.name] ?? DEFAULT_STYLE;
          return (
          <section
            key={maj.name}
            className={`mb-4 break-inside-avoid rounded-lg border-2 ${style.border} bg-muted/30 p-3`}
          >
            <h2 className={`mb-2 text-lg font-bold ${style.text}`}>{maj.name}</h2>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
              {maj.소분류.map((sub) => (
                <SectorTile key={sub.name} sub={sub} />
              ))}
            </div>
          </section>
          );
        })}
      </div>
    </div>
  );
}
