import { handleUsSectorBoardCron } from "@/lib/us-sector-board";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// 미국 섹터 보드 자동 갱신 (미국 장마감 후, UTC 22:00 = KST 익일 07:00경).
// Vercel Cron은 GET으로 호출하므로 반드시 GET.
export async function GET(request: Request) {
  return handleUsSectorBoardCron(request);
}
