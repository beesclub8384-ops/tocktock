import { Redis } from "@upstash/redis";
import { notFound } from "next/navigation";
import DiagramView from "./DiagramView";

export const dynamic = "force-dynamic";

export default async function DiagramPage({ params }: { params: { id: string } }) {
  const redis = Redis.fromEnv();
  const raw = await redis.get<any>(`diagram:${params.id}`);
  if (!raw) notFound();
  return <DiagramView data={raw as any} />;
}
