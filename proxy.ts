import { NextResponse, type NextRequest } from "next/server";
import { isValidAuthCookie, REPORTS_COOKIE } from "@/lib/reports/auth";

/**
 * /reports 페이지와 /api/reports/* 를 비밀번호로 막는다.
 *
 * 이유: 원문 내려받기 경로가 열려 있으면 Blob 무료 전송 한도(Hobby 월 10GB)가
 * 소진돼 30일간 Blob 이 막힐 수 있다.
 *
 * 방식: /reports/login 에서 REPORTS_PASSWORD 를 맞히면 httpOnly 쿠키(30일)를 준다.
 * - 쿠키 없는 페이지 요청 → /reports/login 으로 보낸다
 * - 쿠키 없는 API 요청 → 401 JSON (상태 변경, 원문 내려받기)
 * - /reports/login 과 /api/reports/login 은 통과 (로그인하러 가는 길)
 *
 * ⚠ Next 16 부터 middleware.ts → proxy.ts, 내보내는 함수 이름도 proxy.
 *   (설치된 16.1.6 의 build/templates/middleware.js 로 확인)
 *   proxy 는 항상 Node.js 런타임이라 runtime 설정을 넣으면 빌드가 실패한다.
 * ⚠ cron 경로(/api/cron/collect-reports)는 여기 걸리지 않는다 — CRON_SECRET 으로 따로 막는다.
 * ⚠ REPORTS_PASSWORD 가 없으면 열어 두지 않고 503 으로 닫는다 (설정 누락이 조용히 공개로 이어지지 않게).
 */
const LOGIN_PAGE = "/reports/login";
const LOGIN_API = "/api/reports/login";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const password = process.env.REPORTS_PASSWORD;
  if (!password) {
    return new NextResponse("REPORTS_PASSWORD 환경변수가 설정되지 않아 접근을 막았습니다.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const authed = isValidAuthCookie(request.cookies.get(REPORTS_COOKIE)?.value, password);

  if (pathname === LOGIN_API) return NextResponse.next();
  if (pathname === LOGIN_PAGE) {
    // 이미 로그인했으면 입력 화면을 다시 보여 줄 이유가 없다
    return authed ? NextResponse.redirect(new URL("/reports", request.url)) : NextResponse.next();
  }
  if (authed) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }
  return NextResponse.redirect(new URL(LOGIN_PAGE, request.url));
}

export const config = {
  matcher: ["/reports", "/reports/:path*", "/api/reports/:path*"],
};
