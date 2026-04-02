"use client";

import { useEffect, useState, useCallback } from "react";

interface NewsItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  source: string;
  feedUrl?: string;
}

type Tab = "전체" | "국내" | "국외";
const TABS: Tab[] = ["전체", "국내", "국외"];

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

function getBadge(item: NewsItem) {
  const src = item.source;
  const feedUrl = item.feedUrl ?? "";

  // 국내: 연합뉴스 카테고리 배지
  if (src === "연합뉴스") {
    if (feedUrl.includes("economy"))
      return { label: "경제", color: "bg-blue-600" };
    if (feedUrl.includes("politics"))
      return { label: "정치", color: "bg-red-600" };
    if (feedUrl.includes("international"))
      return { label: "국제", color: "bg-emerald-600" };
    return { label: "연합뉴스", color: "bg-zinc-600" };
  }

  // 국외: source명 배지
  if (src.includes("Reuters")) return { label: "Reuters", color: "bg-blue-600" };
  if (src.includes("Bloomberg")) return { label: "Bloomberg", color: "bg-emerald-600" };
  if (src.includes("BBC")) return { label: src, color: "bg-red-600" };
  if (src.includes("CNBC")) return { label: src, color: "bg-orange-600" };
  if (src.includes("WSJ")) return { label: "WSJ", color: "bg-blue-500" };
  if (src.includes("MarketWatch")) return { label: "MarketWatch", color: "bg-yellow-600" };
  if (src.includes("Yahoo")) return { label: "Yahoo Finance", color: "bg-purple-600" };
  if (src.includes("Investing")) return { label: "Investing.com", color: "bg-teal-600" };
  return { label: src, color: "bg-zinc-600" };
}

function NewsCards({ news }: { news: NewsItem[] }) {
  if (news.length === 0) {
    return (
      <p className="py-12 text-center text-muted-foreground text-sm">
        뉴스 기사가 없습니다.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {news.map((item, i) => {
        const badge = getBadge(item);
        return (
          <a
            key={`${item.link}-${i}`}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg border border-border p-4 transition-colors hover:bg-muted/30"
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-white ${badge.color}`}
              >
                {badge.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {item.pubDate ? timeAgo(item.pubDate) : ""}
              </span>
            </div>
            <h3 className="text-sm font-semibold leading-snug text-foreground">
              {item.title}
            </h3>
            {item.description && (
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                {item.description}
              </p>
            )}
          </a>
        );
      })}
    </div>
  );
}

export function NewsPageClient() {
  const [tab, setTab] = useState<Tab>("전체");
  const [allNews, setAllNews] = useState<NewsItem[]>([]);
  const [koreaNews, setKoreaNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNews = useCallback(async () => {
    try {
      // 국내(연합뉴스 with feedUrl) + 전체(글로벌 포함) 동시 호출
      const [koreaRes, allRes] = await Promise.allSettled([
        fetch("/api/news"),
        fetch("/api/news/all"),
      ]);

      if (koreaRes.status === "fulfilled" && koreaRes.value.ok) {
        const json = await koreaRes.value.json();
        setKoreaNews(json.news || []);
      }

      if (allRes.status === "fulfilled" && allRes.value.ok) {
        const json = await allRes.value.json();
        setAllNews(json.news || []);
      }
    } catch {
      // 기존 데이터 유지
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  const globalNews = allNews.filter((item) => item.source !== "연합뉴스");

  const displayNews =
    tab === "국내"
      ? koreaNews
      : tab === "국외"
        ? globalNews
        : allNews;

  return (
    <>
      {/* 탭 */}
      <div className="flex gap-1.5 mb-8">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* 로딩 */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          뉴스를 불러오는 중...
        </div>
      )}

      {!loading && <NewsCards news={displayNews} />}
    </>
  );
}
