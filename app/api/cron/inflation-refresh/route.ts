import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { headers } from "next/headers";

export const maxDuration = 60;

// app/api/inflation/data/route.ts 의 CACHE_KEY 와 같아야 한다 (미션 8 inflation:fred:v1 → v2, 미션 11 v3)
const CACHE_KEY = "inflation:v3";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1) 캐시 무효화
    await redis.del(CACHE_KEY);

    // 2) /api/inflation/data 호출 → 원출처(BLS·BEA)에서 새로 수집 + 캐시 저장
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
    const proto = h.get("x-forwarded-proto") ?? "https";
    const url = `${proto}://${host}/api/inflation/data`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { success: false, error: `data API ${res.status}: ${text.slice(0, 200)}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
