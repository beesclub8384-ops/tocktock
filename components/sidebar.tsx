"use client";

import { useState, useEffect } from "react";
import { BarChart3, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { GrowthScorePanel } from "@/components/growth-score-panel";
import { DollarIndexWidget } from "@/components/dollar-index-widget";

export function Sidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // 페이지 이동 시 모바일 사이드바 닫기
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // 모바일 사이드바 열릴 때 배경 스크롤 방지
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* 모바일 토글 버튼 */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 left-5 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-background shadow-lg transition-colors hover:bg-accent lg:hidden"
        aria-label="성장 점수 패널 열기"
      >
        <BarChart3 size={20} />
      </button>

      {/* 모바일 오버레이 */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* 사이드바 */}
      <aside
        className={`
          fixed top-16 left-0 z-50 h-[calc(100vh-4rem)] w-60 shrink-0 overflow-y-auto border-r border-border/40 bg-background p-3 transition-transform duration-200
          ${open ? "translate-x-0" : "-translate-x-full"}
          lg:sticky lg:translate-x-0 lg:transition-none
        `}
      >
        {/* 모바일 닫기 버튼 */}
        <button
          onClick={() => setOpen(false)}
          className="mb-2 ml-auto flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
          aria-label="닫기"
        >
          <X size={18} />
        </button>

        <GrowthScorePanel />
        <div className="mt-3">
          <DollarIndexWidget />
        </div>
      </aside>
    </>
  );
}
