import Link from "next/link";
import { getPostData, getAllPostSlugs } from "@/lib/posts";

export async function generateStaticParams() {
  const slugs = getAllPostSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostData(slug);
  return {
    title: `${post.title} - TockTock 블로그`,
    description: post.summary,
  };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostData(slug);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <article className="mx-auto max-w-2xl px-6 py-20">
        <nav className="mb-10">
          <Link
            href="/blog"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            &larr; 블로그 목록
          </Link>
        </nav>

        <header className="mb-10">
          <time className="text-sm text-zinc-500 dark:text-zinc-500">
            {post.date}
          </time>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {post.title}
          </h1>
        </header>

        <div
          className="prose-custom"
          dangerouslySetInnerHTML={{ __html: post.contentHtml }}
        />
      </article>
    </div>
  );
}
