"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

const PASSWORD = "8384";
const AUTH_KEY = "sb-auth";

interface SBMessage {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

interface SBConversation {
  id: string;
  title: string;
  messages: SBMessage[];
  createdAt: number;
  updatedAt: number;
}

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

// ── 비밀번호 화면 ──

function PasswordGate({ onAuth }: { onAuth: () => void }) {
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
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-24 sm:px-8">
        <section className="flex justify-center">
          <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-4">
            <h2 className="text-lg font-bold text-center">제2의 뇌</h2>
            <p className="text-sm text-center text-muted-foreground">
              비밀번호를 입력하면 대화 화면으로 이동합니다
            </p>
            <input
              type="password"
              value={pw}
              onChange={(e) => {
                setPw(e.target.value);
                setError(false);
              }}
              className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
              placeholder="비밀번호"
              autoFocus
            />
            {error && (
              <p className="text-sm text-red-400 text-center">
                비밀번호가 틀렸습니다
              </p>
            )}
            <button
              type="submit"
              className="w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
            >
              확인
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

// ── 대화 화면 ──

function ChatView() {
  const [messages, setMessages] = useState<SBMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 마운트 시 기존 대화 로드
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/second-brain/chat", {
          headers: { "x-sb-key": PASSWORD },
        });
        if (!res.ok) return;
        const conv = (await res.json()) as SBConversation | null;
        if (!cancelled && conv && Array.isArray(conv.messages) && conv.messages.length > 0) {
          setMessages(conv.messages);
        }
      } catch {
        // 초기 로드 실패는 조용히 무시 (빈 대화로 시작)
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 새 메시지가 생기면 자동 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    setError(null);
    setSending(true);
    setInput("");
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text, ts: Date.now() },
    ]);

    const el = textareaRef.current;
    if (el) el.style.height = "auto";

    try {
      const res = await fetch("/api/second-brain/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-sb-key": PASSWORD,
        },
        body: JSON.stringify({ message: text }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || !data.reply) {
        setError(data.error ?? "응답을 가져오지 못했습니다.");
        return;
      }
      const reply = data.reply;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: reply, ts: Date.now() },
      ]);
    } catch {
      setError("네트워크 오류로 응답을 가져오지 못했습니다.");
    } finally {
      setSending(false);
    }
  }, [input, sending]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* 상단 고정 헤더 */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center px-4 py-3">
          <h1 className="text-base font-bold">제2의 뇌</h1>
        </div>
      </header>

      {/* 대화 목록 */}
      <main className="flex-1">
        <div className="mx-auto w-full max-w-3xl space-y-3 px-4 py-4 pb-40">
          {messages.length === 0 && !sending && (
            <p className="py-16 text-center text-sm text-muted-foreground">
              무엇이든 물어보세요
            </p>
          )}

          {messages.map((m, i) => (
            <div
              key={`${m.ts}-${i}`}
              className={
                m.role === "user" ? "flex justify-end" : "flex justify-start"
              }
            >
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-foreground px-4 py-2.5 text-sm leading-relaxed text-background"
                    : "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-2.5 text-sm leading-relaxed text-foreground"
                }
              >
                {m.content}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
                생각 중...
              </div>
            </div>
          )}

          {error && <p className="text-center text-sm text-red-400">{error}</p>}

          <div ref={bottomRef} />
        </div>
      </main>

      {/* 하단 고정 입력창 */}
      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-end gap-2 px-4 py-3">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              resizeTextarea();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="메시지를 입력하세요"
            className="max-h-40 min-h-[44px] flex-1 resize-none rounded-2xl border border-border bg-card px-4 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || !input.trim()}
            className="h-[44px] shrink-0 rounded-2xl bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-40"
          >
            전송
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SecondBrainPage() {
  // 서버 렌더 시에는 항상 잠금 화면, 클라이언트에서 localStorage 확인
  const stored = useSyncExternalStore(subscribeAuth, readAuth, () => null);
  const [justAuthed, setJustAuthed] = useState(false);

  const authed = justAuthed || stored === PASSWORD;

  if (!authed) {
    return <PasswordGate onAuth={() => setJustAuthed(true)} />;
  }
  return <ChatView />;
}
