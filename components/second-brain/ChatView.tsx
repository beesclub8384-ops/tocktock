"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ActionSheet } from "./ActionSheet";
import type { ActionSheetItem } from "./ActionSheet";
import { ConsolidatePanel } from "./ConsolidatePanel";
import { MessageBubble } from "./MessageBubble";
import { SourceModal } from "./SourceModal";
import {
  authHeaders,
  autoSizeTextarea,
  NEW_BRANCH_TITLE,
  ROOT_ID,
  ROOT_TITLE,
  SHELL_HEIGHT,
} from "./types";
import type { SBConversation, SBMessage, SBTree } from "./types";

/** 입력창은 5줄까지만 늘어난다 (16px x 1.6 x 5 + 여백) */
const COMPOSER_MAX_H = 152;

export function ChatView({
  convId,
  autoFocus,
  onBack,
  onNavigate,
  onToast,
}: {
  convId: string;
  autoFocus: boolean;
  onBack: () => void;
  onNavigate: (id: string, focusInput?: boolean) => void;
  onToast: (message: string) => void;
}) {
  const [conv, setConv] = useState<SBConversation | null>(null);
  const [tree, setTree] = useState<SBTree>({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingTs, setEditingTs] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [convMenuOpen, setConvMenuOpen] = useState(false);
  const [menuMessage, setMenuMessage] = useState<SBMessage | null>(null);

  // 한 줄 요약: 요약 요청 중인 답변 ts / 원문 팝업을 띄운 답변 ts (팝업은 한 번에 하나)
  const [oneLineTs, setOneLineTs] = useState<number | null>(null);
  const [sourceTs, setSourceTs] = useState<number | null>(null);

  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryText, setSummaryText] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const setComposerRef = useCallback((el: HTMLTextAreaElement | null) => {
    textareaRef.current = el;
    autoSizeTextarea(el, COMPOSER_MAX_H);
  }, []);

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

  // 새 메시지가 생기면 부드럽게 하단으로
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conv?.messages.length, sending]);

  // 방금 만든 가지로 들어온 경우 바로 질문할 수 있게 포커스
  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  /** 가지가 생기거나 사라지면 트리 인덱스도 다시 읽는다 */
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
    autoSizeTextarea(textareaRef.current, COMPOSER_MAX_H);

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

  /** 답변 하나를 한 줄로 요약한다. 원문(content)은 그대로 두고 oneLine만 붙는다 */
  const handleOneLine = useCallback(
    async (messageTs: number) => {
      if (oneLineTs !== null) return;

      setError(null);
      setOneLineTs(messageTs);
      try {
        const res = await fetch("/api/second-brain/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ convId, messageTs }),
        });
        const data = (await res.json()) as { oneLine?: string; error?: string };
        if (!res.ok || !data.oneLine) {
          setError(data.error ?? "요약하지 못했습니다.");
          return;
        }
        const oneLine = data.oneLine;
        setConv((prev) =>
          prev
            ? {
                ...prev,
                messages: prev.messages.map((m) =>
                  m.role === "assistant" && m.ts === messageTs
                    ? { ...m, oneLine }
                    : m
                ),
              }
            : prev
        );
      } catch {
        setError("네트워크 오류로 요약하지 못했습니다.");
      } finally {
        setOneLineTs(null);
      }
    },
    [convId, oneLineTs]
  );

  const handleComplete = useCallback(async () => {
    if (busy || !conv?.parentId) return;

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
      onToast("가지 완료");
      onNavigate(parentId);
    } catch {
      setError("네트워크 오류로 가지를 완료하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }, [busy, conv?.parentId, convId, onNavigate, onToast]);

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
        onToast("삭제됨");
      } catch {
        setError("네트워크 오류로 문답을 삭제하지 못했습니다.");
      } finally {
        setBusy(false);
      }
    },
    [busy, convId, editingTs, onToast, refreshTree, sending]
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
      onToast("수정됨");
    } catch {
      setError("네트워크 오류로 답변을 수정하지 못했습니다.");
    } finally {
      setSavingEdit(false);
    }
  }, [convId, editText, editingTs, onToast, savingEdit]);

  /** 정리본 미리보기를 만든다. 저장은 하지 않는다 */
  const requestSummary = useCallback(async () => {
    if (summarizing || applying) return;

    setSummaryError(null);
    setSummarizing(true);
    setSummaryText("");
    try {
      const res = await fetch("/api/second-brain/consolidate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ rootId: convId, action: "preview" }),
      });
      const data = (await res.json()) as { summary?: string; error?: string };
      if (!res.ok || !data.summary) {
        setSummaryError(data.error ?? "정리본을 만들지 못했습니다.");
        return;
      }
      setSummaryText(data.summary);
    } catch {
      setSummaryError("네트워크 오류로 정리본을 만들지 못했습니다.");
    } finally {
      setSummarizing(false);
    }
  }, [applying, convId, summarizing]);

  const openSummary = useCallback(() => {
    setSummaryOpen(true);
    void requestSummary();
  }, [requestSummary]);

  const closeSummary = useCallback(() => {
    setSummaryOpen(false);
    setSummaryText("");
    setSummaryError(null);
  }, []);

  /** 정리본을 새 줄기로 놓는다. 지금까지의 대화와 가지는 화면에서 사라진다 */
  const applySummary = useCallback(async () => {
    if (applying || summarizing || !summaryText.trim()) return;
    if (
      !confirm(
        "이 정리본을 새 줄기로 놓습니다. 지금까지의 대화와 가지는 화면에서 사라집니다. 진행할까요?"
      )
    )
      return;

    setSummaryError(null);
    setApplying(true);
    try {
      const res = await fetch("/api/second-brain/consolidate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          rootId: convId,
          action: "apply",
          summary: summaryText,
        }),
      });
      const data = (await res.json()) as {
        conv?: SBConversation;
        error?: string;
      };
      if (!res.ok || !data.conv) {
        setSummaryError(data.error ?? "줄기로 놓지 못했습니다.");
        return;
      }
      const updated = data.conv;
      setConv({
        ...updated,
        messages: Array.isArray(updated.messages) ? updated.messages : [],
      });
      setSummaryOpen(false);
      setSummaryText("");
      await refreshTree();
      onToast("정리본을 줄기로 놓았습니다");
    } catch {
      setSummaryError("네트워크 오류로 줄기로 놓지 못했습니다.");
    } finally {
      setApplying(false);
    }
  }, [applying, convId, onToast, refreshTree, summarizing, summaryText]);

  /** 이 주제(나무)를 통째로 지운다. 숲 뷰로 돌아간다 */
  const handleDeleteTree = useCallback(async () => {
    if (busy) return;
    if (!confirm("이 주제와 모든 가지를 삭제할까요? 되돌릴 수 없습니다."))
      return;

    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/second-brain/root", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ rootId: convId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "주제를 삭제하지 못했습니다.");
        return;
      }
      onToast("삭제됨");
      onBack();
    } catch {
      setError("네트워크 오류로 주제를 삭제하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }, [busy, convId, onBack, onToast]);

  const messages = conv?.messages ?? [];
  const isBranch = Boolean(conv?.parentId);
  const editing = editingTs !== null;
  // 원문 팝업에 띄울 답변. 요약이 지워지거나 대화가 바뀌면 자연히 사라진다
  const sourceMessage =
    sourceTs === null ? null : messages.find((m) => m.ts === sourceTs);
  const actionsDisabled = busy || sending || editing;
  // 전체 요약은 줄기(뿌리 대화)에서, 내용이 있을 때만
  const canConsolidate = !isBranch && messages.length > 0;
  const canComplete = isBranch && conv?.status === "active";
  // 주제 삭제는 뿌리 대화에서만
  const canDeleteTree = !isBranch && conv !== null;
  const hasConvMenu = canConsolidate || canComplete || canDeleteTree;

  const convMenuItems: ActionSheetItem[] = [];
  if (canComplete) {
    convMenuItems.push({
      label: "가지 완료",
      onSelect: () => void handleComplete(),
    });
  }
  if (canConsolidate) {
    convMenuItems.push({ label: "전체 요약", onSelect: openSummary });
  }
  if (canDeleteTree) {
    convMenuItems.push({
      label: "주제 삭제",
      destructive: true,
      onSelect: () => void handleDeleteTree(),
    });
  }

  const messageMenuItems: ActionSheetItem[] = [];
  if (menuMessage) {
    if (menuMessage.role === "assistant") {
      const target = menuMessage;
      messageMenuItems.push({
        label: "수정",
        onSelect: () => startEdit(target),
      });
      // 정리본은 이미 요약이라 한 줄 요약 대상이 아니다
      if (target.consolidated !== true) {
        messageMenuItems.push({
          label: target.oneLine ? "다시 한 줄 요약" : "한 줄 요약",
          onSelect: () => void handleOneLine(target.ts),
        });
      }
    }
    // 정리본은 줄기 그 자체라 문답 단위로 지우지 않는다
    if (menuMessage.consolidated !== true) {
      const ts = menuMessage.ts;
      messageMenuItems.push({
        label: "삭제",
        destructive: true,
        onSelect: () => void handleDelete(ts),
      });
    }
  }

  return (
    <div
      className="flex flex-col bg-background"
      style={{ height: SHELL_HEIGHT }}
    >
      <header className="shrink-0 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-1 px-2">
          <button
            type="button"
            onClick={onBack}
            className="flex h-11 shrink-0 items-center rounded-xl px-2.5 text-[15px] text-foreground transition-colors active:bg-card"
          >
            ‹ 뒤로
          </button>
          <h1 className="min-w-0 flex-1 truncate text-center text-[17px] font-bold">
            {conv?.title ?? ROOT_TITLE}
          </h1>
          {hasConvMenu ? (
            <button
              type="button"
              aria-label="대화 메뉴"
              onClick={() => setConvMenuOpen(true)}
              disabled={actionsDisabled}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[18px] text-foreground transition-colors active:bg-card disabled:opacity-40"
            >
              ⋯
            </button>
          ) : (
            <span className="h-11 w-11 shrink-0" />
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-5 px-4 py-4">
          {messages.length === 0 && !sending && (
            <p className="py-20 text-center text-[16px] text-muted-foreground">
              무엇이든 물어보세요
            </p>
          )}

          {messages.map((m, i) => (
            <MessageBubble
              key={`${m.ts}-${i}`}
              message={m}
              tree={tree}
              editing={editingTs === m.ts}
              editText={editText}
              savingEdit={savingEdit}
              actionsDisabled={actionsDisabled}
              onEditTextChange={setEditText}
              onSaveEdit={() => void handleSaveEdit()}
              onCancelEdit={cancelEdit}
              onBranch={(ts) => void handleBranch(ts)}
              onOpenMenu={setMenuMessage}
              onOpenBranch={onNavigate}
              onOpenSource={setSourceTs}
            />
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-3 text-[16px] leading-[1.6] text-muted-foreground">
                생각 중…
              </div>
            </div>
          )}

          {oneLineTs !== null && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm border border-dashed border-border bg-card px-4 py-3 text-[16px] leading-[1.6] text-muted-foreground">
                한 줄로 줄이는 중…
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </main>

      {/* 수정 중에는 입력창을 숨긴다 */}
      {!editing && (
        <div
          className="shrink-0 border-t border-border bg-background/95 backdrop-blur"
          style={{ paddingBottom: "calc(10px + env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto w-full max-w-2xl px-4 pt-2.5">
            {/* 오류는 다음 동작 전까지 남겨 둔다 */}
            {error && (
              <p className="mb-2 text-[14px] leading-[1.5] text-red-500">
                {error}
              </p>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={setComposerRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  autoSizeTextarea(e.currentTarget, COMPOSER_MAX_H);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="메시지를 입력하세요"
                className="min-h-[44px] flex-1 resize-none rounded-2xl border border-border bg-card px-4 py-2.5 text-[16px] leading-[1.6] text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
              />
              <button
                type="button"
                aria-label="전송"
                onClick={() => void handleSend()}
                disabled={sending || !input.trim()}
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground text-[18px] leading-none text-background transition-colors active:opacity-80 disabled:opacity-40"
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      )}

      <ActionSheet
        open={convMenuOpen}
        items={convMenuItems}
        onClose={() => setConvMenuOpen(false)}
      />
      <ActionSheet
        open={menuMessage !== null}
        items={messageMenuItems}
        onClose={() => setMenuMessage(null)}
      />
      <ConsolidatePanel
        open={summaryOpen}
        loading={summarizing}
        applying={applying}
        summary={summaryText}
        error={summaryError}
        onApply={() => void applySummary()}
        onRegenerate={() => void requestSummary()}
        onClose={closeSummary}
      />
      {sourceMessage && (
        <SourceModal
          content={sourceMessage.content}
          onClose={() => setSourceTs(null)}
        />
      )}
    </div>
  );
}
