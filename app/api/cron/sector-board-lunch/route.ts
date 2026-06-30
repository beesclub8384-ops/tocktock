import { handleSectorBoardCron } from "@/lib/sector-board";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// 섹터 보드 점심 장중 갱신 (평일 KST 11:30경). Vercel Cron은 GET으로 호출하므로 반드시 GET.
// 저녁용(/api/cron/sector-board)과 동일 핸들러 재사용 — 같은 Redis 키(sector-board:data) 덮어씀.
export async function GET(request: Request) {
  return handleSectorBoardCron(request);
}
