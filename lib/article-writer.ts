import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// .env.local 로드
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
// 타입
// ---------------------------------------------------------------------------
interface NewsItem {
  title: string;
  date: string;
  link: string;
  summary: string;
  source: string;
}

interface FredObservation {
  date: string;
  value: string;
}

interface FredSeries {
  id: string;
  label: string;
  observations: FredObservation[];
}

interface CollectorResult {
  news: NewsItem[];
  fred: FredSeries[];
  collectedAt: string;
}

// ---------------------------------------------------------------------------
// 데이터 로드
// ---------------------------------------------------------------------------
function loadFedData(filePath?: string): CollectorResult {
  const p = filePath ?? path.join(process.cwd(), "data", "fed-news.json");
  if (!fs.existsSync(p)) {
    throw new Error(
      `${p} not found. Run news-collector first: npx tsx lib/news-collector.ts`
    );
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// ---------------------------------------------------------------------------
// 프롬프트 생성
// ---------------------------------------------------------------------------
function buildPrompt(data: CollectorResult): string {
  const today = new Date().toISOString().slice(0, 10);

  // FRED 최신값 요약
  const fredSummary = data.fred
    .map((s) => {
      const latest = s.observations[0];
      const weekAgo = s.observations[5] ?? s.observations[s.observations.length - 1];
      const change = latest && weekAgo
        ? (parseFloat(latest.value) - parseFloat(weekAgo.value)).toFixed(2)
        : "N/A";
      return `- ${s.label} (${s.id}): ${latest?.value ?? "N/A"}% (${latest?.date ?? "N/A"}) | 주간 변동: ${change}%p`;
    })
    .join("\n");

  // 최근 뉴스 요약
  const newsSummary = data.news
    .slice(0, 10)
    .map((n) => `- [${n.date.slice(0, 10)}] ${n.title}\n  ${n.summary}`)
    .join("\n");

  return `당신은 한국의 투자자를 위한 거시경제 전문 칼럼니스트입니다.

아래 데이터를 바탕으로 한국어 거시전망 분석 글을 작성하세요.

## 데이터

### FRED 금리 현황 (${data.collectedAt.slice(0, 10)} 기준)
${fredSummary}

### 최근 연준 관련 뉴스
${newsSummary}

## 글 작성 규칙

1. **결론을 맨 위에 먼저 쓸 것.** 첫 문단에서 핵심 주장과 투자 시사점을 명확히 밝혀라.
2. **분석적이고 날카로운 톤.** 수치를 인용하고, 인과관계를 짚고, 반대 논리도 다뤄라. 얼버무리지 마라.
3. **구조:** 결론 → 금리 현황 분석 → 뉴스 해석 → 시장 시사점 → 리스크 순서로 전개.
4. **한국 투자자 관점.** 원/달러, 한국 시장에 미치는 영향도 한 섹션 이상 다뤄라.
5. **마크다운 형식.** 제목은 ##, 강조는 **볼드**, 인용은 > 사용.
6. 글 길이: 1500~2500자.
7. 글 마지막에 면책 조항 포함: *본 글은 공개된 데이터 기반 개인 의견이며, 투자 권유가 아닙니다.*

## 출력 형식

반드시 아래 형식의 마크다운을 출력하세요. frontmatter를 포함해야 합니다.
날짜는 ${today}를 사용하세요.
title은 핵심 메시지를 담은 한국어 제목 (20자 내외).
summary는 한 줄 요약.

---
title: "제목"
date: "${today}"
summary: "한 줄 요약"
---

(본문)`;
}

// ---------------------------------------------------------------------------
// 글 생성
// ---------------------------------------------------------------------------
export async function generateArticle(
  data?: CollectorResult
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set in .env.local");
  }

  const fedData = data ?? loadFedData();
  const prompt = buildPrompt(fedData);

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const block = message.content[0];
  if (block.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  return block.text;
}

// ---------------------------------------------------------------------------
// 저장
// ---------------------------------------------------------------------------
function slugify(title: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `fed-weekly-${date}`;
}

export async function generateAndSave(): Promise<string> {
  console.log("[article-writer] Generating article...");
  const article = await generateArticle();

  const slug = slugify("");
  const outPath = path.join(process.cwd(), "posts", "macro", `${slug}.md`);
  const outDir = path.dirname(outPath);

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(outPath, article, "utf8");
  console.log(`[article-writer] Saved to ${outPath}`);

  return outPath;
}

// CLI 실행: npx tsx lib/article-writer.ts
if (process.argv[1]?.includes("article-writer")) {
  generateAndSave().catch(console.error);
}
