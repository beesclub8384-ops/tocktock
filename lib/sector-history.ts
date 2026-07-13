import { redis } from "@/lib/redis";

/* 섹터(소분류) 히스토리 지수 — Redis 키: sector-history:{소분류명} */

export interface SectorHistoryPoint {
  date: string; // YYYY-MM-DD
  ret: number; // 그날 섹터 일별 등락률(%)
  index: number; // 누적지수(기준 100)
  fingerprint?: number; // 그날 섹터 거래대금 합(휴장일 방어용). 기존 백필 점에는 없음(optional)
}

export interface SectorHistory {
  sector: string; // 소분류명 (예: "정유")
  parent: string; // 대분류명 (예: "에너지")
  method: string; // "simple-average" | "simple-average-v2(...)"
  baseDate: string; // YYYY-MM-DD
  updatedAt: string; // ISO
  constituents?: number; // 지수 구성 보통주 수 (v2). 기존 데이터엔 없음(optional)
  points: SectorHistoryPoint[];
}

function keyOf(sector: string): string {
  return `sector-history:${sector}`;
}

/* 소수점 4자리 반올림 */
function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

export async function getSectorHistory(sector: string): Promise<SectorHistory | null> {
  // Upstash 자동 역직렬화 — JSON.parse 금지
  const data = await redis.get<SectorHistory>(keyOf(sector));
  return data ?? null;
}

export async function saveSectorHistory(history: SectorHistory): Promise<void> {
  // Upstash 자동 직렬화 — JSON.stringify 금지
  await redis.set(keyOf(history.sector), history);
}

/**
 * 히스토리에 하루치 포인트를 추가한다.
 * - 같은 date가 이미 있으면 덮어쓰기(중복 방지)
 * - 날짜 오름차순 정렬 유지
 * - index_t = index_(t-1) × (1 + ret_t/100), 소수 4자리 반올림. 첫 포인트는 index=100
 */
export async function appendSectorHistoryPoint(
  sector: string,
  point: { date: string; ret: number; fingerprint?: number }
): Promise<SectorHistory | null> {
  const history = await getSectorHistory(sector);
  if (!history) return null;

  const ret = Number(point.ret);
  const safeRet = Number.isFinite(ret) ? ret : 0;

  // 같은 날짜 제거 후 재삽입 (덮어쓰기)
  const points = history.points.filter((p) => p.date !== point.date);
  const newPoint: SectorHistoryPoint = { date: point.date, ret: round4(safeRet), index: 0 };
  if (Number.isFinite(point.fingerprint)) newPoint.fingerprint = point.fingerprint;
  points.push(newPoint);
  points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // 지수 재계산 (첫 포인트 = 100)
  let idx = 100;
  for (let i = 0; i < points.length; i++) {
    if (i === 0) {
      idx = 100;
    } else {
      idx = idx * (1 + points[i].ret / 100);
    }
    points[i].index = round4(idx);
  }

  const next: SectorHistory = {
    ...history,
    points,
    updatedAt: new Date().toISOString(),
  };
  await saveSectorHistory(next);
  return next;
}
