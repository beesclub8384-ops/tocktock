import { redis } from "@/lib/redis";
import {
  type FuturesRecord,
  type FuturesStore,
  FUTURES_REDIS_KEY,
} from "@/lib/types/futures-trading";

export async function loadRecords(): Promise<FuturesRecord[]> {
  const data = await redis.get<FuturesStore>(FUTURES_REDIS_KEY);
  return data?.records ?? [];
}

export async function saveRecords(records: FuturesRecord[]): Promise<void> {
  const store: FuturesStore = { records };
  await redis.set(FUTURES_REDIS_KEY, store);
}

export async function addRecord(record: FuturesRecord): Promise<void> {
  const records = await loadRecords();
  records.push(record);
  records.sort((a, b) => {
    const dateComp = b.date.localeCompare(a.date);
    if (dateComp !== 0) return dateComp;
    return b.entryTime.localeCompare(a.entryTime);
  });
  await saveRecords(records);
}

export async function deleteRecord(id: string): Promise<boolean> {
  const records = await loadRecords();
  const filtered = records.filter((r) => r.id !== id);
  if (filtered.length === records.length) return false;
  await saveRecords(filtered);
  return true;
}
