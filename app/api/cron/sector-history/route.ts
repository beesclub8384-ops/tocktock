import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { appendSectorHistoryPoint } from "@/lib/sector-history";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PARENT = "에너지";
const SECTOR = "정유";

/* 오늘 날짜(KST) YYYY-MM-DD */
function kstToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

interface Board {
  대분류: { name: string; 소분류: { name: string; avgSimple?: number }[] }[];
}

// Vercel Cron은 GET으로 호출 — 반드시 GET (POST면 405)
export async function GET() {
  try {
    const board = await redis.get<Board>("sector-board:data");
    const major = board?.대분류?.find((m) => m.name === PARENT);
    const sub = major?.소분류?.find((s) => s.name === SECTOR);
    if (!sub) {
      return NextResponse.json(
        { error: `${PARENT}>${SECTOR} 섹터 데이터를 찾을 수 없습니다.` },
        { status: 404 }
      );
    }
    const ret = Number(sub.avgSimple ?? 0);
    const date = kstToday();
    const next = await appendSectorHistoryPoint(SECTOR, { date, ret });
    if (!next) {
      return NextResponse.json(
        { error: `sector-history:${SECTOR} 히스토리가 아직 없습니다. 백필 먼저 필요.` },
        { status: 404 }
      );
    }
    const last = next.points[next.points.length - 1];
    return NextResponse.json({
      sector: SECTOR,
      date,
      ret: last.ret,
      index: last.index,
      totalPoints: next.points.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "sector-history cron 실패" },
      { status: 500 }
    );
  }
}
