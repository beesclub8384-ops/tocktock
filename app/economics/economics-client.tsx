"use client";

import Link from "next/link";
import { useState } from "react";
import type { PostMeta } from "@/lib/posts";

interface ChapterGroup {
  chapter: number;
  chapterTitle: string;
  posts: PostMeta[];
}

function groupByChapter(posts: PostMeta[]): ChapterGroup[] {
  const chapterMap = new Map<number, ChapterGroup>();

  for (const post of posts) {
    if (!post.chapter || !post.chapterTitle) continue;
    if (!chapterMap.has(post.chapter)) {
      chapterMap.set(post.chapter, {
        chapter: post.chapter,
        chapterTitle: post.chapterTitle,
        posts: [],
      });
    }
    chapterMap.get(post.chapter)!.posts.push(post);
  }

  return Array.from(chapterMap.values()).sort(
    (a, b) => a.chapter - b.chapter
  );
}

export default function EconomicsClient({ posts }: { posts: PostMeta[] }) {
  const chapters = groupByChapter(posts);
  const latestChapter =
    chapters.length > 0 ? chapters[chapters.length - 1].chapter : -1;

  const [openChapters, setOpenChapters] = useState<Set<number>>(
    () => new Set([latestChapter])
  );

  const toggleChapter = (ch: number) => {
    setOpenChapters((prev) => {
      const next = new Set(prev);
      if (next.has(ch)) {
        next.delete(ch);
      } else {
        next.add(ch);
      }
      return next;
    });
  };

  return (
    <div className="max-w-3xl px-8 py-20">
      <header className="mb-16">
        <h1 className="text-4xl font-bold tracking-tight">경제공부</h1>
        <p className="mt-3 text-muted-foreground">
          내가 이해한 방식으로 풀어쓴 투자 이야기
        </p>
      </header>

      {chapters.length === 0 ? (
        <p className="text-muted-foreground">아직 작성된 글이 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {chapters.map((group) => {
            const isOpen = openChapters.has(group.chapter);
            return (
              <div
                key={group.chapter}
                className="border border-border rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => toggleChapter(group.chapter)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/50 transition-colors"
                >
                  <span className="font-semibold text-lg">
                    {group.chapter}장. {group.chapterTitle}
                  </span>
                  <span className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>{group.posts.length}개</span>
                    <span className="text-xs">{isOpen ? "▼" : "▶"}</span>
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-border">
                    {group.posts.map((post) => (
                      <Link
                        key={post.slug}
                        href={`/economics/${post.slug}`}
                        className="block px-5 py-4 hover:bg-muted/30 transition-colors border-b border-border last:border-b-0"
                      >
                        <h3 className="font-medium">{post.title}</h3>
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
                          {post.summary}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
