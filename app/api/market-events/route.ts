import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import type { MarketEventsStore } from "@/lib/types/market-events";

const REDIS_KEY = "market-events:v1";

export async function GET() {
  try {
    const data = await redis.get<MarketEventsStore>(REDIS_KEY);

    if (!data || !data.events) {
      return NextResponse.json(
        { events: [], lastUpdated: null },
        {
          headers: { "Cache-Control": "public, max-age=300" },
        }
      );
    }

    // 날짜 내림차순 정렬
    const sorted = [...data.events].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return NextResponse.json(
      { events: sorted, lastUpdated: data.lastUpdated },
      {
        headers: { "Cache-Control": "public, max-age=300" },
      }
    );
  } catch (error) {
    console.error("[market-events] API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch market events" },
      { status: 500 }
    );
  }
}
