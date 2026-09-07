import { NextResponse } from "next/server";
import { collectSofrIorb } from "@/lib/observatory-sofr-iorb";
import { collectSrf } from "@/lib/observatory-srf";
import { collectDiscountWindow } from "@/lib/observatory-discount-window";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 관측소 전체 지표 수집 (SOFR−IORB 스프레드 + SRF 사용량 + 재할인 창구 잔액).
 *
 * ⚠ 경로 이름이 sofr-iorb 로 남아 있지만 관측소 지표를 모두 여기서 모은다.
 *   경로를 바꾸면 vercel.json 의 cron path 도 같이 바꿔야 하고, 한쪽만 고치면
 *   cron 이 조용히 404 로 죽는다. 그래서 이름은 그대로 두고 지표만 추가한다.
 *   새 지표가 늘어도 이 파일에 수집 함수를 하나 더 붙이면 된다.
 *
 * Vercel Cron 은 GET 으로 호출한다 — 반드시 GET (POST 로 만들면 405 무음 실패)
 * 평일 UTC 13:00 (KST 22:00) 실행.
 * SOFR 은 미국 기준 다음 영업일 오전 8시경 발표되므로 이 시각이면 최신치가 확보된다.
 */
export async function GET(request: Request) {
  // 기존 cron 인증 방식과 동일: CRON_SECRET 설정 시 Bearer 검증
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 지표마다 따로 잡는다. 한쪽이 실패해도 다른 쪽은 저장된다
  const results: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  try {
    results.sofrIorb = await collectSofrIorb();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[observatory] sofr-iorb 수집 실패:", error);
    errors.sofrIorb = detail;
  }

  try {
    results.srf = await collectSrf();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[observatory] srf 수집 실패:", error);
    errors.srf = detail;
  }

  // 재할인 창구는 주간(수요일 기준) 시리즈다. 매일 돌려도 새 값은 주 1회만 들어온다.
  // FRED 갱신이 목요일 미국 동부 오후라 이 cron(UTC 13:00) 기준으로는
  // 금요일 실행에서 그 주 수요일 값이 처음 잡힌다 — 정상이다.
  try {
    results.discountWindow = await collectDiscountWindow();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[observatory] discount-window 수집 실패:", error);
    errors.discountWindow = detail;
  }

  const failed = Object.keys(errors);
  // 지표를 하나 더 붙였을 때 숫자를 같이 안 고쳐 조용히 200 을 내보내는 일이
  // 없도록, 상수 대신 실제 시도 횟수(성공 + 실패)로 센다
  const attempted = failed.length + Object.keys(results).length;
  // 전부 실패했을 때만 500. 일부만 실패하면 성공분은 살리고 실패를 함께 알린다
  const status = attempted > 0 && failed.length === attempted ? 500 : 200;

  return NextResponse.json(
    {
      success: failed.length === 0,
      ...results,
      ...(failed.length > 0 ? { errors } : {}),
      refreshedAt: new Date().toISOString(),
    },
    { status }
  );
}
