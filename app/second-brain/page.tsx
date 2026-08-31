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
const ROOT_ID = "root";
const ROOT_TITLE = "제2의 뇌";
/** 가지 생성 시 붙는 임시 제목. 첫 질문이 들어가면 서버가 교체한다 */
const NEW_BRANCH_TITLE = "새 가지";

interface SBBranchRef {
  branchId: string;
  summary?: string;
}

interface SBMessage {
  role: "user" | "assistant";
  content: string;
  ts: number;
  /** 답변을 손으로 고친 시각 */
  editedAt?: number;
  branches?: SBBranchRef[];
  /** 옛 형식(가지 1개) 대비 */
  branchId?: string;
  branchSummary?: string;
}

/** 옛 형식 메시지도 branches 배열로 취급한다 */
function messageBranches(m: SBMessage): SBBranchRef[] {
  const branches = Array.isArray(m.branches)
    ? m.branches.filter((b) => b && b.branchId)
    : [];
  if (m.branchId && !branches.some((b) => b.branchId === m.branchId)) {
    return [...branches, { branchId: m.branchId, summary: m.branchSummary }];
  }
  return branches;
}

interface SBConversation {
  id: string;
  title: string;
  messages: SBMessage[];
  createdAt: number;
  updatedAt: number;
  parentId?: string;
  parentMessageTs?: number;
  status: "active" | "done";
}

interface SBTreeNode {
  id: string;
  title: string;
  status: "active" | "done";
  children: string[];
}

type SBTree = Record<string, SBTreeNode>;

const authHeaders = { "x-sb-key": PASSWORD };

