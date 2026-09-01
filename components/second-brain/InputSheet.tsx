"use client";

import { useState } from "react";

/** 짧은 값 하나를 받는 시트. 아래에서 올라오고 배경을 누르면 닫힌다 */
export function InputSheet({
  open,
  title,
  placeholder,
  initialValue,
  submitLabel = "저장",
  saving = false,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  placeholder?: string;
  initialValue: string;
  submitLabel?: string;
  saving?: boolean;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);

  if (!open) return null;

  const trimmed = value.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed || saving) return;
    onSubmit(trimmed);
  };

  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />

      <div
        className="relative w-full"
        style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto w-full max-w-2xl px-3">
          <form
            onSubmit={handleSubmit}
            className="space-y-3 rounded-2xl border border-border bg-card p-4"
          >
            <h2 className="text-[16px] font-bold text-foreground">{title}</h2>

            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              className="h-[52px] w-full rounded-xl border border-border bg-background px-4 text-[16px] text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
              autoFocus
              // 바로 지우고 새로 쓸 수 있게 전체 선택 상태로 연다
              onFocus={(e) => e.currentTarget.select()}
            />

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!trimmed || saving}
                className="h-11 flex-1 rounded-xl bg-foreground text-[16px] font-medium text-background transition-colors active:opacity-80 disabled:opacity-40"
              >
                {saving ? "저장 중…" : submitLabel}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="h-11 flex-1 rounded-xl border border-border bg-card text-[16px] text-foreground transition-colors active:bg-border/40 disabled:opacity-40"
              >
                취소
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
