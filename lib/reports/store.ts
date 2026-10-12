import { redis } from "@/lib/redis";
import type { LastRun, ReportError, ReportRecord, ReportStatus } from "./types";

/**
 * 보고서 수집기 Redis 저장소 (설계서 6장)
 *
 * 모든 키는 reports: 접두어 — 기존 키와 겹치지 않는다.
 * ⚠ @upstash/redis 가 JSON 직렬화를 알아서 한다. JSON.stringify 금지.
 */
const KEY = {
  item: (id: string) => `reports:item:${id}`,
  index: "reports:index", // sorted set, score = publishedAt 타임스탬프(ms)
  seen: (sourceId: string) => `reports:seen:${sourceId}`,
  next: (sourceId: string) => `reports:next:${sourceId}`,
  errors: "reports:errors", // 최근 100건
  lastRun: "reports:lastRun",
  // 설계서 6장 표에 없는 키. /reports 의 Blob 사용량 표시용 누적 바이트.
  // Blob list() 로 매번 세면 월 2,000회 한도를 갉아먹어서 저장할 때 더한다.
  blobBytes: "reports:blobBytes",
};

const MAX_ERRORS = 100;

export async function isSeen(sourceId: string, editionKey: string): Promise<boolean> {
  return (await redis.sismember(KEY.seen(sourceId), editionKey)) === 1;
}

export async function seenCount(sourceId: string): Promise<number> {
  return redis.scard(KEY.seen(sourceId));
}

/** 저장 없이 "본 것"으로만 표시 (pageDiff 의 seed 모드) */
export async function markSeen(sourceId: string, editionKeys: string[]): Promise<void> {
  if (editionKeys.length === 0) return;
  const [first, ...rest] = editionKeys;
  await redis.sadd(KEY.seen(sourceId), first, ...rest);
}

/**
 * 보고서 저장. 항목·목록·seen·사용량을 한 트랜잭션으로 넣는다.
 * seen 은 Blob 저장이 끝난 뒤 여기서만 추가된다 — 원문 저장이 실패하면
 * seen 에 들어가지 않아 다음 실행에서 다시 시도한다 (설계서 9장).
 */
export async function saveRecord(record: ReportRecord): Promise<void> {
  const tx = redis.multi();
  tx.set(KEY.item(record.id), record);
  tx.zadd(KEY.index, { score: Date.parse(`${record.publishedAt}T00:00:00Z`), member: record.id });
  tx.sadd(KEY.seen(record.sourceId), record.editionKey);
  if (record.fileSizeBytes) tx.incrby(KEY.blobBytes, record.fileSizeBytes);
  await tx.exec();
}

export async function getRecord(id: string): Promise<ReportRecord | null> {
  return redis.get<ReportRecord>(KEY.item(id));
}

/** 최신순 목록 */
export async function listRecords(limit = 200): Promise<ReportRecord[]> {
  const ids = await redis.zrange<string[]>(KEY.index, 0, limit - 1, { rev: true });
  if (ids.length === 0) return [];
  const items = await redis.mget<(ReportRecord | null)[]>(...ids.map(KEY.item));
  return items.filter((r): r is ReportRecord => r !== null);
}

export async function updateStatus(id: string, status: ReportStatus): Promise<ReportRecord | null> {
  const record = await getRecord(id);
  if (!record) return null;
  const updated: ReportRecord = { ...record, status };
  await redis.set(KEY.item(id), updated);
  return updated;
}

/** 다음 발표 예정일. null 이면 지운다 (일정표가 끝난 경우 등) */
export async function setNextRelease(sourceId: string, date: string | null): Promise<void> {
  if (date) await redis.set(KEY.next(sourceId), date);
  else await redis.del(KEY.next(sourceId));
}

export async function getNextRelease(sourceId: string): Promise<string | null> {
  return redis.get<string>(KEY.next(sourceId));
}

export async function pushError(error: ReportError): Promise<void> {
  await redis.lpush(KEY.errors, error);
  await redis.ltrim(KEY.errors, 0, MAX_ERRORS - 1);
}

export async function listErrors(limit = 5): Promise<ReportError[]> {
  return redis.lrange<ReportError>(KEY.errors, 0, limit - 1);
}

export async function setLastRun(run: LastRun): Promise<void> {
  await redis.set(KEY.lastRun, run);
}

export async function getLastRun(): Promise<LastRun | null> {
  return redis.get<LastRun>(KEY.lastRun);
}

/** 이 수집기가 Blob 에 올린 누적 바이트 */
export async function getBlobBytes(): Promise<number> {
  return (await redis.get<number>(KEY.blobBytes)) ?? 0;
}
