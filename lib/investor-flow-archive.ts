/**
 * 투자자 동향 누적 저장소 — KIS 30거래일 한계를 시간으로 극복.
 *
 * 매일 새벽 cron이 추적 대상 종목 약 500개에 대해 KIS 데이터를 받아 여기에 누적 저장한다.
 * 시간이 지날수록 archive가 쌓여 30일+ 과거에서도 외국인·기관·개인 + 거래대금이 표시된다.
 *
 * 저장 구조 (per symbol — 한 키에 모든 날짜):
 *   key   = investor-flow:archive:{symbol}
 *   value = { symbol, entries: [...], updatedAt }
 *
 * 저장 부담 (Upstash 256MB 한도):
 *   500종목 × 365일 × ≈140B = ≈26MB / 1년
 *   500종목 × 1825일 × ≈140B = ≈130MB / 5년
 */

import { redis } from "@/lib/redis";
import type { KisInvestorDailyEntry } from "@/lib/kis-client";

export interface ArchiveEntry {
  /** YYYY-MM-DD (KST) */
  date: string;
  /** 종가 (원). 없으면 null */
  close: number | null;
  /** 순매수 수량 (주). 매수=양수, 매도=음수 */
  foreignShares: number;
  institutionShares: number;
  individualShares: number;
  /** 순매수 대금 (원). KIS 미제공 행은 null */
  foreignValue: number | null;
  institutionValue: number | null;
  individualValue: number | null;
}

interface ArchiveBlob {
  symbol: string;
  entries: ArchiveEntry[];
  updatedAt: string;
}

const KEY = (symbol: string) => `investor-flow:archive:${symbol}`;
/** TTL 5년 — 주기적 갱신으로 사실상 영구 보관, 추적 중단 종목은 자연 소멸 */
const TTL_SEC = 5 * 365 * 24 * 60 * 60;

export async function loadArchive(symbol: string): Promise<ArchiveBlob | null> {
  const code = symbol.replace(/\.[A-Z]{2,3}$/, "").trim();
  if (!/^\d{6}$/.test(code)) return null;
  try {
    return await redis.get<ArchiveBlob>(KEY(code));
  } catch {
    return null;
  }
}

/** [startDate, endDate] 범위 내 항목만 반환 (오름차순) */
export async function loadArchiveRange(
  symbol: string,
  startDate: string,
  endDate: string
): Promise<ArchiveEntry[]> {
  const blob = await loadArchive(symbol);
  if (!blob) return [];
  return blob.entries
    .filter((e) => e.date >= startDate && e.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 새 KIS 응답을 archive에 병합 저장.
 * - 기존 날짜는 새 값으로 덮어씀 (KIS 데이터가 후일 보정될 수 있으므로)
 * - 결과는 날짜 오름차순 정렬
 * 반환: { added, updated, total } 카운트
 */
export async function appendArchive(
  symbol: string,
  rows: KisInvestorDailyEntry[]
): Promise<{ added: number; updated: number; total: number }> {
  const code = symbol.replace(/\.[A-Z]{2,3}$/, "").trim();
  if (!/^\d{6}$/.test(code)) {
    throw new Error(`invalid symbol: ${symbol}`);
  }
  if (rows.length === 0) {
    const existing = await loadArchive(code);
    return { added: 0, updated: 0, total: existing?.entries.length ?? 0 };
  }

  const existing = await loadArchive(code);
  const map = new Map<string, ArchiveEntry>();
  for (const e of existing?.entries ?? []) map.set(e.date, e);

  let added = 0;
  let updated = 0;
  for (const r of rows) {
    const next: ArchiveEntry = {
      date: r.date,
      close: r.close,
      foreignShares: r.foreignShares,
      institutionShares: r.institutionShares,
      individualShares: r.individualShares,
      foreignValue: r.foreignValue,
      institutionValue: r.institutionValue,
      individualValue: r.individualValue,
    };
    if (map.has(r.date)) {
      updated++;
    } else {
      added++;
    }
    map.set(r.date, next);
  }

  const entries = Array.from(map.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const blob: ArchiveBlob = {
    symbol: code,
    entries,
    updatedAt: new Date().toISOString(),
  };
  await redis.set(KEY(code), blob, { ex: TTL_SEC });
  return { added, updated, total: entries.length };
}

export interface TrackingMetadata {
  /** 누적 데이터 첫 날짜 (없으면 null) */
  firstDate: string | null;
  /** 누적 데이터 마지막 날짜 */
  lastDate: string | null;
  /** 거래일 기준 누적 일수 */
  daysTracked: number;
  /** 마지막 갱신 시각 (ISO) */
  updatedAt: string | null;
}

export async function getTrackingMetadata(symbol: string): Promise<TrackingMetadata> {
  const blob = await loadArchive(symbol);
  if (!blob || blob.entries.length === 0) {
    return { firstDate: null, lastDate: null, daysTracked: 0, updatedAt: null };
  }
  return {
    firstDate: blob.entries[0].date,
    lastDate: blob.entries[blob.entries.length - 1].date,
    daysTracked: blob.entries.length,
    updatedAt: blob.updatedAt,
  };
}
