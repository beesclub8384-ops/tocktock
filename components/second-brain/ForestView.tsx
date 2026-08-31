"use client";

import { useCallback, useEffect, useState } from "react";
import { authHeaders, ROOT_TITLE, SHELL_HEIGHT } from "./types";
import type { SBTree } from "./types";

/** 진행 중은 파란 점, 완료는 회색 체크 — 완료는 지나간 것이라 뒤로 물러난다 */
function StatusDot({ status }: { status: "active" | "done" }) {
  if (status === "done") {
    return (
      <span
        className="w-3 shrink-0 text-center text-[13px] text-muted-foreground"
        aria-label="완료"
      >
        ✓
      </span>
    );
  }
  return (
    <span className="flex w-3 shrink-0 justify-center" aria-label="진행 중">
      <span className="size-2 rounded-full bg-blue-500" />
    </span>
  );
}

/** 깊이는 왼쪽 안내선 + 단계당 16px 들여쓰기로 나타낸다 */
function renderRows(
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
    <div key={node.id} className="flex">
      <div style={{ width: depth * 16 }} className="shrink-0" />
      <button
        type="button"
        onClick={() => onOpen(node.id)}
        className={`flex min-h-[52px] flex-1 items-center gap-2.5 rounded-r-xl py-2 pr-3 text-left transition-colors active:bg-card ${
          depth > 0 ? "border-l border-border pl-3.5" : "pl-1"
        }`}
      >
        <StatusDot status={node.status} />
        <span className="min-w-0 flex-1 truncate text-[16px] leading-[1.6]">
          {node.title}
        </span>
      </button>
    </div>,
  ];

  for (const childId of node.children) {
    rows.push(...renderRows(tree, childId, depth + 1, visited, onOpen));
  }
  return rows;
}

export function ForestView({
  onOpen,
  onOpenNotes,
  onToast,
}: {
  onOpen: (id: string, shouldFocus?: boolean) => void;
  onOpenNotes: () => void;
  onToast: (message: string) => void;
}) {
  const [roots, setRoots] = useState<string[]>([]);
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
      onToast("새 주제");
      onOpen(data.convId, true);
    } catch {
      setError("네트워크 오류로 새 주제를 만들지 못했습니다.");
    } finally {
      setCreating(false);
    }
  }, [creating, onOpen, onToast]);

  // 나무끼리 노드가 겹치지 않도록 방문 집합을 숲 전체에서 공유한다
  const visited = new Set<string>();
  const forest = tree
    ? roots
        .map((rootId) => ({
          rootId,
          rows: renderRows(tree, rootId, 0, visited, onOpen),
        }))
        .filter((t) => t.rows.length > 0)
    : [];

  return (
    <div
      className="flex flex-col bg-background"
      style={{ minHeight: SHELL_HEIGHT }}
    >
      <header className="sticky top-0 z-10 shrink-0 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-2 px-4">
          <h1 className="min-w-0 flex-1 truncate text-[17px] font-bold">
            {ROOT_TITLE}
          </h1>
          <button
            type="button"
            onClick={onOpenNotes}
            className="h-11 shrink-0 rounded-xl border border-border bg-card px-3.5 text-[15px] text-foreground transition-colors active:bg-border/40"
          >
            노트
          </button>
          <button
            type="button"
            onClick={() => void handleNewRoot()}
            disabled={creating}
            className="h-11 shrink-0 rounded-xl bg-foreground px-3.5 text-[15px] font-medium text-background transition-colors active:opacity-80 disabled:opacity-40"
          >
            {creating ? "만드는 중…" : "+ 새 주제"}
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-3">
        {error && (
          <p className="py-6 text-center text-[15px] text-red-500">{error}</p>
        )}

        {!tree && !error && (
          <p className="py-20 text-center text-[16px] text-muted-foreground">
            불러오는 중…
          </p>
        )}

        {tree && forest.length === 0 && (
          <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-5 px-4">
            <p className="text-center text-[16px] leading-[1.6] text-muted-foreground">
              첫 주제를 시작하세요
            </p>
            <button
              type="button"
              onClick={() => void handleNewRoot()}
              disabled={creating}
              className="h-[52px] w-full max-w-xs rounded-2xl bg-foreground text-[16px] font-medium text-background transition-colors active:opacity-80 disabled:opacity-40"
            >
              {creating ? "만드는 중…" : "+ 새 주제"}
            </button>
          </div>
        )}

        {forest.length > 0 && (
          <div>
            {forest.map((t, idx) => (
              <div
                key={t.rootId}
                className={idx === 0 ? "" : "mt-6 border-t border-border pt-6"}
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
