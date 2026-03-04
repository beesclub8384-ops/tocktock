import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  if (!key) {
    const patterns = [
      "volume-explosion-daily:*",
      "volume-snapshot:*",
      "volume-explosion:*",
      "volume-explosion-suspected-latest",
    ];
    const results: Record<string, string[]> = {};
    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      results[pattern] = (keys as string[]).sort();
    }
    return NextResponse.json(results);
  }

  const value = await redis.get(key);
  return NextResponse.json({ key, value });
}
