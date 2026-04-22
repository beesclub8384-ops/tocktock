import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { saveRedisUsageLog } from "@/lib/futures-trading-store";
import type { RedisUsageLog } from "@/lib/types/futures-trading";

// 키 수가 늘어도 여유 있게
export const maxDuration = 60;

const FREE_TIER_LIMIT_BYTES = 256 * 1024 * 1024;
const WARNING_THRESHOLD_PERCENT = 80;

async function memoryUsageBytes(key: string): Promise<number> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return 0;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["MEMORY", "USAGE", key]),
    });
    const j = (await res.json()) as { result?: unknown };
    return typeof j.result === "number" ? j.result : 0;
  } catch {
    return 0;
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const keys = await redis.keys("*");
    const sizes = await Promise.all(keys.map((k) => memoryUsageBytes(k)));
    const totalBytes = sizes.reduce((a, b) => a + b, 0);
    const totalMB = totalBytes / (1024 * 1024);
    const usagePercent = (totalBytes / FREE_TIER_LIMIT_BYTES) * 100;
    const warning = usagePercent >= WARNING_THRESHOLD_PERCENT;

    const log: RedisUsageLog = {
      checkedAt: new Date().toISOString(),
      totalBytes,
      totalMB: Number(totalMB.toFixed(3)),
      usagePercent: Number(usagePercent.toFixed(2)),
      keyCount: keys.length,
      warning,
    };

    await saveRedisUsageLog(log);

    console.log("[cron/redis-usage-check] saved", log);
    return NextResponse.json({ success: true, log });
  } catch (err) {
    console.error("[cron/redis-usage-check] error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
