import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { redis } from "@/lib/redis";

// ---------------------------------------------------------------------------
// FOMC 점도표 자동 크롤링 & AI 분석
// ---------------------------------------------------------------------------

const REDIS_KEY = "fomc-dot-plot";

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
    headers: { "User-Agent": "TockTock/1.0 (economic-data-aggregator)" },
  });
  if (!res.ok) throw new Error(`FOMC calendar fetch failed: ${res.status}`);

  const html = await res.text();

  // 보도자료(statement) 링크 패턴:
  // /newsevents/pressreleases/monetary20250319a.htm
  const statementPattern =
    /\/newsevents\/pressreleases\/monetary\d{8}a\.htm/g;
  const matches = html.match(statementPattern);

  if (!matches || matches.length === 0) {
    throw new Error("FOMC 보도자료 링크를 찾을 수 없습니다");
  }

  // 날짜순 정렬 — 가장 최근 것 선택
  const sorted = [...new Set(matches)].sort().reverse();
  return `https://www.federalreserve.gov${sorted[0]}`;
}

// ---------------------------------------------------------------------------
// 2) 보도자료 페이지 텍스트 추출
// ---------------------------------------------------------------------------

async function fetchStatementText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "TockTock/1.0 (economic-data-aggregator)" },
  });
  if (!res.ok) throw new Error(`FOMC statement fetch failed: ${res.status}`);

  const html = await res.text();

  // HTML 태그 제거하여 순수 텍스트 추출
  const text = html
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

  // 너무 길면 잘라서 토큰 절약
  return text.slice(0, 8000);
}

// ---------------------------------------------------------------------------
// 3) Claude AI로 점도표 분석
// ---------------------------------------------------------------------------

async function analyzeWithClaude(
  statementText: string,
  statementUrl: string
): Promise<FomcDotPlotData> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });

  const today = new Date().toISOString().split("T")[0];

  const prompt = `다음은 Fed FOMC 회의 보도자료입니다.
URL: ${statementUrl}

---
${statementText}
---

점도표(dot plot) 기준으로 올해 금리 인하 횟수 중앙값이 몇 회인지, 그리고 한국어로 '연내 N회 인하 전망' 또는 '동결 전망' 형식의 짧은 문장을 JSON으로 반환해줘.

규칙:
- 보도자료에 점도표가 직접 언급되지 않더라도, 금리 결정과 전망 내용을 기반으로 판단해줘
- 금리를 인상했으면 change를 -1로, 인하했으면 1로, 동결이면 0으로 해줘
- updatedAt은 오늘 날짜(${today})를 사용해줘

반드시 아래 JSON 형식만 반환해. 다른 텍스트 없이 JSON만:
{ "value": "연내 N회 인하 전망", "change": 0, "updatedAt": "${today}" }`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  const block = message.content[0];
  if (block.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  // JSON 추출 (코드블록 감싸져 있을 수 있음)
  const jsonMatch = block.text.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) {
    throw new Error(`Claude 응답에서 JSON을 추출할 수 없습니다: ${block.text}`);
  }

  const parsed = JSON.parse(jsonMatch[0]) as FomcDotPlotData;

  // 기본 검증
  if (!parsed.value || typeof parsed.change !== "number" || !parsed.updatedAt) {
    throw new Error(`잘못된 응답 형식: ${JSON.stringify(parsed)}`);
  }

  return parsed;
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

    // 3) Claude AI 분석
    const result = await analyzeWithClaude(statementText, statementUrl);
    console.log(`[fomc-dot-plot] AI 분석 결과:`, result);

    // 4) Redis에 저장 (만료 없음 — 다음 FOMC까지 유지)
    await redis.set(REDIS_KEY, result);

    return NextResponse.json({
      success: true,
      message: "FOMC 점도표 데이터 업데이트 완료",
      data: result,
      source: statementUrl,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[fomc-dot-plot] 업데이트 실패:", error);
    return NextResponse.json(
      {
        success: false,
        error: String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
