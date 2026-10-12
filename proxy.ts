import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * /reports 페이지와 /api/reports/* 를 HTTP Basic 인증으로 막는다.
 *
 * 이유: 원문 내려받기 경로가 열려 있으면 Blob 무료 전송 한도(Hobby 월 10GB)가
 * 소진돼 30일간 Blob 이 막힐 수 있다.
 *
 * ⚠ Next 16 부터 middleware.ts → proxy.ts, 내보내는 함수 이름도 proxy.
 *   (설치된 16.1.6 의 build/templates/middleware.js 로 확인)
 *   proxy 는 항상 Node.js 런타임이라 runtime 설정을 넣으면 빌드가 실패한다.
 * ⚠ cron 경로(/api/cron/collect-reports)는 여기 걸리지 않는다 — CRON_SECRET 으로 따로 막는다.
 *
 * 아이디는 아무거나 넣어도 되고 비밀번호만 REPORTS_PASSWORD 와 비교한다.
 * REPORTS_PASSWORD 가 없으면 열어 두지 않고 503 으로 닫는다 (설정 누락이 조용히 공개로 이어지지 않게).
 */
export function proxy(request: NextRequest) {
  const password = process.env.REPORTS_PASSWORD;
  if (!password) {
    return new NextResponse("REPORTS_PASSWORD 환경변수가 설정되지 않아 접근을 막았습니다.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (isAuthorized(request.headers.get("authorization"), password)) {
    return NextResponse.next();
  }

  return new NextResponse("인증이 필요합니다.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="TockTock Reports", charset="UTF-8"',
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function isAuthorized(header: string | null, password: string): boolean {
  if (!header?.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf-8");
  } catch {
    return false;
  }
  const sep = decoded.indexOf(":");
  if (sep === -1) return false;
  const given = decoded.slice(sep + 1);
  // 길이가 달라도 같은 시간에 비교하려고 해시로 맞춘다
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(password).digest();
  return timingSafeEqual(a, b);
}

export const config = {
  matcher: ["/reports", "/reports/:path*", "/api/reports/:path*"],
};
