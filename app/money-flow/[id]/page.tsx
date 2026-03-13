import { Redis } from "@upstash/redis";
import { notFound } from "next/navigation";
import DiagramView from "./DiagramView";

export const revalidate = 0;

export default async function DiagramPage({ params }: { params: { id: string } }) {
  const redis = Redis.fromEnv();
  const raw = await redis.get<string>(`diagram:${params.id}`);
  console.log("id:", params.id);
  console.log("raw:", raw);
  if (!raw) notFound();
  const data = raw as any;
  return <DiagramView data={data} />;
}
