import Link from "next/link";
import { getSortedPostsData } from "@/lib/posts";
import { NewsPageClient } from "@/components/news-page-client";

export const revalidate = 3600;

export default async function Home() {
  const posts = getSortedPostsData("macro");

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

      <div className="mb-20">
        <NewsPageClient limit={5} />
      </div>

      {/* 거시전망 섹션 */}
      <header className="mb-16">
        <h1 className="text-4xl font-bold tracking-tight">거시전망</h1>
      </header>

      {posts.length === 0 ? (
        <p className="text-muted-foreground">아직 작성된 글이 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-10">
          {posts.map((post) => (
            <article key={post.slug}>
              <Link href={`/blog/${post.slug}`} className="group block">
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
