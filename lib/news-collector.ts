import Parser from "rss-parser";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// .env.local 로드 (Next.js 외부에서 실행 시)
// ---------------------------------------------------------------------------
function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

// ---------------------------------------------------------------------------
// RSS 설정
// ---------------------------------------------------------------------------
const parser = new Parser({
  timeout: 10000,
  headers: { "User-Agent": "TockTock-NewsCollector/1.0" },
});

const RSS_FEEDS = [
  {
    name: "Federal Reserve",
    url: "https://www.federalreserve.gov/feeds/press_monetary.xml",
  },
];

const RATE_KEYWORDS = [
  "rate",
  "interest",
  "fed",
  "federal reserve",
  "fomc",
  "monetary policy",
  "inflation",
  "basis point",
  "treasury",
  "yield",
  "hawkish",
  "dovish",
  "tightening",
  "easing",
];

// ---------------------------------------------------------------------------
// FRED 설정
// ---------------------------------------------------------------------------
const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

const FRED_SERIES = [
  { id: "DFF", label: "Federal Funds Rate" },
  { id: "DGS10", label: "10-Year Treasury Yield" },
  { id: "DGS2", label: "2-Year Treasury Yield" },
];

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------
export interface NewsItem {
  title: string;
  date: string;
  link: string;
  summary: string;
  source: string;
}

export interface FredObservation {
  date: string;
  value: string;
}

export interface FredSeries {
  id: string;
  label: string;
  observations: FredObservation[];
}

export interface CollectorResult {
  news: NewsItem[];
  fred: FredSeries[];
  collectedAt: string;
}

// ---------------------------------------------------------------------------
// RSS 수집
// ---------------------------------------------------------------------------
function matchesKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return RATE_KEYWORDS.some((kw) => lower.includes(kw));
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "...";
}

function stripHtml(raw: string): string {
  return raw.replace(/<[^>]*>/g, "").trim();
}

async function fetchFeed(name: string, url: string): Promise<NewsItem[]> {
  try {
    const feed = await parser.parseURL(url);
    const items: NewsItem[] = [];

    for (const entry of feed.items) {
      const title = entry.title ?? "";
      const summary = stripHtml(
        entry.contentSnippet ?? entry.content ?? entry.summary ?? ""
      );
      if (!matchesKeywords(`${title} ${summary}`)) continue;

      items.push({
        title,
        date: entry.isoDate ?? entry.pubDate ?? "",
        link: entry.link ?? "",
        summary: truncate(summary, 300),
        source: name,
      });
    }
    return items;
  } catch (err) {
    console.error(`[news-collector] Failed to fetch ${name}: ${err}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// FRED 수집
// ---------------------------------------------------------------------------
async function fetchFredSeries(
  seriesId: string,
  label: string,
  apiKey: string
): Promise<FredSeries> {
  const limit = 30;
  const url =
    `${FRED_BASE}?series_id=${seriesId}` +
    `&api_key=${apiKey}` +
    `&file_type=json` +
    `&sort_order=desc` +
    `&limit=${limit}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as {
      observations: { date: string; value: string }[];
    };

    const observations: FredObservation[] = data.observations
      .filter((o) => o.value !== ".")
      .map((o) => ({ date: o.date, value: o.value }));

    return { id: seriesId, label, observations };
  } catch (err) {
    console.error(`[news-collector] Failed to fetch FRED ${seriesId}: ${err}`);
    return { id: seriesId, label, observations: [] };
  }
}

// ---------------------------------------------------------------------------
// 메인 수집
// ---------------------------------------------------------------------------
export async function collectAll(): Promise<CollectorResult> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    throw new Error("FRED_API_KEY is not set in .env.local");
  }

  const [newsResults, ...fredResults] = await Promise.all([
    Promise.all(RSS_FEEDS.map((f) => fetchFeed(f.name, f.url))),
    ...FRED_SERIES.map((s) => fetchFredSeries(s.id, s.label, apiKey)),
  ]);

  const news = newsResults
    .flat()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    news,
    fred: fredResults,
    collectedAt: new Date().toISOString(),
  };
}

export async function collectAndSave(outputPath?: string): Promise<CollectorResult> {
  const result = await collectAll();
  const outFile =
    outputPath ?? path.join(process.cwd(), "data", "fed-news.json");
  const outDir = path.dirname(outFile);

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), "utf8");
  console.log(
    `[news-collector] Saved ${result.news.length} news articles + ${result.fred.length} FRED series to ${outFile}`
  );

  return result;
}

// CLI 실행: npx tsx lib/news-collector.ts
if (process.argv[1]?.includes("news-collector")) {
  collectAndSave().catch(console.error);
}
