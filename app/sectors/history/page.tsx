import Link from "next/link";
import { getSectorHistory } from "@/lib/sector-history";
import { SectorHistoryChart } from "./SectorHistoryChart";

export const dynamic = "force-dynamic";

const SECTOR = "정유";

function fmtUpdatedAt(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}.${p(k.getUTCMonth() + 1)}.${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())} (KST)`;
}

export default async function SectorHistoryPage() {
  const history = await getSectorHistory(SECTOR);

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-8 py-20">
      <header className="mb-8">
        <div className="mb-2">
          <Link href="/sectors" className="text-sm text-muted-foreground hover:text-foreground">
            ← 섹터별 현황
          </Link>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">섹터 히스토리 지수</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          섹터별 누적 흐름을 지수(기준 100)로 추적하는 파일럿 화면입니다.
        </p>
      </header>

      {!history || !history.points || history.points.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          아직 히스토리 데이터가 없습니다. 잠시 후 다시 시도해 주세요.
        </p>
      ) : (
        <>
          <SectorHistoryChart history={history} />
          <p className="mt-4 text-xs text-muted-foreground">
            기준 {fmtUpdatedAt(history.updatedAt)} · 데이터 {history.points.length}일치 · 출처
            야후파이낸스(과거 5년 백필) + 매 거래일 축적
          </p>
        </>
      )}
    </div>
  );
}
