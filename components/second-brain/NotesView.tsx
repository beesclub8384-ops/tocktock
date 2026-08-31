"use client";

import { useCallback, useEffect, useState } from "react";
import { authHeaders, SHELL_HEIGHT } from "./types";

export interface SBNoteIndexEntry {
  id: string;
  title: string;
  updatedAt: number;
}

/** 목록에는 "8월 31일" 형태로만 보여 준다 */
function formatDay(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function NotesView({
  onOpenNote,
  onBack,
  onToast,
}: {
  onOpenNote: (id: string, isNew?: boolean) => void;
  onBack: () => void;
  onToast: (message: string) => void;
}) {
  const [notes, setNotes] = useState<SBNoteIndexEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/second-brain/notes", {
          headers: authHeaders,
        });
        if (!res.ok) {
          if (!cancelled) setError("노트를 불러오지 못했습니다.");
          return;
        }
        const data = (await res.json()) as { notes?: SBNoteIndexEntry[] };
        if (!cancelled) setNotes(Array.isArray(data.notes) ? data.notes : []);
      } catch {
        if (!cancelled) setError("네트워크 오류로 노트를 불러오지 못했습니다.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleNewNote = useCallback(async () => {
    if (creating) return;

    setError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/second-brain/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? "노트를 만들지 못했습니다.");
        return;
      }
      onToast("새 노트");
      onOpenNote(data.id, true);
    } catch {
      setError("네트워크 오류로 노트를 만들지 못했습니다.");
    } finally {
      setCreating(false);
    }
  }, [creating, onOpenNote, onToast]);

  return (
    <div
      className="flex flex-col bg-background"
      style={{ minHeight: SHELL_HEIGHT }}
    >
      <header className="sticky top-0 z-10 shrink-0 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-1 px-2">
          <button
            type="button"
            onClick={onBack}
            className="flex h-11 shrink-0 items-center rounded-xl px-2.5 text-[15px] text-foreground transition-colors active:bg-card"
          >
            ‹ 뒤로
          </button>
          <h1 className="min-w-0 flex-1 truncate text-center text-[17px] font-bold">
            노트
          </h1>
          <button
            type="button"
            onClick={() => void handleNewNote()}
            disabled={creating}
            className="h-11 shrink-0 rounded-xl bg-foreground px-3.5 text-[15px] font-medium text-background transition-colors active:opacity-80 disabled:opacity-40"
          >
            {creating ? "만드는 중…" : "+ 새 노트"}
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-3">
        {error && (
          <p className="py-6 text-center text-[15px] text-red-500">{error}</p>
        )}

        {!notes && !error && (
          <p className="py-20 text-center text-[16px] text-muted-foreground">
            불러오는 중…
          </p>
        )}

        {notes && notes.length === 0 && (
          <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-5 px-4">
            <p className="text-center text-[16px] leading-[1.6] text-muted-foreground">
              첫 노트를 만드세요
            </p>
            <button
              type="button"
              onClick={() => void handleNewNote()}
              disabled={creating}
              className="h-[52px] w-full max-w-xs rounded-2xl bg-foreground text-[16px] font-medium text-background transition-colors active:opacity-80 disabled:opacity-40"
            >
              {creating ? "만드는 중…" : "+ 새 노트"}
            </button>
          </div>
        )}

        {notes && notes.length > 0 && (
          <div>
            {notes.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => onOpenNote(note.id)}
                className="flex min-h-[52px] w-full items-center gap-3 rounded-xl px-1 py-2 text-left transition-colors active:bg-card"
              >
                <span className="min-w-0 flex-1 truncate text-[16px] leading-[1.6]">
                  {note.title}
                </span>
                <span className="shrink-0 text-[14px] text-muted-foreground">
                  {formatDay(note.updatedAt)}
                </span>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
