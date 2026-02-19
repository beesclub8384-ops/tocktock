import Link from "next/link";
import { getSortedPostsData } from "@/lib/posts";
import { GrowthScorePanel } from "@/components/growth-score-panel";

export const metadata = {
  title: "종목분석 - TockTock",
  description: "TockTock 종목분석 - 개별 종목 심층 분석",
};

export default function StockAnalysisPage() {
  const posts = getSortedPostsData("stock-analysis");

  return (
    <div className="mx-auto max-w-5xl px-6 py-20">
      <header className="mb-16">
        <h1 className="text-4xl font-bold tracking-tight">종목분석</h1>
      </header>

      <div className="flex flex-col gap-10 lg:flex-row">
        {/* 왼쪽: 글 목록 */}
        <div className="min-w-0 flex-1">
          {posts.length === 0 ? (
            <p className="text-muted-foreground">아직 작성된 글이 없습니다.</p>
          ) : (
            <div className="flex flex-col gap-10">
              {posts.map((post) => (
                <article key={post.slug}>
                  <Link href={`/stock-analysis/${post.slug}`} className="group block">
                    <time className="text-sm text-muted-foreground">
                      {post.date}
                    </time>
                    <h2 className="mt-1 text-xl font-semibold group-hover:text-muted-foreground transition-colors">
                      {post.title}
                    </h2>
                    <p className="mt-2 text-muted-foreground">{post.summary}</p>
                  </Link>
                </article>
              ))}
            </div>
          )}
        </div>

        {/* 오른쪽: 성장 점수 사이드바 */}
        <aside className="w-full shrink-0 lg:w-80 lg:sticky lg:top-24 lg:self-start">
          <GrowthScorePanel />
        </aside>
      </div>
    </div>
  );
}
