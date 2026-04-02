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
  if (source === "연합뉴스") return { label: "연합뉴스", color: "bg-zinc-700 dark:bg-zinc-600", accent: "border-l-zinc-400" };
  if (source.includes("Reuters")) return { label: "Reuters", color: "bg-blue-600", accent: "border-l-blue-500" };
  if (source.includes("Bloomberg")) return { label: "Bloomberg", color: "bg-emerald-600", accent: "border-l-emerald-500" };
  if (source.includes("BBC")) return { label: source, color: "bg-red-600", accent: "border-l-red-500" };
  if (source.includes("CNBC")) return { label: source, color: "bg-orange-600", accent: "border-l-orange-500" };
  if (source.includes("WSJ")) return { label: "WSJ", color: "bg-blue-500", accent: "border-l-blue-400" };
  if (source.includes("MarketWatch")) return { label: "MarketWatch", color: "bg-yellow-600", accent: "border-l-yellow-500" };
  if (source.includes("Yahoo")) return { label: "Yahoo Finance", color: "bg-purple-600", accent: "border-l-purple-500" };
  if (source.includes("Investing")) return { label: "Investing.com", color: "bg-teal-600", accent: "border-l-teal-500" };
  if (source.includes("AP")) return { label: "AP News", color: "bg-red-700", accent: "border-l-red-600" };
  return { label: source, color: "bg-zinc-600", accent: "border-l-zinc-400" };
}

export function NewsPageClient() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNews = useCallback(async () => {
    try {
      const res = await fetch("/api/news/all");
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

  return (
    <>
      {/* 로딩 스켈레톤 */}
      {loading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border/50 bg-card p-4 animate-pulse"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="h-4 w-16 rounded bg-muted" />
                <div className="h-3 w-12 rounded bg-muted" />
              </div>
              <div className="h-4 w-full rounded bg-muted mb-2" />
              <div className="h-3 w-3/4 rounded bg-muted" />
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
          {news.map((item, i) => {
            const badge = getBadge(item.source);
            return (
              <a
                key={`${item.link}-${i}`}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className={`group block rounded-xl border border-border/50 border-l-[3px] ${badge.accent} bg-card p-4 transition-all duration-150 hover:bg-accent/40 hover:border-border hover:shadow-sm active:scale-[0.99]`}
              >
                {/* 상단: 배지 + 시간 + 외부링크 */}
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white ${badge.color}`}
                    >
                      {badge.label}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {item.pubDate ? timeAgo(item.pubDate) : ""}
                    </span>
                  </div>
                  <ExternalLink
                    size={13}
                    className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0"
                  />
                </div>

                {/* 제목 */}
                <h3 className="text-[15px] font-semibold leading-snug text-foreground group-hover:text-foreground/90 line-clamp-2">
                  {item.title}
                </h3>

                {/* 설명 */}
                {item.description && (
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground/80 line-clamp-2">
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
