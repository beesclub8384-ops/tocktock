import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { appendSectorHistoryPoint, getSectorHistory } from "@/lib/sector-history";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PARENT = "에너지";
const SECTOR = "정유";

/* 오늘 날짜(KST) YYYY-MM-DD */
function kstToday(): string {
  return kstDateOf(new Date());
}
/* 임의 Date → KST YYYY-MM-DD */
function kstDateOf(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
/* 임의 Date → KST 시(hour) 0~23 */
function kstHourOf(d: Date): number {
  const h = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    hour12: false,
  }).format(d);
  // "24" (자정) → 0 보정
  const n = parseInt(h, 10);
  return n === 24 ? 0 : n;
}

interface Board {
  updatedAt?: string;
  대분류: {
    name: string;
    소분류: { name: string; avgSimple?: number; stocks?: { tradingValue?: number }[] }[];
  }[];
}

// Vercel Cron은 GET으로 호출 — 반드시 GET (POST면 405)
export async function GET() {
  try {
    const board = await redis.get<Board>("sector-board:data");
    const major = board?.대분류?.find((m) => m.name === PARENT);
    const sub = major?.소분류?.find((s) => s.name === SECTOR);
    if (!sub) {
      return NextResponse.json(
        { error: `${PARENT}>${SECTOR} 섹터 데이터를 찾을 수 없습니다.` },
        { status: 404 }
      );
    }
    const date = kstToday();

    // ── 신선도 검증(guard): 오염 방지 ──────────────────────────────
    // sector-board:data 스냅샷이 "오늘 KST 날짜 + 종가 시간대(16시 이후)"일 때만 축적한다.
    // (한국 장 마감 15:30. 20:00 sector-board cron 이후여야 종가 기준 avgSimple)
    const snapshotISO = board?.updatedAt;
    const snap = snapshotISO ? new Date(snapshotISO) : null;
    const snapDateKST = snap && !isNaN(snap.getTime()) ? kstDateOf(snap) : null;
    const snapHourKST = snap && !isNaN(snap.getTime()) ? kstHourOf(snap) : null;

    if (snapDateKST !== date) {
      // (A) 스냅샷이 오늘자가 아님 → 과거/일요일 스냅샷을 오늘로 오염 방지
      const reason = `스냅샷이 오늘(KST ${date})이 아님 (스냅샷 KST ${snapDateKST ?? "알수없음"})`;
      console.warn(`[sector-history] SKIP: ${reason}`);
      return NextResponse.json({
        skipped: true,
        reason,
        snapshotUpdatedAt: snapshotISO ?? null,
        todayKST: date,
      });
    }
    if (snapHourKST === null || snapHourKST < 16) {
      // (B) 장중/점심 스냅샷(16시 이전) → 종가 아님, 축적 금지
      const reason = `스냅샷이 종가 시간대가 아님 (KST ${String(snapHourKST ?? "?")}시 < 16시)`;
      console.warn(`[sector-history] SKIP: ${reason}`);
      return NextResponse.json({
        skipped: true,
        reason,
        snapshotUpdatedAt: snapshotISO ?? null,
        todayKST: date,
      });
    }
    // (C) 휴장일 방어 — 거래대금 지문 대조 ─────────────────────────
    const stocks = sub.stocks ?? [];
    const todayFingerprint = stocks.reduce((s, x) => s + (Number(x.tradingValue) || 0), 0);

    // 안전장치: stocks 비었거나 지문 0 → 데이터 이상, 축적 금지
    if (stocks.length === 0 || todayFingerprint === 0) {
      const reason = "섹터 종목 데이터 이상 (stocks 비었거나 거래대금 지문 0)";
      console.warn(`[sector-history] SKIP: ${reason}`);
      return NextResponse.json({
        skipped: true,
        reason,
        todayFingerprint,
        todayKST: date,
      });
    }

    // 직전 저장일과 거래대금 지문이 동일하면 휴장일/미갱신으로 판단
    const hist = await getSectorHistory(SECTOR);
    const lastPoint = hist?.points?.[hist.points.length - 1];
    if (
      lastPoint &&
      Number.isFinite(lastPoint.fingerprint) &&
      todayFingerprint === lastPoint.fingerprint
    ) {
      const reason = "거래대금 지문이 직전 저장일과 동일 (휴장일 추정)";
      console.warn(`[sector-history] SKIP: ${reason}`);
      return NextResponse.json({
        skipped: true,
        reason,
        todayFingerprint,
        lastPoint: { date: lastPoint.date, fingerprint: lastPoint.fingerprint },
      });
    }
    // lastPoint에 fingerprint 없으면(기존 백필 데이터) 대조 건너뛰고 통과 (하위호환)
    // ───────────────────────────────────────────────────────────────

    const ret = Number(sub.avgSimple ?? 0);
    const next = await appendSectorHistoryPoint(SECTOR, { date, ret, fingerprint: todayFingerprint });
    if (!next) {
      return NextResponse.json(
        { error: `sector-history:${SECTOR} 히스토리가 아직 없습니다. 백필 먼저 필요.` },
        { status: 404 }
      );
    }
    const last = next.points[next.points.length - 1];
    return NextResponse.json({
      skipped: false,
      sector: SECTOR,
      date,
      ret: last.ret,
      index: last.index,
      fingerprint: todayFingerprint,
      totalPoints: next.points.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "sector-history cron 실패" },
      { status: 500 }
    );
  }
}
