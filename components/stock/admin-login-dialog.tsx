"use client";

import { useEffect, useState } from "react";

interface AdminLoginDialogProps {
  open: boolean;
  onClose: () => void;
  onLogin: (password: string) => void;
}

export function AdminLoginDialog({ open, onClose, onLogin }: AdminLoginDialogProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      setPassword("");
      setError(false);
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "x-admin-password": password },
      });
      if (res.ok) {
        onLogin(password);
        onClose();
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-bold">관리자 로그인</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(false); }}
            placeholder="비밀번호 입력"
            autoFocus
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          {error && (
            <p className="mt-2 text-xs text-red-500">비밀번호가 올바르지 않습니다.</p>
          )}
          <div className="mt-4 flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-accent"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading || !password}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "확인 중..." : "로그인"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
