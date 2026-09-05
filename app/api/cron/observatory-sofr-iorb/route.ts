import { NextResponse } from "next/server";
import { collectSofrIorb } from "@/lib/observatory-sofr-iorb";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron 은 GET 으로 호출한다 — 반드시 GET (POST 로 만들면 405 무음 실패)
// 평일 UTC 13:00 (KST 22:00) 실행.
// SOFR 은 미국 기준 다음 영업일 오전 8시경 발표되므로 이 시각이면 최신치가 확보된다.
export async function GET(request: Request) {
  // 기존 cron 인증 방식과 동일: CRON_SECRET 설정 시 Bearer 검증
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await collectSofrIorb();
    return NextResponse.json({
      success: true,
      ...result,
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[observatory-sofr-iorb] 수집 실패:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
