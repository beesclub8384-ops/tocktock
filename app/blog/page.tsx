import Link from "next/link";
import { getSortedPostsData } from "@/lib/posts";

export const metadata = {
  title: "블로그 - TockTock",
  description: "TockTock 블로그 - 투자 인사이트와 플랫폼 소식",
};

export default function BlogPage() {
  const posts = getSortedPostsData();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-2xl px-6 py-20">
        <header className="mb-16">
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            &larr; 홈으로
          </Link>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            블로그
          </h1>
        </header>

        {posts.length === 0 ? (
          <p className="text-zinc-500 dark:text-zinc-400">
            아직 작성된 글이 없습니다.
          </p>
        ) : (
          <div className="flex flex-col gap-10">
            {posts.map((post) => (
              <article key={post.slug}>
                <Link href={`/blog/${post.slug}`} className="group block">
                  <time className="text-sm text-zinc-500 dark:text-zinc-500">
                    {post.date}
                  </time>
                  <h2 className="mt-1 text-xl font-semibold text-zinc-900 group-hover:text-zinc-600 dark:text-zinc-100 dark:group-hover:text-zinc-300">
                    {post.title}
                  </h2>
                  <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                    {post.summary}
                  </p>
                </Link>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
