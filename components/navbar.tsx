import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
        <Link href="/" className="text-xl font-bold tracking-tight">
          TockTock
        </Link>

        <nav className="flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">홈</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/blog">거시전망</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/stock/TSLA">차트</Link>
          </Button>
        </nav>

        <Button size="sm" asChild>
          <Link href="/blog">시작하기</Link>
        </Button>
      </div>
    </header>
  );
}
