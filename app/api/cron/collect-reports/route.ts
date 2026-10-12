import { NextResponse } from "next/server";
import { collectReports } from "@/lib/reports/collector";
import { findSource } from "@/lib/reports/sources";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 보고서 자동 수집 (REPORTS_COLLECTOR_SPEC.md)
 *
 * Vercel Cron 은 GET 으로 호출한다 — 반드시 GET (POST 로 만들면 405 무음 실패)
 * 매일 UTC 15:00 (KST 자정, 미 동부 오전 10~11시) 실행.
 * 미국 통계(오전 8:30 발표)를 당일에 잡는다.
 *
 * 수동 실행:
 *   ?source=<id>  출처 하나만 (fomc-statement, bls-cpi, fed-fsr, oaktree-marks)
 *   ?seed=1       첫 실행 시드 모드 (막스 메모: 최신 1건만 저장, 나머지는 본 것으로만 기록)
 *
 * ⚠ 경로를 바꾸면 vercel.json 의 cron path 도 같이 바꿔야 한다. 한쪽만 고치면 조용히 404.
 */
export async function GET(request: Request) {
  // 기존 cron 인증 방식과 동일: CRON_SECRET 설정 시 Bearer 검증
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const sourceId = params.get("source") ?? undefined;
  const seed = params.get("seed") === "1";
  if (sourceId && !findSource(sourceId)) {
    return NextResponse.json({ error: `알 수 없는 출처: ${sourceId}` }, { status: 400 });
  }

  try {
    const run = await collectReports({ sourceId, seed });
    const attempted = run.sources.length;
    const failedSources = run.sources.filter((s) => s.errors.length > 0 && s.saved.length === 0).length;
    // 전부 실패했을 때만 500. 일부만 실패하면 성공분은 살리고 실패를 함께 알린다
    const status = attempted > 0 && failedSources === attempted ? 500 : 200;
    return NextResponse.json({ success: run.errorCount === 0, ...run }, { status });
  } catch (error) {
    console.error("[collect-reports] 실행 실패:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
