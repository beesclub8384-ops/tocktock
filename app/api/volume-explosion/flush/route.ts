import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const prefixes = ["volume-explosion:", "volume-snapshot:"];
  const deleted: string[] = [];

  try {
    for (const prefix of prefixes) {
      let cursor = 0;
      do {
        const result = await redis.scan(cursor, {
          match: `${prefix}*`,
          count: 100,
        });
        cursor = Number(result[0]);
        const keys = result[1] as string[];
        if (keys.length > 0) {
          await redis.del(...keys);
          deleted.push(...keys);
        }
      } while (cursor !== 0);
    }

    return NextResponse.json({
      success: true,
      deletedCount: deleted.length,
      deletedKeys: deleted,
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    );
  }
}
