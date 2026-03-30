"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { InvestmentQuoteBanner } from "@/components/investment-quote-banner";

const navLinks = [
  { href: "/news", label: "뉴스" },
  { href: "/blog", label: "거시전망" },
  { href: "/stock-analysis", label: "종목분석" },
  { href: "/indices", label: "지수" },
  { href: "/market-events", label: "급등락분석" },
  { href: "/fed-rate", label: "연준과 금리" },
  { href: "/column", label: "톡톡 칼럼" },
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
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <InvestmentQuoteBanner />
      <div className="flex h-14 items-center px-6 gap-4">
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

        {/* 모바일: 햄버거 버튼 */}
        <button
          className="md:hidden ml-auto p-2 text-2xl"
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? "메뉴 닫기" : "메뉴 열기"}
        >
          {isOpen ? "\u2715" : "\u2630"}
        </button>
      </div>

      {/* 모바일: 펼쳐지는 메뉴 */}
      {isOpen && (
        <nav className="md:hidden flex flex-col border-t border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="px-6 py-3 text-sm hover:bg-accent transition-colors"
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
