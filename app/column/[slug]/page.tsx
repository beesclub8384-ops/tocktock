import Link from "next/link";
import { getPostData, getAllPostSlugs } from "@/lib/posts";

export async function generateStaticParams() {
  const slugs = getAllPostSlugs("column");
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostData("column", slug);
  return {
    title: `${post.title} - TockTock 칼럼`,
    description: post.summary,
  };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostData("column", slug);

  return (
    <article className="max-w-3xl px-8 py-20">
      <nav className="mb-10">
        <Link
          href="/column"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; 톡톡 칼럼 목록
        </Link>
      </nav>

      <header className="mb-10">
        <time className="text-sm text-muted-foreground">{post.date}</time>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">
          {post.title}
        </h1>
      </header>

      <div
        className="prose-custom"
        dangerouslySetInnerHTML={{ __html: post.contentHtml }}
      />
    </article>
  );
}
