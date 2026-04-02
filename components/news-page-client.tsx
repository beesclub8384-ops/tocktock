"use client";

import { useEffect, useState, useCallback } from "react";
import { ExternalLink } from "lucide-react";

interface NewsItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  source: string;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

function getBadge(source: string) {
  // 연합뉴스, CNBC → blue
  if (source === "연합뉴스") return { label: "연합뉴스", bg: "bg-blue-600", border: "border-l-blue-500" };
  if (source.includes("CNBC")) return { label: source, bg: "bg-blue-600", border: "border-l-blue-500" };
  // Reuters, Investing.com → orange
  if (source.includes("Reuters")) return { label: "Reuters", bg: "bg-orange-600", border: "border-l-orange-500" };
  if (source.includes("Investing")) return { label: "Investing.com", bg: "bg-orange-600", border: "border-l-orange-500" };
  // Bloomberg, Yahoo Finance → violet
  if (source.includes("Bloomberg")) return { label: "Bloomberg", bg: "bg-violet-600", border: "border-l-violet-500" };
  if (source.includes("Yahoo")) return { label: "Yahoo Finance", bg: "bg-violet-600", border: "border-l-violet-500" };
  // BBC → red
  if (source.includes("BBC")) return { label: source, bg: "bg-red-600", border: "border-l-red-500" };
  // MarketWatch → green
  if (source.includes("MarketWatch")) return { label: "MarketWatch", bg: "bg-green-600", border: "border-l-green-500" };
  // WSJ → zinc
  if (source.includes("WSJ")) return { label: "WSJ", bg: "bg-zinc-500", border: "border-l-zinc-400" };
  // AP News → red
  if (source.includes("AP")) return { label: "AP News", bg: "bg-red-700", border: "border-l-red-600" };
  // 나머지 → gray
  return { label: source, bg: "bg-gray-600", border: "border-l-gray-400" };
}

export function NewsPageClient({ limit }: { limit?: number } = {}) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNews = useCallback(async () => {
    try {
      const res = await fetch("/api/news");
      if (!res.ok) return;
      const json = await res.json();
      setNews(json.news || []);
    } catch {
      // 기존 데이터 유지
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  const skeletonCount = limit ?? 6;

  return (
    <>
      {/* 로딩 스켈레톤 */}
      {loading && (
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border-l-4 border-l-gray-300 dark:border-l-gray-700 border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 animate-pulse"
            >
              <div className="flex items-center gap-2 mb-2.5">
                <div className="h-4 w-14 rounded-full bg-zinc-200 dark:bg-zinc-700" />
                <div className="h-3 w-10 rounded bg-zinc-200 dark:bg-zinc-700" />
              </div>
              <div className="h-4 w-full rounded bg-zinc-200 dark:bg-zinc-700 mb-1.5" />
              <div className="h-3 w-2/3 rounded bg-zinc-200 dark:bg-zinc-700" />
            </div>
          ))}
        </div>
      )}

      {!loading && news.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-muted-foreground text-sm">
            뉴스 기사가 없습니다.
          </p>
        </div>
      )}

      {!loading && news.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {(limit ? news.slice(0, limit) : news).map((item, i) => {
            const badge = getBadge(item.source);
            return (
              <a
                key={`${item.link}-${i}`}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className={`group block rounded-xl border-l-4 ${badge.border} border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 transition-all duration-150 hover:shadow-md dark:hover:bg-zinc-800/80 hover:bg-zinc-50 active:scale-[0.99] sm:px-5 sm:py-4`}
              >
                {/* 상단: 배지 + 시간 + 외부링크 */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white ${badge.bg}`}
                    >
                      {badge.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {item.pubDate ? timeAgo(item.pubDate) : ""}
                    </span>
                  </div>
                  <ExternalLink
                    size={13}
                    className="text-muted-foreground/30 group-hover:text-muted-foreground/70 transition-colors shrink-0"
                  />
                </div>

                {/* 제목 */}
                <h3 className="text-sm font-semibold leading-snug text-foreground line-clamp-2 sm:text-[15px]">
                  {item.title}
                </h3>

                {/* 설명 */}
                {item.description && (
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground/70 line-clamp-2 hidden sm:block">
                    {item.description}
                  </p>
                )}
              </a>
            );
          })}
        </div>
      )}
    </>
  );
}
