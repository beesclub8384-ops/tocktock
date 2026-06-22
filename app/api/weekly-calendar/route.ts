import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import type { WeeklyCalendarBlob } from "@/lib/weekly-calendar";

export const dynamic = "force-dynamic";

const CACHE_KEY = "weekly-calendar:data";

export async function GET() {
  try {
    const data = await redis.get<WeeklyCalendarBlob>(CACHE_KEY);
    if (!data) {
      return NextResponse.json({
        updatedAt: null,
        rangeStart: null,
        rangeEnd: null,
        events: [],
      });
    }
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        updatedAt: null,
        rangeStart: null,
        rangeEnd: null,
        events: [],
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
