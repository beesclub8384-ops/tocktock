import Parser from "rss-parser";
import fs from "fs";
import path from "path";
import { isSiteOriginSeries } from "@/lib/site-source-config";
import { siteObservations } from "@/lib/site-origin";

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
  {
    name: "Fed Speeches",
    url: "https://www.federalreserve.gov/feeds/speeches.xml",
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
// 금리 시리즈 설정 (FRED 시리즈 ID 로 부른다 — 원출처 전환은 lib/site-source-config.ts, 미션 8)
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
  /** 금리 시리즈 (필드 이름은 예전 파일·글 생성기와 맞추려고 그대로 둔다. 실제 출처는 source) */
  fred: FredSeries[];
  /** "origin" = 연준 이사회 H.15 직접, "fred" = FRED 경유 (미션 8) */
  source?: "origin" | "fred";
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
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    for (const entry of feed.items) {
      const dateStr = entry.isoDate ?? entry.pubDate ?? "";
      if (dateStr && new Date(dateStr).getTime() < sevenDaysAgo) continue;

      const title = entry.title ?? "";
      const summary = stripHtml(
        entry.contentSnippet ?? entry.content ?? entry.summary ?? ""
      );
      if (!matchesKeywords(`${title} ${summary}`)) continue;

      items.push({
        title,
        date: dateStr,
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
  const limit = 14;
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

/**
 * 원출처 수집 (미션 8): 연준 이사회 H.15 발표 묶음에서 FRED 와 같은 행(최근 14행, "." 제외)을 만든다.
 * DFF = RIFSPFF_N.D(주말·휴일 포함 매일), DGS10 = RIFLGFCY10_N.B, DGS2 = RIFLGFCY02_N.B (FRED 와 전 기간 불일치 0).
 * GitHub Actions 에는 Redis 비밀키가 없어 보관 없이 받는다(useStore: false). 새 비밀키는 필요 없다.
 */
async function fetchOriginSeries(seriesId: string, label: string): Promise<FredSeries> {
  try {
    const rows = await siteObservations(seriesId, { sortOrder: "desc", limit: 14, useStore: false });
    // 값 문자열은 글 생성 프롬프트에 그대로 들어간다. H.15 는 "5.10" 처럼 끝자리 0 을 남기고 FRED 는 "5.1" 로 주므로
    // 같은 수를 같은 글자로 쓰려고 끝자리 0 을 뺀다(수는 같다, 결정 로그 20-3)
    const observations: FredObservation[] = rows
      .filter((o) => o.value !== ".")
      .map((o) => ({ date: o.date, value: String(Number(o.value)) }));
    return { id: seriesId, label, observations };
  } catch (err) {
    console.error(`[news-collector] Failed to fetch H.15 ${seriesId}: ${err}`);
    return { id: seriesId, label, observations: [] };
  }
}

// ---------------------------------------------------------------------------
// 메인 수집
// ---------------------------------------------------------------------------
export async function collectAll(): Promise<CollectorResult> {
  // 기본은 원출처(연준 이사회 H.15). SITE_DATA_SOURCE=fred 일 때만 FRED 키가 필요하다
  const useOrigin = FRED_SERIES.every((s) => isSiteOriginSeries(s.id));
  const apiKey = process.env.FRED_API_KEY;
  if (!useOrigin && !apiKey) {
    throw new Error("FRED_API_KEY is not set in .env.local");
  }

  const [newsResults, ...fredResults] = await Promise.all([
    Promise.all(RSS_FEEDS.map((f) => fetchFeed(f.name, f.url))),
    ...FRED_SERIES.map((s) => (useOrigin ? fetchOriginSeries(s.id, s.label) : fetchFredSeries(s.id, s.label, apiKey!))),
  ]);

  const news = newsResults
    .flat()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    news,
    fred: fredResults,
    source: useOrigin ? "origin" : "fred",
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
    `[news-collector] Saved ${result.news.length} news articles + ${result.fred.length} rate series (${result.source}) to ${outFile}`
  );

  return result;
}

// CLI 실행: npx tsx lib/news-collector.ts [--out <파일>]
// --out: 시험 실행(dry-run)용 — data/ 대신 지정한 파일에 쓴다(저장소 파일을 바꾸지 않게, 미션 9)
if (process.argv[1]?.includes("news-collector")) {
  const i = process.argv.indexOf("--out");
  collectAndSave(i > 0 ? process.argv[i + 1] : undefined).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
