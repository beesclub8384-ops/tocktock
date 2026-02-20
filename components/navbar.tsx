import Link from "next/link";
import { Button } from "@/components/ui/button";
import { InvestmentQuoteBanner } from "@/components/investment-quote-banner";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <InvestmentQuoteBanner />
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xl font-bold tracking-tight">
            TockTock
          </Link>
        </div>

        <nav className="flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/blog">거시전망</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/stock-analysis">종목분석</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/indices">지수</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/fed-rate">연준과 금리</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/economics">경제공부</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/stock/TSLA">차트</Link>
          </Button>
        </nav>

      </div>
    </header>
  );
}
