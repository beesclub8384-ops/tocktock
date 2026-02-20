import Link from "next/link";
import { getSortedPostsData } from "@/lib/posts";

export const metadata = {
  title: "톡톡 칼럼 - TockTock",
  description: "TockTock 칼럼 - 투자 인사이트와 시장 이야기",
};

export default function ColumnPage() {
  const posts = getSortedPostsData("column");

  return (
    <div className="max-w-3xl px-8 py-20">
      <header className="mb-16">
        <h1 className="text-4xl font-bold tracking-tight">톡톡 칼럼</h1>
      </header>

      {posts.length === 0 ? (
        <p className="text-muted-foreground">아직 작성된 글이 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-10">
          {posts.map((post) => (
            <article key={post.slug}>
              <Link href={`/column/${post.slug}`} className="group block">
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
