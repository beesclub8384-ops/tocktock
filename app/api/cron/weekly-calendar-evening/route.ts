import { handleWeeklyCalendarCron } from "@/lib/weekly-calendar-cron";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// 밤 갱신 (KST 23:00대) — 미국 장 시작 전(밤 9~10시) 발표 결과 반영용.
// 공용 핸들러로 위임: 동일 수집 로직/Redis 키(weekly-calendar:data)/CRON_SECRET 인증
export async function GET(request: Request) {
  return handleWeeklyCalendarCron(request);
}
