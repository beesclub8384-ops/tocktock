import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "보고서 자동 수집 | TockTock",
  robots: { index: false, follow: false },
};

/** /reports 비밀번호 입력 화면 — 이미 로그인했으면 proxy.ts 가 /reports 로 돌려보낸다 */
export default function ReportsLoginPage() {
  return <LoginForm />;
}
