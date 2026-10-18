/**
 * 관측소 4 상세 페이지 공용 조각 (서버 컴포넌트).
 *
 * ⚠ "use client" 를 넣지 않는다 — 상세 페이지는 서버 컴포넌트다.
 */
import { headers } from "next/headers";
import type { ObservatoryStatus } from "@/lib/observatory-constants";
import { statusLabel } from "./format";

const BADGE: Record<ObservatoryStatus | "pending", string> = {
  normal:
    "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  caution:
    "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  warning:
    "bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800",
  pending:
    "bg-zinc-50 text-zinc-600 border-zinc-300 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-700",
};
const DOT: Record<ObservatoryStatus | "pending", string> = {
  normal: "bg-emerald-500",
  caution: "bg-amber-500",
  warning: "bg-rose-500",
  pending: "bg-zinc-400",
};

export function StatusBadge({ status }: { status: ObservatoryStatus | null }) {
  const k = status ?? "pending";
  return (
    <div
      className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${BADGE[k]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[k]}`} />
      {statusLabel(status)}
    </div>
  );
}

/** 한계 문구 상자 — 숫자보다 먼저 읽히게 상단에 둔다 */
export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6 space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      {children}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-3">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{children}</div>
    </section>
  );
}

export function Disclaimer() {
  return (
    <p className="text-xs text-zinc-500">
      이 지표는 시장 상황을 지켜보기 위한 참고 자료입니다. 투자 권유가 아니며, 모든 투자 판단은 본인의
      책임입니다.
    </p>
  );
}

/** 서버 컴포넌트에서 자기 API 를 부른다 (다른 상세 페이지와 같은 방식) */
export async function fetchOwnApi<T>(path: string): Promise<T | null> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  try {
    const res = await fetch(`${proto}://${host}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
