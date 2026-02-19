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

  return `당신은 한국과 미국 주식에 투자하는 개인 투자자를 위한 거시경제 칼럼니스트입니다.
친구에게 설명하듯 쉽게, 하지만 핵심은 날카롭게 쓰는 스타일입니다.

아래 데이터를 바탕으로 한국어 거시전망 분석 글을 작성하세요.

## 데이터

### FRED 금리 현황 (${data.collectedAt.slice(0, 10)} 기준)
${fredSummary}

### 최근 연준 관련 뉴스
${newsSummary}

## 글 작성 규칙

1. **결론을 맨 위에 먼저 쓸 것.** 첫 문단에서 "그래서 어쩌라고?"에 대한 답을 바로 줘라. 투자자가 이 글을 읽고 뭘 해야 하는지 3줄 안에 알 수 있어야 한다.
2. **쉽고 가독성 좋게.** 전문용어는 반드시 괄호로 쉬운 설명을 붙여라. 예: "기준금리(은행끼리 돈 빌릴 때 이자율)", "10년물 국채수익률(미국 정부가 10년짜리 빚에 주는 이자)". 투자 경험 1년차도 이해할 수 있게 써라.
3. **비유와 예시를 적극 활용.** 숫자만 나열하지 말고, "이건 마치 ~와 같다"는 식으로 체감할 수 있게 설명해라.
4. **한국 주식 + 미국 주식 투자자 관점.** 양쪽 시장에서 이번 주 데이터가 왜 중요한지, 어떤 섹터/종목군에 영향을 주는지 구체적으로 다뤄라.
5. **3파트 구조로만 쓸 것:**
   - **## 이번 주 이게 왜 중요한가?** — 핵심 데이터와 뉴스가 왜 지금 중요한지 설명
   - **## 투자자가 주목할 포인트** — 한국/미국 주식 투자자가 실제로 신경 써야 할 것들
   - **## 리스크** — 이 시나리오가 틀어질 수 있는 경우
6. **불필요한 배경 설명은 빼고 핵심만.** "연준이란 미국의 중앙은행으로..." 같은 기본 설명은 하지 마라. 바로 본론으로 들어가라.
7. **마크다운 형식.** 제목은 ##, 강조는 **볼드**, 인용은 > 사용.
8. 글 길이: 1200~2000자. 짧고 임팩트 있게.
9. 글 마지막에 면책 조항 포함: *본 글은 공개된 데이터 기반 개인 의견이며, 투자 권유가 아닙니다.*

## 출력 형식

반드시 아래 형식의 마크다운을 출력하세요. frontmatter를 포함해야 합니다.
날짜는 ${today}를 사용하세요.
title은 투자자의 호기심을 자극하는 한국어 제목 (15~25자).
summary는 핵심 메시지 한 줄.

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
