"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReportStatus } from "@/lib/reports/types";

const META: Record<ReportStatus, { label: string; className: string; next: ReportStatus }> = {
  new: {
    label: "새로 들어옴",
    className:
      "bg-sky-50 text-sky-700 border-sky-300 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",
    next: "studying",
  },
  studying: {
    label: "공부 중",
    className:
      "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
    next: "done",
  },
  done: {
    label: "학습 완료",
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
    next: "new",
  },
};

/** 상태 배지 — 누르면 다음 상태로 넘어간다 (새로 들어옴 → 공부 중 → 학습 완료 → 새로 들어옴) */
export function StatusButton({ id, status }: { id: string; status: ReportStatus }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const meta = META[status];

  async function advance() {
    setPending(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(id)}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: meta.next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={advance}
      disabled={pending}
      title={`누르면 "${META[meta.next].label}"(으)로 바뀝니다`}
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold whitespace-nowrap transition-opacity disabled:opacity-50 ${meta.className}`}
    >
      {failed ? "변경 실패 — 다시 누르기" : meta.label}
    </button>
  );
}
