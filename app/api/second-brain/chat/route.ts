import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  emptyRootConversation,
  loadConversation,
  saveConversation,
  SB_ROOT_ID,
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

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // convId 없으면 'root' (1차 버전과 호환)
    const convId =
      request.nextUrl.searchParams.get("convId")?.trim() || SB_ROOT_ID;
    const conv = await loadConversation(convId);
    if (!conv && convId !== SB_ROOT_ID) {
      return NextResponse.json(
        { error: "대화를 찾을 수 없습니다." },
        { status: 404 }
      );
    }
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
    const body = (await request.json()) as {
      message?: string;
      convId?: string;
    };
    const message = body.message?.trim();
    if (!message) {
      return NextResponse.json(
        { error: "메시지가 비어 있습니다." },
        { status: 400 }
      );
    }

    // convId 없으면 'root' (1차 버전과 호환)
    const convId = body.convId?.trim() || SB_ROOT_ID;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    const existing = await loadConversation(convId);
    if (!existing && convId !== SB_ROOT_ID) {
      return NextResponse.json(
        { error: "대화를 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    const conv = existing ?? emptyRootConversation();
    conv.messages.push({ role: "user", content: message, ts: Date.now() });

    // 해당 대화의 messages만 문맥으로 전달 (가지별 문맥 분리)
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
