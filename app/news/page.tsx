import { NewsPageClient } from "@/components/news-page-client";

export const metadata = {
  title: "뉴스 - TockTock",
  description: "글로벌 속보와 한국 투자 뉴스를 한눈에",
};

export default function NewsPage() {
  return (
    <div className="max-w-3xl px-8 py-20">
      <header className="mb-10">
        <h1 className="text-4xl font-bold tracking-tight">뉴스</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          글로벌 속보 · 연합뉴스
        </p>
      </header>

      <NewsPageClient />
    </div>
  );
}
