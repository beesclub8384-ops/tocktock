import { NextResponse } from "next/server";
import { buildRotationSnapshot, getRotationSnapshot, saveRotationSnapshot } from "@/lib/rotation";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 순환매 점검 수집 cron — 평일 16:30 KST(07:30 UTC) 이후 하루 한 번.
 * (Hobby 요금제는 실행 시각이 최대 59분 늦을 수 있다 → 16:30~17:29 KST 사이)
 *
 * 실패하면 이전 저장값을 그대로 두고 500 으로 응답한다(Vercel cron 기록에 실패로 남게).
 * Vercel Cron 은 GET 으로 호출한다 — 반드시 GET.
 */
export async function GET(request: Request) {
  // 비밀값이 없으면 "Bearer undefined" 로 통과되지 않게 먼저 막는다
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const t0 = Date.now();
  try {
    const snap = await buildRotationSnapshot();
    await saveRotationSnapshot(snap);
    return NextResponse.json({
      success: true,
      asOf: snap.asOf,
      series: snap.instruments.length,
      // 원본값과 가공값을 함께 남긴다 (교차검증 규칙): 출처·대조 결과·수집 메모
      sources: snap.instruments.map((i) => ({
        label: i.label,
        name: i.name,
        source: i.source,
        fallback: i.fallback,
        lastDate: i.lastDate,
        check: i.check.status,
        mismatched: i.check.mismatched,
      })),
      verdicts: snap.result.verdicts,
      notes: snap.notes,
      elapsedMs: Date.now() - t0,
    });
  } catch (error) {
    const prev = await getRotationSnapshot().catch(() => null);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        keptPrevious: prev?.builtAt ?? null,
        elapsedMs: Date.now() - t0,
      },
      { status: 500 }
    );
  }
}
