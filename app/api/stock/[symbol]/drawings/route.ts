import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { isAdmin } from "@/lib/auth";
import type { DrawingData } from "@/lib/types/drawing";

interface DrawingsPayload {
  version: number;
  drawings: DrawingData[];
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const key = `drawings:${symbol.toUpperCase()}`;
  const data = await redis.get<DrawingsPayload>(key);
  return NextResponse.json(data ?? { version: 1, drawings: [] });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { symbol } = await params;
  const key = `drawings:${symbol.toUpperCase()}`;
  const body: DrawingsPayload = await request.json();

  await redis.set(key, body);
  return NextResponse.json({ ok: true });
}
