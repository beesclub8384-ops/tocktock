"use client";

import { useState, useSyncExternalStore } from "react";
import { ChatView } from "@/components/second-brain/ChatView";
import { ForestView } from "@/components/second-brain/ForestView";
import { NoteEditor } from "@/components/second-brain/NoteEditor";
import { NotesView } from "@/components/second-brain/NotesView";
import { PasswordGate } from "@/components/second-brain/PasswordGate";
import { Toast, useToast } from "@/components/second-brain/Toast";
import { AUTH_KEY, PASSWORD } from "@/components/second-brain/types";

// ── localStorage 인증값 구독 (effect 없이 초기값 읽기) ──

function subscribeAuth(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function readAuth(): string | null {
  try {
    return window.localStorage.getItem(AUTH_KEY);
  } catch {
    return null;
  }
}

/** 상태 하나로 화면을 고른다 */
type View =
  | { kind: "forest" }
  | { kind: "chat"; convId: string; focusInput: boolean }
  | { kind: "notes" }
  | { kind: "note"; noteId: string; isNew: boolean };

export default function SecondBrainPage() {
  // 서버 렌더 시에는 항상 잠금 화면, 클라이언트에서 localStorage 확인
  const stored = useSyncExternalStore(subscribeAuth, readAuth, () => null);
  const [justAuthed, setJustAuthed] = useState(false);
  const [view, setView] = useState<View>({ kind: "forest" });
  // 토스트는 화면이 바뀌어도 남아야 하므로 여기서 들고 있는다
  const { message: toast, show: showToast } = useToast();

  const openConv = (convId: string, shouldFocus = false) =>
    setView({ kind: "chat", convId, focusInput: shouldFocus });

  const openNote = (noteId: string, isNew = false) =>
    setView({ kind: "note", noteId, isNew });

  const backToForest = () => setView({ kind: "forest" });
  const backToNotes = () => setView({ kind: "notes" });

  const authed = justAuthed || stored === PASSWORD;

  if (!authed) {
    return <PasswordGate onAuth={() => setJustAuthed(true)} />;
  }

  return (
    <>
      {view.kind === "chat" && (
        <ChatView
          key={view.convId}
          convId={view.convId}
          autoFocus={view.focusInput}
          onBack={backToForest}
          onNavigate={openConv}
          onToast={showToast}
        />
      )}

      {view.kind === "notes" && (
        <NotesView
          onOpenNote={openNote}
          onBack={backToForest}
          onToast={showToast}
        />
      )}

      {view.kind === "note" && (
        <NoteEditor
          key={view.noteId}
          noteId={view.noteId}
          isNew={view.isNew}
          onBack={backToNotes}
          onToast={showToast}
        />
      )}

      {view.kind === "forest" && (
        <ForestView
          onOpen={openConv}
          onOpenNotes={backToNotes}
          onToast={showToast}
        />
      )}

      <Toast message={toast} />
    </>
  );
}
