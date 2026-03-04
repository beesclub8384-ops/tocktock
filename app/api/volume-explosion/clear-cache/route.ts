import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const keys = [
    "volume-explosion:20260304:closed",
    "volume-explosion-suspected-latest",
    "volume-analysis:20260304",
  ];

  const results: Record<string, number> = {};
  for (const key of keys) {
    try {
      const r = await redis.del(key);
      results[key] = r;
    } catch {
      results[key] = -1;
    }
  }

  return NextResponse.json({ deleted: results });
}
