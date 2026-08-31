"use client";

import { useState } from "react";
import type { SBBranchRef, SBTree } from "./types";

/**
 * 한 메시지에서 뻗은 가지들을 칩으로 가로 나열한다.
 * 완료된 가지는 체크가 붙고, 요약이 있으면 "요약" 칩으로 펼쳐 본다.
 */
export function BranchChips({
  branches,
  tree,
  onOpen,
}: {
  branches: SBBranchRef[];
  tree: SBTree;
  onOpen: (id: string) => void;
}) {
  const [openSummaryId, setOpenSummaryId] = useState<string | null>(null);

  if (branches.length === 0) return null;

  const openSummary = branches.find(
    (b) => b.branchId === openSummaryId
  )?.summary;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {branches.map((b) => {
          const node = tree[b.branchId];
          const done = node?.status === "done";
          return (
            <span key={b.branchId} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onOpen(b.branchId)}
                className="flex h-9 max-w-[220px] items-center gap-1 rounded-full border border-border bg-card px-3 text-[14px] text-foreground transition-colors active:bg-border/40"
              >
                <span className="truncate">↳ {node?.title ?? "가지"}</span>
                {done && (
                  <span className="shrink-0 text-muted-foreground" aria-label="완료">
                    ✓
                  </span>
                )}
              </button>

              {b.summary && (
                <button
                  type="button"
                  onClick={() =>
                    setOpenSummaryId((prev) =>
                      prev === b.branchId ? null : b.branchId
                    )
                  }
                  className={`h-9 shrink-0 rounded-full border px-2.5 text-[13px] transition-colors active:bg-border/40 ${
                    openSummaryId === b.branchId
                      ? "border-foreground/40 bg-card text-foreground"
                      : "border-border bg-transparent text-muted-foreground"
                  }`}
                >
                  요약
                </button>
              )}
            </span>
          );
        })}
      </div>

      {openSummary && (
        <div className="whitespace-pre-wrap break-words rounded-2xl border border-border bg-card/60 px-3.5 py-3 text-[15px] leading-[1.7] text-muted-foreground">
          {openSummary}
        </div>
      )}
    </div>
  );
}
