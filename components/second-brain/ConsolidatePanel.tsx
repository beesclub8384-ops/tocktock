"use client";

/** 나무 전체 정리본 미리보기. 전체 화면 시트 */
export function ConsolidatePanel({
  open,
  loading,
  applying,
  summary,
  error,
  onApply,
  onRegenerate,
  onClose,
}: {
  open: boolean;
  loading: boolean;
  applying: boolean;
  summary: string;
  error: string | null;
  onApply: () => void;
  onRegenerate: () => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex h-[100dvh] flex-col bg-background">
      <header className="shrink-0 border-b border-border">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-2 px-2">
          <h2 className="min-w-0 flex-1 truncate pl-2 text-[17px] font-bold">
            정리본
          </h2>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            disabled={applying}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[18px] text-muted-foreground transition-colors active:bg-card disabled:opacity-40"
          >
            ✕
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 py-4">
          {loading && (
            <p className="py-20 text-center text-[16px] text-muted-foreground">
              전체를 정리하는 중…
            </p>
          )}
          {!loading && error && (
            <p className="py-20 text-center text-[16px] leading-[1.7] text-red-500">
              {error}
            </p>
          )}
          {!loading && !error && summary && (
            <div className="whitespace-pre-wrap break-words text-[16px] leading-[1.7] text-foreground">
              {summary}
            </div>
          )}
        </div>
      </div>

      <div
        className="shrink-0 border-t border-border"
        style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto w-full max-w-2xl space-y-2 px-4 pt-3">
          <button
            type="button"
            onClick={onApply}
            disabled={loading || applying || !summary.trim()}
            className="h-[52px] w-full rounded-2xl bg-foreground text-[16px] font-medium text-background transition-colors active:opacity-80 disabled:opacity-40"
          >
            {applying ? "놓는 중…" : "줄기로 놓기"}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onRegenerate}
              disabled={loading || applying}
              className="h-[52px] flex-1 rounded-2xl border border-border bg-card text-[16px] text-foreground transition-colors active:bg-border/40 disabled:opacity-40"
            >
              다시 요약
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={applying}
              className="h-[52px] flex-1 rounded-2xl border border-border bg-card text-[16px] text-foreground transition-colors active:bg-border/40 disabled:opacity-40"
            >
              취소
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
