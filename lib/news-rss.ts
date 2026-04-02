import Parser from "rss-parser";

// ---------------------------------------------------------------------------
// RSS Parser 설정
// ---------------------------------------------------------------------------
const parser = new Parser({
  timeout: 10000,
  headers: { "User-Agent": "TockTock-NewsCollector/1.0" },
});

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------
export interface NewsItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  source: string;
}

// ---------------------------------------------------------------------------
// 피드 설정
// ---------------------------------------------------------------------------
interface FeedConfig {
  name: string;
  url: string;
  lang: "ko" | "en";
}

const FEEDS: FeedConfig[] = [
  // 한국 피드
  { name: "연합뉴스", url: "https://www.yna.co.kr/rss/economy.xml", lang: "ko" },
  { name: "연합뉴스", url: "https://www.yna.co.kr/rss/politics.xml", lang: "ko" },
  { name: "연합뉴스", url: "https://www.yna.co.kr/rss/international.xml", lang: "ko" },
  // 기존 영문 피드
  { name: "AP News", url: "https://news.google.com/rss/search?q=US+stock+market+economy&hl=en-US&gl=US&ceid=US:en", lang: "en" },
  { name: "AP News", url: "https://news.google.com/rss/search?q=US+politics+congress+president&hl=en-US&gl=US&ceid=US:en", lang: "en" },
  // 추가 영문 피드
  { name: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml", lang: "en" },
  { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", lang: "en" },
  { name: "CNBC", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", lang: "en" },
  { name: "CNBC Finance", url: "https://www.cnbc.com/id/10000664/device/rss/rss.html", lang: "en" },
  { name: "MarketWatch", url: "https://feeds.marketwatch.com/marketwatch/topstories", lang: "en" },
  { name: "Yahoo Finance", url: "https://finance.yahoo.com/rss/topfinstories", lang: "en" },
  { name: "Reuters", url: "https://news.google.com/rss/search?q=when:24h+allinurl:reuters.com&ceid=US:en&hl=en-US&gl=US", lang: "en" },
  { name: "Bloomberg", url: "https://news.google.com/rss/search?q=when:24h+allinurl:bloomberg.com&ceid=US:en&hl=en-US&gl=US", lang: "en" },
  { name: "WSJ", url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml", lang: "en" },
  { name: "Investing.com", url: "https://www.investing.com/rss/news_25.rss", lang: "en" },
];

// ---------------------------------------------------------------------------
// HTML 제거 & 텍스트 잘라내기
// ---------------------------------------------------------------------------
function stripHtml(raw: string): string {
  return raw.replace(/<[^>]*>/g, "").trim();
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "...";
}

// ---------------------------------------------------------------------------
// Google Translate (무료 API)
// ---------------------------------------------------------------------------
async function translateToKo(text: string): Promise<string> {
  if (!text) return text;
  try {
    const url =
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) return text;
    const data = await res.json();
    const translated = (data[0] as [string, string][])
      .map((seg) => seg[0])
      .join("");
    return translated || text;
  } catch {
    return text;
  }
}

// ---------------------------------------------------------------------------
// 피드별 수집
// ---------------------------------------------------------------------------
async function fetchFeed(config: FeedConfig): Promise<NewsItem[]> {
  try {
    const feed = await parser.parseURL(config.url);
    const items: NewsItem[] = [];
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const limit = config.lang === "en" ? 8 : 30;

    const entries = feed.items.slice(0, limit);

    for (const entry of entries) {
      const dateStr = entry.isoDate ?? entry.pubDate ?? "";
      if (dateStr && new Date(dateStr).getTime() < threeDaysAgo) continue;

      let title = entry.title ?? "";
      let description = stripHtml(
        entry.contentSnippet ?? entry.content ?? entry.summary ?? ""
      );
      description = truncate(description, 150);

      // 영문 기사 번역
      if (config.lang === "en") {
        const [tTitle, tDesc] = await Promise.all([
          translateToKo(title),
          translateToKo(description),
        ]);
        title = tTitle;
        description = tDesc;
      }

      // Google News RSS에서 실제 출처 추출
      let source = config.name;
      if (config.url.includes("news.google.com") && entry.title) {
        const sourceMatch = entry.title.match(/ - ([^-]+)$/);
        if (sourceMatch) {
          source = sourceMatch[1].trim();
        }
      }

      items.push({
        title: title.replace(/ - [^-]+$/, "").trim(),
        description,
        link: entry.link ?? "",
        pubDate: dateStr,
        source,
      });
    }
    return items;
  } catch (err) {
    console.error(`[news-rss] Failed to fetch ${config.name} (${config.url}): ${err}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// 메인 함수
// ---------------------------------------------------------------------------
export async function getAllNews(): Promise<NewsItem[]> {
  const results = await Promise.allSettled(FEEDS.map(fetchFeed));
  const allItems = results
    .filter((r): r is PromiseFulfilledResult<NewsItem[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);

  // 중복 제거 (제목 기준)
  const seen = new Set<string>();
  const unique = allItems.filter((item) => {
    const key = item.title.slice(0, 30);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 시간순 정렬 (최신 먼저)
  unique.sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
  );

  // 최대 50개
  return unique.slice(0, 50);
}
