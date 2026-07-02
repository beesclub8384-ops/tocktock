"use client";

import Link from "next/link";

/** 섹터 페이지 상단 한국/미국 전환 탭 */
export function SectorTabs({ active }: { active: "kr" | "us" }) {
  const tabs = [
    { key: "kr", label: "한국", href: "/sectors" },
    { key: "us", label: "미국", href: "/sectors-us" },
  ] as const;

  return (
    <div className="mb-6 inline-flex gap-1 rounded-lg border border-border bg-card p-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            active === t.key
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
