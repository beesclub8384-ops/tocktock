import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  emptyRootConversation,
  loadConversation,
  saveConversation,
  titleFromMessage,
  updateTreeNodeTitle,
  SB_NEW_BRANCH_TITLE,
  SB_ROOT_ID,
} from "@/lib/second-brain";

const ACCESS_KEY = "8384";
const MODEL = "claude-sonnet-5";

// Vercel Hobby: 최대 300초
export const maxDuration = 120;

const SYSTEM_PROMPT =
  "당신은 파고들기식 학습의 파트너다. 규칙: (1) 질문된 것에만 답한다. 배경 설명, 부연, '참고로', '덧붙이자면', 예상 질문 선답변 전부 금지. (2) 답은 본질만 담아 최대한 짧게. 문단 하나로 충분하면 문단 하나로 끝낸다. (3) 질문자는 더 궁금한 게 있으면 스스로 다시 파고든다. 미리 채워주지 마라. (4) 모르면 모른다고 명시한다. 추측 금지. (5) 사실과 해석을 구분해 표시한다. (6) 질문자가 사실관계를 틀리면 동조하지 말고 근거와 함께 즉시 짚는다.";

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

    // 임시 제목("새 가지")인 가지의 첫 질문이면 그 질문으로 제목을 만든다
    const isFirstUserMessage = !conv.messages.some((m) => m.role === "user");
    const newTitle =
      conv.title === SB_NEW_BRANCH_TITLE && isFirstUserMessage
        ? titleFromMessage(message)
        : null;
    if (newTitle) conv.title = newTitle;

    conv.messages.push({ role: "user", content: message, ts: Date.now() });

    // 해당 대화의 messages만 문맥으로 전달 (가지별 문맥 분리)
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
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
    if (newTitle) await updateTreeNodeTitle(conv.id, newTitle);

    return NextResponse.json({ reply, title: conv.title });
  } catch (error) {
    console.error("[second-brain] POST error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `응답을 가져오지 못했습니다: ${detail}` },
      { status: 500 }
    );
  }
}
