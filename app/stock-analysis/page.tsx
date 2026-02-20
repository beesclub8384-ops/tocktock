import Link from "next/link";
import { getSortedPostsData } from "@/lib/posts";

export const metadata = {
  title: "종목분석 - TockTock",
  description: "TockTock 종목분석 - 개별 종목 심층 분석",
};

export default function StockAnalysisPage() {
  const posts = getSortedPostsData("stock-analysis");

  return (
    <div className="max-w-3xl px-8 py-20">
      <header className="mb-16">
        <h1 className="text-4xl font-bold tracking-tight">종목분석</h1>
      </header>

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
  );
}
