import { NextResponse } from "next/server";
import {
  isValidPassword,
  REPORTS_COOKIE,
  REPORTS_COOKIE_MAX_AGE,
  reportsAuthToken,
} from "@/lib/reports/auth";

export const dynamic = "force-dynamic";

/** 틀렸을 때 응답을 늦춰 마구 대입하는 속도를 떨어뜨린다 (밀리초) */
const FAIL_DELAY_MS = 800;

/**
 * /reports 비밀번호 확인 — 맞으면 httpOnly 쿠키(30일)를 준다.
 * proxy.ts 가 이 경로만 인증 없이 통과시킨다.
 */
export async function POST(request: Request) {
  const password = process.env.REPORTS_PASSWORD;
  if (!password) {
    return NextResponse.json({ error: "REPORTS_PASSWORD 미설정" }, { status: 503 });
  }

  let given: unknown;
  try {
    given = ((await request.json()) as { password?: unknown }).password;
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다" }, { status: 400 });
  }

  if (typeof given !== "string" || !isValidPassword(given, password)) {
    await new Promise((r) => setTimeout(r, FAIL_DELAY_MS));
    return NextResponse.json({ error: "비밀번호가 맞지 않습니다" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(REPORTS_COOKIE, reportsAuthToken(password), {
    httpOnly: true,
    // 로컬 개발 서버는 http 라 Secure 쿠키가 안 붙는다. 운영(https)에서만 켠다
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // 페이지(/reports)와 API(/api/reports) 둘 다에 붙어야 해서 루트로 둔다
    path: "/",
    maxAge: REPORTS_COOKIE_MAX_AGE,
  });
  return res;
}
