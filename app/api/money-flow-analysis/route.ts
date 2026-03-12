import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { redis } from "@/lib/redis";
import { PLAYER_META, MOCK_ANALYSIS, type AiAnalysis } from "@/lib/money-flow-data";
import { manualData } from "@/lib/money-flow-manual";

const CACHE_KEY = "money-flow:analysis";
const CACHE_TTL = 3600; // 1시간

function buildIndicatorSummary(): string {
  return PLAYER_META.map((p) => {
    const inds = p.indicatorMeta
      .map((i) => `  - ${i.name}: ${i.description}`)
      .join("\n");
    return `### ${p.name}\n역할: ${p.roleSummary}\n의도: ${p.intention}\n${inds}`;
  }).join("\n\n");
}

const SYSTEM_PROMPT = `너는 거시경제 분석가다. 7개 주체(중앙은행, 대형 금융기관, 헤지펀드, 대형 기업, 정부, 규제기관, 개인 투자자)의 현재 지표 데이터를 바탕으로 거시적 돈의 흐름을 분석하라. 투자 초보자가 이해할 수 있게 쉬운 말로 설명하라. 각 주체별 움직임과 의도를 포함하라. 마지막에 '본 분석은 참고용이며 투자 권유가 아닙니다'를 명시하라.

반드시 아래 JSON 형식으로 응답하라:
{
  "summary": "한줄 요약 (50자 이내)",
  "flowNodes": [
    { "playerId": "fed|institutions|hedgefunds|bigtech|government|regulators|retail", "status": "active|waiting|dim", "statusText": "상태 한줄 (10자 이내)" }
  ],
  "flowArrows": [
    { "from": "playerId", "to": "playerId", "label": "흐름 설명 (6자 이내)" }
  ],
  "detail": "마크다운 형식의 상세 분석 (## 소제목 사용, **볼드** 강조, - 리스트 활용, 1000~1500자)",
  "tags": ["키워드1", "키워드2", "..."],
  "updatedAt": "ISO 날짜"
}

flowNodes는 7개 주체 모두 포함해야 한다. flowArrows는 현재 활발한 자금 흐름만 3~5개.`;

export async function GET() {
  try {
    // 캐시 확인
    const cached = await redis.get<AiAnalysis>(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // API 키 없으면 목업 반환
      return NextResponse.json(MOCK_ANALYSIS);
    }

    const indicatorSummary = buildIndicatorSummary();

    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `오늘 날짜: ${new Date().toISOString().slice(0, 10)}\n\n현재 지표 데이터:\n\n${indicatorSummary}\n\n위 데이터를 바탕으로 돈의 흐름을 분석해줘.`,
        },
      ],
    });

    const block = message.content[0];
    if (block.type !== "text") {
      return NextResponse.json(MOCK_ANALYSIS);
    }

    // JSON 파싱 (코드블록 감싸져 있을 수 있음)
    let jsonText = block.text.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const analysis: AiAnalysis = JSON.parse(jsonText);
    analysis.updatedAt = new Date().toISOString();

    // Redis 캐싱
    try {
      await redis.set(CACHE_KEY, analysis, { ex: CACHE_TTL });
    } catch { /* cache write fail ok */ }

    return NextResponse.json(analysis);
  } catch (error) {
    console.error("[money-flow-analysis] Error:", error);
    return NextResponse.json(MOCK_ANALYSIS);
  }
}
