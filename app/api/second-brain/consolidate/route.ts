import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  collectTreeText,
  consolidateTree,
  loadRoots,
  simplifyForChild,
  SB_SUMMARY_RULES,
} from "@/lib/second-brain";

const ACCESS_KEY = "8384";
const MODEL = "claude-sonnet-5";

// Vercel Hobby: 최대 300초. 정리본 생성 + 9살 검사로 클로드를 두 번 부른다
export const maxDuration = 180;

// 옛 (4) '사족 금지'는 공통 규칙 4와 겹쳐서 뺐고, 옛 (5)가 (4)로 당겨졌다
const ROLE_PROMPT =
  "다음은 한 주제를 파고든 학습 기록 전체다(줄기, 가지, 가지 요약, 학습자가 직접 수정한 답변 포함). 이 전체를 학습자가 도달한 이해의 완성본으로 정리하라. 규칙: (1) 문답 형식을 버리고 지식 자체를 서술한다. (2) 가지에서 파고든 내용은 그것이 궁금해졌던 지점에 자연스럽게 녹여 넣는다. (3) 학습자가 수정한 답변은 그 표현을 존중해 우선 반영한다. (4) 논리적 순서로 재배치하되 내용을 새로 추가하거나 추측으로 채우지 않는다.";

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
    const body = (await request.json()) as {
      rootId?: string;
      action?: string;
      summary?: string;
    };
    const rootId = body.rootId?.trim();
    const action = body.action;

    if (!rootId) {
      return NextResponse.json(
        { error: "요약할 주제가 지정되지 않았습니다." },
        { status: 400 }
      );
    }

    // 가지 id로는 응고할 수 없다. 반드시 뿌리여야 한다
    const roots = await loadRoots();
    if (!roots.includes(rootId)) {
      return NextResponse.json(
        { error: "주제 전체(줄기)에서만 요약할 수 있습니다." },
        { status: 400 }
      );
    }

    if (action === "apply") {
      const summary = body.summary?.trim();
      if (!summary) {
        return NextResponse.json(
          { error: "정리본이 비어 있습니다." },
          { status: 400 }
        );
      }
      const conv = await consolidateTree(rootId, summary);
      return NextResponse.json({ conv });
    }

    if (action !== "preview") {
      return NextResponse.json(
        { error: "알 수 없는 요청입니다." },
        { status: 400 }
      );
    }

    const transcript = await collectTreeText(rootId);
    if (!transcript.trim()) {
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

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: transcript }],
    });

    const summary = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!summary) {
      return NextResponse.json(
        { error: "정리본을 만들지 못했습니다." },
        { status: 500 }
      );
    }

    // 2단계: 9살 아이 눈으로 한 번 더 훑는다. 실패하면 1단계 정리본이 그대로 쓰인다
    const simplified = await simplifyForChild(client, summary);

    return NextResponse.json({ summary: simplified });
  } catch (error) {
    console.error("[second-brain] consolidate POST error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
