import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * /reports 비밀번호 인증 공용 (proxy.ts 와 로그인 API 가 같이 쓴다)
 *
 * 쿠키에는 비밀번호 대신 REPORTS_PASSWORD 로 만든 HMAC 서명값을 넣는다.
 * 비밀번호를 바꾸면 서명값이 달라져 기존 쿠키는 자동으로 무효가 된다.
 *
 * ⚠ node:crypto 를 쓴다. proxy 는 Next 16 에서 항상 Node.js 런타임이라 문제없다.
 */

export const REPORTS_COOKIE = "tocktock_reports_auth";
export const REPORTS_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30일 (초)

export function reportsAuthToken(password: string): string {
  return createHmac("sha256", password).update("tocktock-reports-v1").digest("hex");
}

/** 길이가 달라도 같은 시간에 비교하려고 해시로 맞춘다 */
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest()
  );
}

export function isValidPassword(given: string, password: string): boolean {
  return safeEqual(given, password);
}

export function isValidAuthCookie(value: string | undefined, password: string): boolean {
  if (!value) return false;
  return safeEqual(value, reportsAuthToken(password));
}