/** textarea 높이를 내용에 맞춘다. 콜백 ref로도, onChange에서도 쓴다 */
function autoSizeTextarea(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
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
            <h2 className="text-lg font-bold text-center">{ROOT_TITLE}</h2>
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

// ── 상태 배지 ──

function StatusBadge({ status }: { status: "active" | "done" }) {
  if (status === "done") {
    return (
      <span className="shrink-0 text-xs text-emerald-500" aria-label="완료">
        ✓
      </span>
    );
  }
  return (
    <span
      className="inline-block size-2 shrink-0 rounded-full bg-blue-500"
      aria-label="진행 중"
    />
  );
}

// ── 트리 뷰 ──

function renderTreeRows(
  tree: SBTree,
  id: string,
  depth: number,
  visited: Set<string>,
  onOpen: (id: string) => void
): React.ReactElement[] {
  if (visited.has(id)) return [];
  visited.add(id);

  const node = tree[id];
  if (!node) return [];

  const rows: React.ReactElement[] = [
    <button
      key={node.id}
      type="button"
      onClick={() => onOpen(node.id)}
      style={{ paddingLeft: 16 + depth * 18 }}
      className="flex w-full items-center gap-2 rounded-lg py-2.5 pr-4 text-left text-sm transition-colors hover:bg-card"
    >
      <StatusBadge status={node.status} />
      <span className="truncate">{node.title}</span>
    </button>,
  ];

  for (const childId of node.children) {
    rows.push(...renderTreeRows(tree, childId, depth + 1, visited, onOpen));
  }
  return rows;
}

function ForestView({
  onOpen,
}: {
  onOpen: (id: string, shouldFocus?: boolean) => void;
}) {
  const [roots, setRoots] = useState<string[] | null>(null);
  const [tree, setTree] = useState<SBTree | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/second-brain/tree", {
          headers: authHeaders,
        });
        if (!res.ok) {
          if (!cancelled) setError("트리를 불러오지 못했습니다.");
          return;
        }
        const data = (await res.json()) as { roots?: string[]; tree?: SBTree };
        if (cancelled) return;
        setRoots(Array.isArray(data.roots) ? data.roots : []);
        setTree(data.tree ?? {});
      } catch {
        if (!cancelled) setError("네트워크 오류로 트리를 불러오지 못했습니다.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleNewRoot = useCallback(async () => {
    if (creating) return;

    setError(null);
    setCreating(true);
    try {
      // 제목은 임시값. 새 주제에 첫 질문이 들어가면 서버가 그 질문으로 교체한다
      const res = await fetch("/api/second-brain/root", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
      });
      const data = (await res.json()) as { convId?: string; error?: string };
      if (!res.ok || !data.convId) {
        setError(data.error ?? "새 주제를 만들지 못했습니다.");
        return;
      }
      onOpen(data.convId, true);
    } catch {
      setError("네트워크 오류로 새 주제를 만들지 못했습니다.");
    } finally {
      setCreating(false);
    }
  }, [creating, onOpen]);

  // 나무끼리 노드가 겹치지 않도록 방문 집합을 숲 전체에서 공유한다
  const visited = new Set<string>();
  const trees = tree
    ? (roots ?? [])
        .map((rootId) => ({
          rootId,
          rows: renderTreeRows(tree, rootId, 0, visited, onOpen),
        }))
        .filter((t) => t.rows.length > 0)
    : [];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <h1 className="min-w-0 flex-1 truncate text-base font-bold">
            {ROOT_TITLE}
          </h1>
          <button
            type="button"
            onClick={() => void handleNewRoot()}
            disabled={creating}
            className="shrink-0 rounded-lg bg-foreground px-2.5 py-1 text-xs font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-40"
          >
            {creating ? "만드는 중..." : "+ 새 주제"}
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-4">
        {error && <p className="py-8 text-center text-sm text-red-400">{error}</p>}
        {!tree && !error && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            불러오는 중...
          </p>
        )}
        {tree && trees.length === 0 && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            첫 주제를 시작하세요
          </p>
        )}
        {trees.length > 0 && (
          <div className="space-y-4">
            {trees.map((t, idx) => (
              <div
                key={t.rootId}
                className={
                  idx === 0
                    ? "space-y-0.5"
                    : "space-y-0.5 border-t border-border pt-4"
                }
              >
                {t.rows}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ── 가지 표시(링크 + 요약 접이식) ──

function BranchMarker({
  branchId,
  title,
  summary,
  onOpen,
}: {
  branchId: string;
  title: string;
  summary?: string;
  onOpen: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onOpen(branchId)}
          className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-border/40"
        >
          ↳ {title}
        </button>
        {summary && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs text-muted-foreground underline underline-offset-2"
          >
            {open ? "요약 접기" : "요약 펼치기"}
          </button>
        )}
      </div>
      {summary && open && (
        <div className="whitespace-pre-wrap break-words rounded-xl border border-border bg-card/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {summary}
        </div>
      )}
    </div>
  );
}

// ── 대화 뷰 ──

function ChatView({
  convId,
  autoFocus,
  onBack,
  onNavigate,
}: {
  convId: string;
  autoFocus: boolean;
  onBack: () => void;
  onNavigate: (id: string, focusInput?: boolean) => void;
}) {
  const [conv, setConv] = useState<SBConversation | null>(null);
  const [tree, setTree] = useState<SBTree>({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 편집 중인 답변의 ts. null이면 편집 모드가 아니다
  const [editingTs, setEditingTs] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 대화 + 트리 로드
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [convRes, treeRes] = await Promise.all([
          fetch(`/api/second-brain/chat?convId=${encodeURIComponent(convId)}`, {
            headers: authHeaders,
          }),
          fetch("/api/second-brain/tree", { headers: authHeaders }),
        ]);

        if (!cancelled && treeRes.ok) {
          const treeData = (await treeRes.json()) as { tree?: SBTree };
          setTree(treeData.tree ?? {});
        }

        if (!convRes.ok) {
          if (!cancelled) setError("대화를 불러오지 못했습니다.");
          return;
        }
        const data = (await convRes.json()) as SBConversation | null;
        if (cancelled) return;

        if (data) {
          setConv({
            ...data,
            messages: Array.isArray(data.messages) ? data.messages : [],
          });
        } else if (convId === ROOT_ID) {
          // 루트 대화가 아직 저장 전이면 빈 대화로 시작
          const now = Date.now();
          setConv({
            id: ROOT_ID,
            title: ROOT_TITLE,
            messages: [],
            createdAt: now,
            updatedAt: now,
            status: "active",
          });
        } else {
          setError("대화를 찾을 수 없습니다.");
        }
      } catch {
        if (!cancelled) setError("네트워크 오류로 대화를 불러오지 못했습니다.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [convId]);

  // 새 메시지가 생기면 자동 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conv?.messages.length, sending]);

  // 방금 만든 가지로 들어온 경우 바로 질문할 수 있게 포커스
  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending || editingTs !== null) return;

    setError(null);
    setSending(true);
    setInput("");
    // 낙관적으로 먼저 띄우는 말풍선. 응답이 오면 서버가 저장한 ts로 교체한다
    const pendingTs = Date.now();
    setConv((prev) =>
      prev
        ? {
            ...prev,
            messages: [
              ...prev.messages,
              { role: "user", content: text, ts: pendingTs },
            ],
          }
        : prev
    );

    const el = textareaRef.current;
    if (el) el.style.height = "auto";

    try {
      const res = await fetch("/api/second-brain/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ message: text, convId }),
      });
      const data = (await res.json()) as {
        reply?: string;
        title?: string;
        userMessage?: SBMessage;
        assistantMessage?: SBMessage;
        error?: string;
      };
      if (!res.ok || !data.reply) {
        setError(data.error ?? "응답을 가져오지 못했습니다.");
        return;
      }
      const reply = data.reply;
      const title = data.title;
      const savedUser = data.userMessage;
      const savedAssistant: SBMessage = data.assistantMessage ?? {
        role: "assistant",
        content: reply,
        ts: Date.now(),
      };
      setConv((prev) => {
        if (!prev) return prev;
        // 낙관적 말풍선을 서버가 저장한 메시지로 교체 → 화면의 ts가 서버와 일치
        const messages = savedUser
          ? prev.messages.map((m) =>
              m.role === "user" && m.ts === pendingTs ? savedUser : m
            )
          : prev.messages;
        return {
          ...prev,
          // 첫 질문으로 제목이 자동 생성되면 화면에도 바로 반영
          title: title ?? prev.title,
          messages: [...messages, savedAssistant],
        };
      });
    } catch {
      setError("네트워크 오류로 응답을 가져오지 못했습니다.");
    } finally {
      setSending(false);
    }
  }, [convId, editingTs, input, sending]);

  const handleBranch = useCallback(
    async (parentMessageTs: number) => {
      if (busy || editingTs !== null) return;

      setError(null);
      setBusy(true);
      try {
        // 제목은 임시값. 가지에 첫 질문이 들어가면 서버가 그 질문으로 교체한다
        const res = await fetch("/api/second-brain/branch", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({
            parentId: convId,
            parentMessageTs,
            title: NEW_BRANCH_TITLE,
          }),
        });
        const data = (await res.json()) as { convId?: string; error?: string };
        if (!res.ok || !data.convId) {
          setError(data.error ?? "가지를 만들지 못했습니다.");
          return;
        }
        onNavigate(data.convId, true);
      } catch {
        setError("네트워크 오류로 가지를 만들지 못했습니다.");
      } finally {
        setBusy(false);
      }
    },
    [busy, convId, editingTs, onNavigate]
  );

  const handleComplete = useCallback(async () => {
    if (busy || !conv?.parentId) return;
    if (
      !confirm(
        "이 가지를 완료할까요? 대화 내용이 요약되어 부모 대화에 남습니다."
      )
    )
      return;

    const parentId = conv.parentId;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/second-brain/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ convId }),
      });
      const data = (await res.json()) as { summary?: string; error?: string };
      if (!res.ok || !data.summary) {
        setError(data.error ?? "가지를 완료하지 못했습니다.");
        return;
      }
      onNavigate(parentId);
    } catch {
      setError("네트워크 오류로 가지를 완료하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }, [busy, conv?.parentId, convId, onNavigate]);

  /** 가지가 사라지면 트리 인덱스도 다시 읽는다 */
  const refreshTree = useCallback(async () => {
    try {
      const res = await fetch("/api/second-brain/tree", {
        headers: authHeaders,
      });
      if (!res.ok) return;
      const data = (await res.json()) as { tree?: SBTree };
      setTree(data.tree ?? {});
    } catch {
      // 트리 갱신 실패는 화면 동작을 막지 않는다
    }
  }, []);

  const handleDelete = useCallback(
    async (messageTs: number) => {
      if (busy || sending || editingTs !== null) return;
      if (
        !confirm("이 문답을 삭제할까요? 여기서 뻗은 가지도 함께 삭제됩니다.")
      )
        return;

      setError(null);
      setBusy(true);
      try {
        const res = await fetch("/api/second-brain/message", {
          method: "DELETE",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ convId, messageTs }),
        });
        const data = (await res.json()) as {
          conv?: SBConversation;
          error?: string;
        };
        if (!res.ok || !data.conv) {
          setError(data.error ?? "문답을 삭제하지 못했습니다.");
          return;
        }
        const updated = data.conv;
        setConv({
          ...updated,
          messages: Array.isArray(updated.messages) ? updated.messages : [],
        });
        await refreshTree();
      } catch {
        setError("네트워크 오류로 문답을 삭제하지 못했습니다.");
      } finally {
        setBusy(false);
      }
    },
    [busy, convId, editingTs, refreshTree, sending]
  );

  const startEdit = useCallback((m: SBMessage) => {
    setError(null);
    setEditingTs(m.ts);
    setEditText(m.content);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingTs(null);
    setEditText("");
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (editingTs === null || savingEdit) return;
    const text = editText.trim();
    if (!text) {
      setError("내용이 비어 있습니다.");
      return;
    }

    setError(null);
    setSavingEdit(true);
    try {
      const res = await fetch("/api/second-brain/message", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ convId, messageTs: editingTs, content: text }),
      });
      const data = (await res.json()) as {
        message?: SBMessage;
        error?: string;
      };
      if (!res.ok || !data.message) {
        setError(data.error ?? "답변을 수정하지 못했습니다.");
        return;
      }
      const saved = data.message;
      setConv((prev) =>
        prev
          ? {
              ...prev,
              messages: prev.messages.map((m) =>
                // 가지 정보는 화면에 있는 값을 그대로 둔다
                m.ts === saved.ts
                  ? { ...m, content: saved.content, editedAt: saved.editedAt }
                  : m
              ),
            }
          : prev
      );
      setEditingTs(null);
      setEditText("");
    } catch {
      setError("네트워크 오류로 답변을 수정하지 못했습니다.");
    } finally {
      setSavingEdit(false);
    }
  }, [convId, editText, editingTs, savingEdit]);

  const messages = conv?.messages ?? [];
  const isBranch = Boolean(conv?.parentId);
  // 편집 중에는 전송·가지 뻗기·삭제를 막는다
  const editing = editingTs !== null;
  const actionsDisabled = busy || sending || editing;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* 상단 고정 헤더 */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs transition-colors hover:bg-card"
          >
            ← 트리
          </button>
          <h1 className="min-w-0 flex-1 truncate text-base font-bold">
            {conv?.title ?? ROOT_TITLE}
          </h1>
          {isBranch && conv?.status === "active" && (
            <button
              type="button"
              onClick={() => void handleComplete()}
              disabled={busy}
              className="shrink-0 rounded-lg bg-foreground px-2.5 py-1 text-xs font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-40"
            >
              {busy ? "처리 중..." : "가지 완료"}
            </button>
          )}
          {isBranch && conv?.status === "done" && (
            <span className="shrink-0 text-xs text-emerald-500">완료됨</span>
          )}
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

          {messages.map((m, i) => {
            const branches = messageBranches(m);
            const isUser = m.role === "user";
            const isEditingThis = editingTs === m.ts;
            return (
              <div
                key={`${m.ts}-${i}`}
                className={
                  isUser
                    ? "flex flex-col items-end"
                    : "flex flex-col items-start"
                }
              >
                {isEditingThis ? (
                  <div className="w-full max-w-[85%] space-y-2 rounded-2xl rounded-bl-sm border border-border bg-card px-3 py-3">
                    <textarea
                      ref={autoSizeTextarea}
                      value={editText}
                      onChange={(e) => {
                        setEditText(e.target.value);
                        autoSizeTextarea(e.currentTarget);
                      }}
                      className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-foreground/20"
                      autoFocus
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSaveEdit()}
                        disabled={savingEdit || !editText.trim()}
                        className="rounded-lg bg-foreground px-2.5 py-1 text-xs font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-40"
                      >
                        {savingEdit ? "저장 중..." : "저장"}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={savingEdit}
                        className="rounded-lg border border-border px-2.5 py-1 text-xs transition-colors hover:bg-border/40 disabled:opacity-40"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={
                      isUser
                        ? "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-foreground px-4 py-2.5 text-sm leading-relaxed text-background"
                        : "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-2.5 text-sm leading-relaxed text-foreground"
                    }
                  >
                    {m.content}
                  </div>
                )}

                {!isEditingThis && (
                  <div className="mt-1.5 w-full max-w-[85%] space-y-1.5">
                    {branches.map((b) => (
                      <BranchMarker
                        key={b.branchId}
                        branchId={b.branchId}
                        title={tree[b.branchId]?.title ?? "가지"}
                        summary={b.summary}
                        onOpen={onNavigate}
                      />
                    ))}

                    <div
                      className={
                        isUser
                          ? "flex flex-wrap items-center justify-end gap-3"
                          : "flex flex-wrap items-center gap-3"
                      }
                    >
                      {m.editedAt != null && (
                        <span className="text-xs text-muted-foreground">
                          수정됨
                        </span>
                      )}

                      {/* 가지가 이미 있어도 추가로 뻗을 수 있다 */}
                      {!isUser && (
                        <button
                          type="button"
                          onClick={() => void handleBranch(m.ts)}
                          disabled={actionsDisabled}
                          className="text-xs text-muted-foreground underline underline-offset-2 disabled:opacity-40"
                        >
                          가지 뻗기
                        </button>
                      )}

                      {!isUser && (
                        <button
                          type="button"
                          onClick={() => startEdit(m)}
                          disabled={actionsDisabled}
                          className="text-xs text-muted-foreground underline underline-offset-2 disabled:opacity-40"
                        >
                          수정
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => void handleDelete(m.ts)}
                        disabled={actionsDisabled}
                        className="text-xs text-red-400 underline underline-offset-2 disabled:opacity-40"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

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
            disabled={editing}
            placeholder={
              editing ? "답변을 수정하는 중입니다" : "메시지를 입력하세요"
            }
            className="max-h-40 min-h-[44px] flex-1 resize-none rounded-2xl border border-border bg-card px-4 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-foreground/20 disabled:opacity-40"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={editing || sending || !input.trim()}
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
  // null이면 트리 뷰, 값이 있으면 해당 대화 뷰
  const [openConvId, setOpenConvId] = useState<string | null>(null);
  const [focusInput, setFocusInput] = useState(false);

  const openConv = (id: string, shouldFocus = false) => {
    setOpenConvId(id);
    setFocusInput(shouldFocus);
  };

  const backToTree = () => {
    setOpenConvId(null);
    setFocusInput(false);
  };

  const authed = justAuthed || stored === PASSWORD;

  if (!authed) {
    return <PasswordGate onAuth={() => setJustAuthed(true)} />;
  }

  if (!openConvId) {
    return <ForestView onOpen={openConv} />;
  }

  return (
    <ChatView
      key={openConvId}
      convId={openConvId}
      autoFocus={focusInput}
      onBack={backToTree}
      onNavigate={openConv}
    />
  );
}
