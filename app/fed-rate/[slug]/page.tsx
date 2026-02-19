import Link from "next/link";
import { getPostData, getAllPostSlugs } from "@/lib/posts";

export async function generateStaticParams() {
  const slugs = getAllPostSlugs("fed-rate");
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostData("fed-rate", slug);
  return {
    title: `${post.title} - TockTock 연준과 금리`,
    description: post.summary,
  };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostData("fed-rate", slug);

  return (
    <article className="mx-auto max-w-2xl px-6 py-20">
      <nav className="mb-10">
        <Link
          href="/fed-rate"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; 연준과 금리 목록
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
