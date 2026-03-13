import { Redis } from "@upstash/redis";
import { v4 as uuidv4 } from "uuid";
import { NextResponse } from "next/server";

const redis = Redis.fromEnv();

export async function POST(req: Request) {
  const body = await req.json();
  const id = uuidv4();
  const item = { id, createdAt: new Date().toISOString(), ...body };
  await redis.set(`diagram:${id}`, item);
  await redis.lpush("diagram:list", id);
  return NextResponse.json({ id });
}
