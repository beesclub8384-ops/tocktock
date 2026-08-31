"use client";

import { BranchChips } from "./BranchChips";
import { autoSizeTextarea, messageBranches } from "./types";
import type { SBMessage, SBTree } from "./types";

/** 수정 모드 textarea 높이 맞추기 (콜백 ref) */
function sizeEditor(el: HTMLTextAreaElement | null) {
  autoSizeTextarea(el);
}

export function MessageBubble({
  message,
  tree,
  editing,
  editText,
  savingEdit,
  actionsDisabled,
  onEditTextChange,
  onSaveEdit,
  onCancelEdit,
  onBranch,
  onOpenMenu,
  onOpenBranch,
}: {
  message: SBMessage;
  tree: SBTree;
  editing: boolean;
  editText: string;
  savingEdit: boolean;
  actionsDisabled: boolean;
  onEditTextChange: (text: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onBranch: (ts: number) => void;
  onOpenMenu: (message: SBMessage) => void;
  onOpenBranch: (id: string) => void;
}) {
  const isUser = message.role === "user";
  const isConsolidated = message.consolidated === true;
  const branches = messageBranches(message);

  if (editing) {
    return (
      <div className="flex flex-col items-start">
        <div className="w-full space-y-2.5 rounded-2xl border border-border bg-card p-3">
          <textarea
            ref={sizeEditor}
            value={editText}
            onChange={(e) => {
              onEditTextChange(e.target.value);
              autoSizeTextarea(e.currentTarget);
            }}
            className="w-full resize-none rounded-xl border border-border bg-background px-3.5 py-3 text-[16px] leading-[1.6] text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onSaveEdit}
              disabled={savingEdit || !editText.trim()}
              className="h-11 flex-1 rounded-xl bg-foreground text-[16px] font-medium text-background transition-colors active:opacity-80 disabled:opacity-40"
            >
              {savingEdit ? "저장 중…" : "저장"}
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              disabled={savingEdit}
              className="h-11 flex-1 rounded-xl border border-border bg-card text-[16px] text-foreground transition-colors active:bg-border/40 disabled:opacity-40"
            >
              취소
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={isUser ? "flex flex-col items-end" : "flex flex-col items-start"}>
      {isConsolidated ? (
        <div className="w-[92%] rounded-2xl rounded-bl-sm border border-border border-l-4 border-l-foreground bg-card px-4 py-3.5">
          <p className="mb-2 text-[13px] font-medium text-muted-foreground">
            정리본
          </p>
          <div className="whitespace-pre-wrap break-words text-[16px] leading-[1.6] text-foreground">
            {message.content}
          </div>
        </div>
      ) : (
        <div
          className={
            isUser
              ? "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-foreground px-4 py-3 text-[16px] leading-[1.6] text-background"
              : "max-w-[92%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-3 text-[16px] leading-[1.6] text-foreground"
          }
        >
          {message.content}
        </div>
      )}

      <div className="mt-2 w-full space-y-2">
        {!isUser && (
          <BranchChips
            branches={branches}
            tree={tree}
            onOpen={onOpenBranch}
          />
        )}

        <div
          className={`flex items-center gap-2 ${
            isUser ? "justify-end" : "justify-between"
          }`}
        >
          {!isUser && (
            <div className="flex items-center gap-2">
              {/* 가지가 이미 있어도 추가로 뻗을 수 있다 */}
              <button
                type="button"
                onClick={() => onBranch(message.ts)}
                disabled={actionsDisabled}
                className="h-9 rounded-full border border-border bg-transparent px-3.5 text-[14px] text-muted-foreground transition-colors active:bg-card disabled:opacity-40"
              >
                가지 뻗기
              </button>
              {message.editedAt != null && (
                <span className="text-[13px] text-muted-foreground">수정됨</span>
              )}
            </div>
          )}

          <button
            type="button"
            aria-label="이 문답 메뉴"
            onClick={() => onOpenMenu(message)}
            disabled={actionsDisabled}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-[16px] leading-none text-muted-foreground transition-colors active:bg-card disabled:opacity-40"
          >
            ⋯
          </button>
        </div>
      </div>
    </div>
  );
}
