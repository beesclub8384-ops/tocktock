"use client";

import { useState, useSyncExternalStore } from "react";
import { ChatView } from "@/components/second-brain/ChatView";
import { ForestView } from "@/components/second-brain/ForestView";
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

export default function SecondBrainPage() {
  // 서버 렌더 시에는 항상 잠금 화면, 클라이언트에서 localStorage 확인
  const stored = useSyncExternalStore(subscribeAuth, readAuth, () => null);
  const [justAuthed, setJustAuthed] = useState(false);
  // null이면 숲 뷰, 값이 있으면 해당 대화 뷰
  const [openConvId, setOpenConvId] = useState<string | null>(null);
  const [focusInput, setFocusInput] = useState(false);
  // 토스트는 화면이 바뀌어도 남아야 하므로 여기서 들고 있는다
  const { message: toast, show: showToast } = useToast();

  const openConv = (id: string, shouldFocus = false) => {
    setOpenConvId(id);
    setFocusInput(shouldFocus);
  };

  const backToForest = () => {
    setOpenConvId(null);
    setFocusInput(false);
  };

  const authed = justAuthed || stored === PASSWORD;

  if (!authed) {
    return <PasswordGate onAuth={() => setJustAuthed(true)} />;
  }

  return (
    <>
      {openConvId ? (
        <ChatView
          key={openConvId}
          convId={openConvId}
          autoFocus={focusInput}
          onBack={backToForest}
          onNavigate={openConv}
          onToast={showToast}
        />
      ) : (
        <ForestView onOpen={openConv} onToast={showToast} />
      )}
      <Toast message={toast} />
    </>
  );
}
