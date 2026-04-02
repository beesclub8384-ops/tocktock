import { NextResponse } from "next/server";
import Parser from "rss-parser";

const parser = new Parser({
  timeout: 10000,
  headers: { "User-Agent": "TockTock-NewsCollector/1.0" },
});

interface NewsItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  source: string;
  feedUrl: string;
}

const FEEDS = [
  { name: "연합뉴스", url: "https://www.yna.co.kr/rss/economy.xml", category: "economy" },
  { name: "연합뉴스", url: "https://www.yna.co.kr/rss/politics.xml", category: "politics" },
  { name: "연합뉴스", url: "https://www.yna.co.kr/rss/international.xml", category: "international" },
];

function stripHtml(raw: string): string {
  return raw.replace(/<[^>]*>/g, "").trim();
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "...";
}

async function fetchFeed(config: typeof FEEDS[number]): Promise<NewsItem[]> {
  try {
    const feed = await parser.parseURL(config.url);
    const items: NewsItem[] = [];
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;

    for (const entry of feed.items.slice(0, 30)) {
      const dateStr = entry.isoDate ?? entry.pubDate ?? "";
      if (dateStr && new Date(dateStr).getTime() < threeDaysAgo) continue;

      items.push({
        title: entry.title ?? "",
        description: truncate(stripHtml(entry.contentSnippet ?? entry.content ?? entry.summary ?? ""), 150),
        link: entry.link ?? "",
        pubDate: dateStr,
        source: config.name,
        feedUrl: config.url,
      });
    }
    return items;
  } catch (err) {
    console.error(`[news] Failed to fetch ${config.name} (${config.url}):`, err);
    return [];
  }
}

export async function GET() {
  const results = await Promise.all(FEEDS.map(fetchFeed));
  const allItems = results.flat();

  // 중복 제거
  const seen = new Set<string>();
  const unique = allItems.filter((item) => {
    const key = item.title.slice(0, 30);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

  return NextResponse.json(
    { news: unique.slice(0, 50) },
    { headers: { "Cache-Control": "public, max-age=1800" } }
  );
}
