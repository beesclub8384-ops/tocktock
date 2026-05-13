import Link from "next/link";
import { NewsPageClient } from "@/components/news-page-client";

export const revalidate = 3600;

export default function Home() {
  return (
    <div className="max-w-3xl px-4 sm:px-8 py-20">
      {/* 뉴스 섹션 */}
      <header className="mb-10">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-bold tracking-tight">뉴스</h1>
          <Link
            href="/news"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            전체보기 &rarr;
          </Link>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          글로벌 속보 · 연합뉴스
        </p>
      </header>

      <NewsPageClient limit={5} />
    </div>
  );
}
