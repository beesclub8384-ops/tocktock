import { handleSectorBoardCron } from "@/lib/sector-board";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// 섹터 보드 매일 자동 갱신 (평일 KST 18:30). Vercel Cron은 GET으로 호출하므로 반드시 GET.
export async function GET(request: Request) {
  return handleSectorBoardCron(request);
}
