import { Redis } from "@upstash/redis";
import { notFound } from "next/navigation";
import DiagramView from "./DiagramView";

export const revalidate = 0;

export default async function DiagramPage({ params }: { params: { id: string } }) {
  const redis = Redis.fromEnv();
  const raw = await redis.get<string>(`diagram:${params.id}`);
  if (!raw) notFound();
  const data = JSON.parse(raw as string);
  return <DiagramView data={data} />;
}
