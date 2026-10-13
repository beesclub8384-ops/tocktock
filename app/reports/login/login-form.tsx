"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * 비밀번호 칸 하나짜리 입력 화면.
 * 확인은 서버(/api/reports/login)가 하고, 맞으면 httpOnly 쿠키가 30일간 남는다.
 */
export function LoginForm() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pw || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/reports/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (res.ok) {
        router.replace("/reports");
        router.refresh();
        return;
      }
      setError(res.status === 401 ? "비밀번호가 틀렸습니다" : "잠시 후 다시 시도해 주세요");
      setPw("");
    } catch {
      setError("잠시 후 다시 시도해 주세요");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-background px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-4">
        <h1 className="text-center text-xl font-bold">보고서 자동 수집</h1>
        <p className="text-center text-[15px] leading-relaxed text-muted-foreground">
          비밀번호를 입력하면 보고서 목록으로 이동합니다
        </p>
        <input
          type="password"
          autoComplete="current-password"
          value={pw}
          onChange={(e) => {
            setPw(e.target.value);
            setError(null);
          }}
          className="h-[52px] w-full rounded-2xl border border-border bg-card px-4 text-center text-[20px] tracking-widest focus:outline-none focus:ring-2 focus:ring-foreground/20"
          placeholder="••••"
          aria-label="비밀번호"
          autoFocus
        />
        {error && <p className="text-center text-[15px] text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="h-[52px] w-full rounded-2xl bg-foreground text-[16px] font-medium text-background transition-colors active:opacity-80 disabled:opacity-50"
        >
          {pending ? "확인 중…" : "확인"}
        </button>
      </form>
    </div>
  );
}
