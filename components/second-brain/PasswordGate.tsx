"use client";

import { useState } from "react";
import { AUTH_KEY, PASSWORD, ROOT_TITLE, SHELL_HEIGHT } from "./types";

export function PasswordGate({ onAuth }: { onAuth: () => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === PASSWORD) {
      try {
        window.localStorage.setItem(AUTH_KEY, PASSWORD);
      } catch {
        // localStorage를 못 쓰는 환경에서도 이번 세션은 통과시킨다
      }
      onAuth();
    } else {
      setError(true);
      setPw("");
    }
  };

  return (
    <div
      className="flex items-center justify-center bg-background px-6"
      style={{ minHeight: SHELL_HEIGHT }}
    >
      <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-4">
        <h2 className="text-center text-xl font-bold">{ROOT_TITLE}</h2>
        <p className="text-center text-[15px] leading-relaxed text-muted-foreground">
          비밀번호를 입력하면 대화 화면으로 이동합니다
        </p>
        <input
          type="password"
          // 모바일에서 숫자 키패드가 바로 뜨도록
          inputMode="numeric"
          autoComplete="off"
          value={pw}
          onChange={(e) => {
            setPw(e.target.value);
            setError(false);
          }}
          className="h-[52px] w-full rounded-2xl border border-border bg-card px-4 text-center text-[20px] tracking-widest focus:outline-none focus:ring-2 focus:ring-foreground/20"
          placeholder="••••"
          autoFocus
        />
        {error && (
          <p className="text-center text-[15px] text-red-500">
            비밀번호가 틀렸습니다
          </p>
        )}
        <button
          type="submit"
          className="h-[52px] w-full rounded-2xl bg-foreground text-[16px] font-medium text-background transition-colors active:opacity-80"
        >
          확인
        </button>
      </form>
    </div>
  );
}
