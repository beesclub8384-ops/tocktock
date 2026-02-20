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
export type NewsCategory =
  | "주식"
  | "증시"
  | "경제"
  | "미국시장"
  | "미국정치"
  | "한국정치";

export interface NewsItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  source: string;
  category: NewsCategory;
}

// ---------------------------------------------------------------------------
// 피드 설정
// ---------------------------------------------------------------------------
interface FeedConfig {
  name: string;
  url: string;
  lang: "ko" | "en";
  defaultCategory?: NewsCategory;
}

const FEEDS: FeedConfig[] = [
  {
    name: "연합뉴스",
    url: "https://www.yna.co.kr/rss/economy.xml",
    lang: "ko",
  },
  {
    name: "연합뉴스",
    url: "https://www.yna.co.kr/rss/politics.xml",
    lang: "ko",
    defaultCategory: "한국정치",
  },
  {
    name: "연합뉴스",
    url: "https://www.yna.co.kr/rss/international.xml",
    lang: "ko",
  },
  {
    name: "AP News",
    url: "https://news.google.com/rss/search?q=US+stock+market+economy&hl=en-US&gl=US&ceid=US:en",
    lang: "en",
    defaultCategory: "미국시장",
  },
  {
    name: "AP News",
    url: "https://news.google.com/rss/search?q=US+politics+congress+president&hl=en-US&gl=US&ceid=US:en",
    lang: "en",
    defaultCategory: "미국정치",
  },
];

// ---------------------------------------------------------------------------
// 카테고리 키워드 분류
// ---------------------------------------------------------------------------
const CATEGORY_KEYWORDS: Record<NewsCategory, string[]> = {
  주식: ["주식", "주가", "종목", "상장", "IPO", "배당", "공매도", "시가총액", "매수", "매도", "주주"],
  증시: ["증시", "코스피", "코스닥", "나스닥", "S&P", "다우", "지수", "장마감", "장중", "선물", "옵션"],
  미국시장: ["월가", "월스트리트", "뉴욕증시", "연준", "Fed", "파월", "미국 경제", "달러", "환율"],
  미국정치: ["트럼프", "바이든", "해리스", "미 의회", "공화당", "민주당", "백악관", "미국 대선", "상원", "하원", "펜타곤"],
  한국정치: ["대통령", "국회", "여당", "야당", "정부", "총리", "장관", "탄핵", "선거"],
  경제: ["경제", "GDP", "물가", "인플레이션", "실업", "고용", "수출", "수입", "무역", "금리", "기준금리", "한은"],
};

function classifyKorean(title: string, summary: string): NewsCategory | null {
  const text = `${title} ${summary}`;

  // 우선순위: 구체적 카테고리 먼저
  const priority: NewsCategory[] = ["주식", "증시", "미국시장", "미국정치", "한국정치", "경제"];
  for (const cat of priority) {
    if (CATEGORY_KEYWORDS[cat].some((kw) => text.includes(kw))) {
      return cat;
    }
  }
  return null;
}

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
    // data[0] is array of [translatedSegment, originalSegment, ...]
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

      let category: NewsCategory | null = null;

      if (config.lang === "ko") {
        category = classifyKorean(title, description);
        if (!category) category = config.defaultCategory ?? null;
      } else {
        category = config.defaultCategory ?? null;
      }

      if (!category) continue;

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
      if (config.lang === "en" && entry.title) {
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
        category,
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
  const results = await Promise.all(FEEDS.map(fetchFeed));
  const allItems = results.flat();

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

  // 카테고리당 최대 5개
  const countByCategory: Record<string, number> = {};
  return unique.filter((item) => {
    const count = countByCategory[item.category] ?? 0;
    if (count >= 5) return false;
    countByCategory[item.category] = count + 1;
    return true;
  });
}
