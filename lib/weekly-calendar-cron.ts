import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { buildWeeklyCalendar } from "@/lib/weekly-calendar";

/**
 * weekly-calendar 수집 cron 공용 핸들러.
 * 여러 스케줄(새벽/아침/밤) 경로가 동일한 수집 로직·Redis 키·CRON_SECRET 인증을 재사용한다.
 * 모두 같은 weekly-calendar:data 키를 덮어쓰므로 팝업·페이지는 변경 없이 그 키만 읽으면 된다.
 */
export const WEEKLY_CALENDAR_CACHE_KEY = "weekly-calendar:data";

export async function handleWeeklyCalendarCron(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await buildWeeklyCalendar();
    // Upstash Redis는 자동 직렬화 → 객체 그대로 저장
    await redis.set(WEEKLY_CALENDAR_CACHE_KEY, data);
    return NextResponse.json({
      success: true,
      count: data.events.length,
      rangeStart: data.rangeStart,
      rangeEnd: data.rangeEnd,
      updatedAt: data.updatedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
