import Link from "next/link";
import { getPostData, getAllPostSlugs } from "@/lib/posts";

export async function generateStaticParams() {
  const slugs = getAllPostSlugs("macro");
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostData("macro", slug);
  return {
    title: `${post.title} - TockTock 거시전망`,
    description: post.summary,
  };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostData("macro", slug);

  return (
    <article className="max-w-3xl px-8 py-20">
      <nav className="mb-10">
        <Link
          href="/blog"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; 거시전망 목록
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
