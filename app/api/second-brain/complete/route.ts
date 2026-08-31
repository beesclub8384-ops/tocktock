import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  finishBranch,
  loadConversation,
  simplifyForChild,
  SB_ROOT_ID,
  SB_SUMMARY_RULES,
} from "@/lib/second-brain";

const ACCESS_KEY = "8384";
const MODEL = "claude-sonnet-5";

// Vercel Hobby: 최대 300초. 요약 생성 + 9살 검사로 클로드를 두 번 부른다
export const maxDuration = 180;

const ROLE_PROMPT =
  "다음 학습 문답을 요약하라. 질문자가 이해하게 된 핵심 내용을 완성된 설명문으로 정리하되, 문답 형식은 버리고 지식 자체를 서술하라.";

// 규칙 원문은 lib/second-brain.ts 한 곳에만 둔다
const SYSTEM_PROMPT = `${ROLE_PROMPT}

${SB_SUMMARY_RULES}`;

function checkAuth(request: NextRequest): boolean {
  return request.headers.get("x-sb-key") === ACCESS_KEY;
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { convId?: string };
    const convId = body.convId?.trim();

    if (!convId || convId === SB_ROOT_ID) {
      return NextResponse.json(
        { error: "완료할 가지가 지정되지 않았습니다." },
        { status: 400 }
      );
    }

    const conv = await loadConversation(convId);
    if (!conv) {
      return NextResponse.json(
        { error: "대화를 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    if (!conv.parentId) {
      return NextResponse.json(
        { error: "루트 대화는 완료할 수 없습니다." },
        { status: 400 }
      );
    }
    if (conv.messages.length === 0) {
      return NextResponse.json(
        { error: "요약할 대화 내용이 없습니다." },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    const transcript = conv.messages
      .map((m) => `${m.role === "user" ? "질문" : "답변"}: ${m.content}`)
      .join("\n\n");

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `주제: ${conv.title}\n\n${transcript}`,
        },
      ],
    });

    const summary = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!summary) {
      return NextResponse.json(
        { error: "요약을 생성하지 못했습니다." },
        { status: 500 }
      );
    }

    // 2단계: 9살 아이 눈으로 한 번 더 훑는다. 실패하면 1단계 요약이 그대로 쓰인다
    const simplified = await simplifyForChild(client, summary);

    await finishBranch(conv, simplified);

    return NextResponse.json({ summary: simplified });
  } catch (error) {
    console.error("[second-brain] complete POST error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `가지를 완료하지 못했습니다: ${detail}` },
      { status: 500 }
    );
  }
}
