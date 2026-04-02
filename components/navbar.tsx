"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { InvestmentQuoteBanner } from "@/components/investment-quote-banner";

const navLinks = [
  { href: "/news", label: "뉴스" },
  { href: "/blog", label: "거시전망" },
  { href: "/indices", label: "지수" },
  { href: "/credit", label: "빚투" },
  { href: "/market-events", label: "급등락분석" },
  { href: "/economics", label: "경제공부" },
  { href: "/foreign-ownership", label: "외국인 지분율" },
  { href: "/global-indicators", label: "글로벌 지표" },
  { href: "/money-flow", label: "돈의 흐름" },
  { href: "/money-flow/treasury-auction", label: "미국채 경매" },
  { href: "/liquidity/us", label: "미국 유동성" },
  { href: "/liquidity/global", label: "글로벌 유동성" },
  { href: "/superinvestor", label: "슈퍼투자자" },
  { href: "/virtual-trading", label: "자동매매" },
  { href: "/ai-trading", label: "AI 자동매매" },
];

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.documentElement.setAttribute("data-menu-open", "");
    } else {
      document.documentElement.removeAttribute("data-menu-open");
    }
    return () => {
      document.documentElement.removeAttribute("data-menu-open");
    };
  }, [isOpen]);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <InvestmentQuoteBanner />
      <div className="flex items-center px-6 gap-4" style={{ height: 56 }}>
        <Link href="/" className="shrink-0">
          <img src="/logo.png" alt="TockTock" style={{ height: 40 }} />
        </Link>

        {/* PC: 가로 메뉴 */}
        <nav className="hidden md:flex items-center gap-1 flex-1 min-w-0">
          {navLinks.map(({ href, label }) => (
            <Button key={href} variant="ghost" size="sm" asChild>
              <Link href={href}>{label}</Link>
            </Button>
          ))}
        </nav>

        {/* 모바일: 햄버거 버튼 (고정 크기) */}
        <button
          className="md:hidden ml-auto flex-shrink-0 flex items-center justify-center"
          style={{ width: 44, height: 44 }}
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? "메뉴 닫기" : "메뉴 열기"}
        >
          {isOpen ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
            </svg>
          )}
        </button>
      </div>

      {/* 모바일: 전체 화면 메뉴 */}
      {isOpen && (
        <nav
          className="md:hidden fixed left-0 right-0 bottom-0 z-[60] bg-white dark:bg-zinc-950 flex flex-col overflow-y-auto"
          style={{ top: 88 }}
        >
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="px-6 py-4 text-sm border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
              onClick={() => setIsOpen(false)}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
