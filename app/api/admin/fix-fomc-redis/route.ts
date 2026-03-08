import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

const REDIS_KEY = "fomc-dot-plot";

const CORRECT_DATA = {
  value: "연내 1회 인하 전망",
  change: 0,
  updatedAt: "2025-12-10",
};

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await redis.set(REDIS_KEY, CORRECT_DATA);
    const saved = await redis.get(REDIS_KEY);

    return NextResponse.json({
      status: "fixed",
      data: saved,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { status: "error", reason: String(error) },
      { status: 500 }
    );
  }
}
