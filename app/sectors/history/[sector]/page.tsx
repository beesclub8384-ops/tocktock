import Link from "next/link";
import { getSectorHistory } from "@/lib/sector-history";
import { SectorHistoryChart } from "../SectorHistoryChart";

export const dynamic = "force-dynamic";

function fmtUpdatedAt(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}.${p(k.getUTCMonth() + 1)}.${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())} (KST)`;
}

// Next.js 15: params는 Promise (동기로 받으면 undefined → 404)
export default async function SectorHistoryPage({
  params,
}: {
  params: Promise<{ sector: string }>;
}) {
  const { sector } = await params;
  const decoded = decodeURIComponent(sector);
  const history = await getSectorHistory(decoded);

  const hasData = !!history && Array.isArray(history.points) && history.points.length > 0;

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
          {history?.parent ? `${history.parent} › ` : ""}
          <span className="font-semibold text-foreground">{history?.sector ?? decoded}</span>
        </p>
        {hasData &&
          (history.constituents ? (
            <p className="mt-1 text-xs text-muted-foreground">
              보통주 {history.constituents}종목 · 단순평균(동일가중) · 우선주/거래정지/이상치(±30% 초과) 제외
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              보통주 · 단순평균(동일가중) · 우선주/거래정지/이상치(±30% 초과) 제외
            </p>
          ))}
      </header>

      {!hasData ? (
        <p className="text-sm text-muted-foreground">
          이 섹터는 아직 히스토리가 없습니다. 다른 섹터를 선택해 주세요.
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
