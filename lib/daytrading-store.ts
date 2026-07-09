import { redis } from '@/lib/redis';
import type { DayTradeRecord } from '@/lib/daytrading';
const KEY = 'daytrading:records';
export async function loadRecords(): Promise<DayTradeRecord[]> {
  const data = await redis.get<DayTradeRecord[]>(KEY); // 자동 역직렬화 — JSON.parse 금지
  return Array.isArray(data) ? data : [];
}
export async function saveRecords(records: DayTradeRecord[]): Promise<void> {
  await redis.set(KEY, records); // JSON.stringify 금지
}
export async function addRecord(input: Omit<DayTradeRecord, 'id' | 'createdAt'>): Promise<DayTradeRecord[]> {
  const records = await loadRecords();
  const now = Date.now();
  records.push({ ...input, id: now + '-' + Math.random().toString(36).slice(2, 8), createdAt: now });
  await saveRecords(records);
  return records;
}
export async function deleteRecord(id: string): Promise<DayTradeRecord[]> {
  const next = (await loadRecords()).filter((r) => r.id !== id);
  await saveRecords(next);
  return next;
}
