import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { buildWeeklyCalendar } from "@/lib/weekly-calendar";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CACHE_KEY = "weekly-calendar:data";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await buildWeeklyCalendar();
    // Upstash Redis는 자동 직렬화 → 객체 그대로 저장
    await redis.set(CACHE_KEY, data);
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
