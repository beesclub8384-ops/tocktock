import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { redis } from "@/lib/redis";

// ---------------------------------------------------------------------------
// FOMC 점도표 자동 크롤링 & AI 분석
// ---------------------------------------------------------------------------

const REDIS_KEY = "fomc-dot-plot";
const USER_AGENT = "TockTock/1.0 (economic-data-aggregator)";

// 점도표(SEP) 관련 키워드 — 하나라도 있어야 분석 대상
const SEP_KEYWORDS = [
  "Summary of Economic Projections",
  "dot plot",
  "median projection",
  "SEP",
];

interface FomcDotPlotData {
  value: string;
  change: number;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// 1) FOMC 캘린더에서 최신 보도자료 URL 추출
// ---------------------------------------------------------------------------

async function findLatestFomcStatementUrl(): Promise<string> {
  const calendarUrl =
    "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";
  const res = await fetch(calendarUrl, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`FOMC calendar fetch failed: ${res.status}`);

  const html = await res.text();

  // 보도자료 링크 패턴: /monetarypolicy/fomcpresconf20250319.htm 등
  // 또는 Statement 링크: /newsevents/pressreleases/monetary20250319a.htm
  // 사용자 지정 패턴: /monetarypolicy/20YYMMDDAP.htm 형식도 매칭
  const patterns = [
    /\/newsevents\/pressreleases\/monetary\d{8}a\.htm/g,
    /\/monetarypolicy\/\d{8}[a-zA-Z]*\.htm/g,
  ];

  const allMatches: string[] = [];
  for (const pattern of patterns) {
    const matches = html.match(pattern);
    if (matches) allMatches.push(...matches);
  }

  if (allMatches.length === 0) {
    throw new Error("FOMC 보도자료 링크를 찾을 수 없습니다");
  }

  // 중복 제거 후 날짜순 정렬 — 가장 최근 것 선택
  const sorted = [...new Set(allMatches)].sort().reverse();
  return `https://www.federalreserve.gov${sorted[0]}`;
}

// ---------------------------------------------------------------------------
// 2) 보도자료 페이지 텍스트 추출
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchStatementText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`FOMC statement fetch failed: ${res.status}`);

  const html = await res.text();
  const text = stripHtml(html);

  // 토큰 절약을 위해 8000자 제한
  return text.slice(0, 8000);
}

// ---------------------------------------------------------------------------
// 3) 점도표 키워드 검사
// ---------------------------------------------------------------------------

function containsSepKeywords(text: string): boolean {
  return SEP_KEYWORDS.some((kw) =>
    text.toLowerCase().includes(kw.toLowerCase())
  );
}

// ---------------------------------------------------------------------------
// 4) Claude AI로 점도표 분석
// ---------------------------------------------------------------------------

async function analyzeWithClaude(
  statementText: string
): Promise<FomcDotPlotData | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });
  const today = new Date().toISOString().split("T")[0];
  const currentYear = new Date().getFullYear();

  const prompt = `다음은 Fed FOMC 회의 공식 보도자료입니다.

이 보도자료에 점도표(Summary of Economic Projections, SEP)가 포함된 경우에만 분석해줘.

포함된 경우:
- 점도표 중앙값 기준으로 올해(${currentYear}) 금리 인하 횟수를 파악해줘
- 아래 JSON 형식으로만 응답해줘. 다른 텍스트는 절대 포함하지 마:
{
  "value": "연내 N회 인하 전망" 또는 "연내 동결 전망",
  "change": 인하 횟수 숫자 (동결이면 0),
  "updatedAt": "오늘 날짜 YYYY-MM-DD"
}

포함되지 않은 경우:
- 아래 JSON만 반환해. 절대 추측하지 마:
{ "value": null }

보도자료 내용:
${statementText}`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  const block = message.content[0];
  if (block.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  // JSON 추출 (코드블록으로 감싸져 있을 수 있음)
  const jsonMatch = block.text.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) {
    console.error(
      `[fomc-dot-plot] Claude 응답에서 JSON 추출 실패: ${block.text}`
    );
    return null;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    // value가 null이면 점도표 미포함
    if (parsed.value === null || parsed.value === undefined) {
      return null;
    }

    // 유효성 검증
    if (
      typeof parsed.value !== "string" ||
      typeof parsed.change !== "number" ||
      typeof parsed.updatedAt !== "string"
    ) {
      console.error(
        `[fomc-dot-plot] 잘못된 응답 형식: ${JSON.stringify(parsed)}`
      );
      return null;
    }

    return parsed as FomcDotPlotData;
  } catch (e) {
    console.error(`[fomc-dot-plot] JSON 파싱 실패: ${jsonMatch[0]}`, e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  // CRON_SECRET 인증
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1) 최신 FOMC 보도자료 URL 찾기
    const statementUrl = await findLatestFomcStatementUrl();
    console.log(`[fomc-dot-plot] 최신 보도자료: ${statementUrl}`);

    // 2) 보도자료 텍스트 추출
    const statementText = await fetchStatementText(statementUrl);

    // 3) 점도표 키워드 검사
    if (!containsSepKeywords(statementText)) {
      console.log("[fomc-dot-plot] 점도표 미발표 회의 — 스킵");
      return NextResponse.json({
        status: "skipped",
        reason: "점도표 미발표 회의 — 업데이트 없음",
        source: statementUrl,
        timestamp: new Date().toISOString(),
      });
    }

    // 4) Claude AI 분석
    const result = await analyzeWithClaude(statementText);

    if (!result) {
      console.log("[fomc-dot-plot] AI가 점도표 미포함으로 판단 — 스킵");
      return NextResponse.json({
        status: "skipped",
        reason: "AI 분석 결과 점도표 미포함 또는 파싱 실패 — 업데이트 없음",
        source: statementUrl,
        timestamp: new Date().toISOString(),
      });
    }

    console.log("[fomc-dot-plot] AI 분석 결과:", result);

    // 5) Redis에 저장 (만료 없음 — 다음 FOMC까지 유지)
    await redis.set(REDIS_KEY, result);

    return NextResponse.json({
      status: "updated",
      data: result,
      source: statementUrl,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[fomc-dot-plot] 업데이트 실패:", error);
    return NextResponse.json(
      {
        status: "error",
        reason: String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
