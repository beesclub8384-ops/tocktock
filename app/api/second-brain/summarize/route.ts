import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  loadConversation,
  saveConversation,
  SB_SUMMARY_RULES,
} from "@/lib/second-brain";

const ACCESS_KEY = "8384";
const MODEL = "claude-sonnet-5";

// Vercel Hobby: 최대 300초
export const maxDuration = 120;

// 가지 완료 요약·전체 정리본과 같은 요약 규칙을 쓴다(단일 원천).
// 여기에만 "딱 한 문장" 제약을 더 얹는다.
const SYSTEM_PROMPT = `다음 답변의 핵심을 딱 한 문장으로 요약하라. 사족·부연 금지, 문장은 하나만.

${SB_SUMMARY_RULES}`;

function checkAuth(request: NextRequest): boolean {
  return request.headers.get("x-sb-key") === ACCESS_KEY;
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      convId?: string;
      messageTs?: number;
    };
    const convId = body.convId?.trim();
    const messageTs = body.messageTs;

    if (!convId) {
      return NextResponse.json(
        { error: "대화가 지정되지 않았습니다." },
        { status: 400 }
      );
    }
    if (typeof messageTs !== "number" || !Number.isFinite(messageTs)) {
      return NextResponse.json(
        { error: "요약할 메시지가 지정되지 않았습니다." },
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

    const target = conv.messages.find(
      (m) => m.role === "assistant" && m.ts === messageTs
    );
    if (!target) {
      return NextResponse.json(
        { error: "요약할 답변을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: target.content }],
    });

    const oneLine = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!oneLine) {
      return NextResponse.json(
        { error: "요약을 생성하지 못했습니다." },
        { status: 500 }
      );
    }

    // 원문(content)은 건드리지 않는다. 이미 요약이 있으면 새로 만든 것으로 덮어쓴다
    target.oneLine = oneLine;
    conv.updatedAt = Date.now();
    await saveConversation(conv);

    return NextResponse.json({ oneLine });
  } catch (error) {
    console.error("[second-brain] summarize POST error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `요약하지 못했습니다: ${detail}` },
      { status: 500 }
    );
  }
}
