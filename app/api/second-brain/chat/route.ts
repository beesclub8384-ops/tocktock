import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  loadConversation,
  saveConversation,
  SB_ROOT_ID,
  type SBConversation,
} from "@/lib/second-brain";

const ACCESS_KEY = "8384";
const MODEL = "claude-sonnet-5";

// Vercel Hobby: 최대 300초
export const maxDuration = 120;

const SYSTEM_PROMPT =
  "당신은 학습 파트너입니다. 질문에 정확히 답하되 사족을 붙이지 마세요. 모르면 모른다고 명시하세요. 사실과 해석을 구분해 표시하세요.";

function checkAuth(request: NextRequest): boolean {
  return request.headers.get("x-sb-key") === ACCESS_KEY;
}

function emptyConversation(): SBConversation {
  const now = Date.now();
  return {
    id: SB_ROOT_ID,
    title: "제2의 뇌",
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const conv = await loadConversation(SB_ROOT_ID);
    return NextResponse.json(conv);
  } catch (error) {
    console.error("[second-brain] GET error:", error);
    return NextResponse.json(
      { error: "대화를 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { message?: string };
    const message = body.message?.trim();
    if (!message) {
      return NextResponse.json(
        { error: "메시지가 비어 있습니다." },
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

    const conv = (await loadConversation(SB_ROOT_ID)) ?? emptyConversation();
    conv.messages.push({ role: "user", content: message, ts: Date.now() });

    // 저장된 전체 대화를 그대로 전달해 문맥 유지
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: conv.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const reply = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    conv.messages.push({ role: "assistant", content: reply, ts: Date.now() });
    conv.updatedAt = Date.now();
    await saveConversation(conv);

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("[second-brain] POST error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `응답을 가져오지 못했습니다: ${detail}` },
      { status: 500 }
    );
  }
}
