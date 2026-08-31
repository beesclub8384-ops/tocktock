import { NextRequest, NextResponse } from "next/server";
import {
  deleteExchange,
  updateMessageContent,
  SB_ROOT_ID,
} from "@/lib/second-brain";

const ACCESS_KEY = "8384";

// 가지 연쇄 삭제는 Redis 왕복이 여러 번 일어난다
export const maxDuration = 60;

function checkAuth(request: NextRequest): boolean {
  return request.headers.get("x-sb-key") === ACCESS_KEY;
}

/** 문답 한 쌍 삭제. 그 답변에서 뻗은 가지는 하위까지 함께 사라진다 */
export async function DELETE(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      convId?: string;
      messageTs?: number;
    };
    // convId 없으면 'root' (1차 버전과 호환)
    const convId = body.convId?.trim() || SB_ROOT_ID;
    const messageTs = body.messageTs;

    if (typeof messageTs !== "number" || !Number.isFinite(messageTs)) {
      return NextResponse.json(
        { error: "삭제할 문답이 지정되지 않았습니다." },
        { status: 400 }
      );
    }

    const conv = await deleteExchange(convId, messageTs);
    return NextResponse.json({ conv });
  } catch (error) {
    console.error("[second-brain] message DELETE error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}

/** 답변 내용 수정. 고친 내용이 이후 대화의 문맥으로 그대로 쓰인다 */
export async function PATCH(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      convId?: string;
      messageTs?: number;
      content?: string;
    };
    // convId 없으면 'root' (1차 버전과 호환)
    const convId = body.convId?.trim() || SB_ROOT_ID;
    const messageTs = body.messageTs;
    const content = body.content?.trim();

    if (typeof messageTs !== "number" || !Number.isFinite(messageTs)) {
      return NextResponse.json(
        { error: "수정할 답변이 지정되지 않았습니다." },
        { status: 400 }
      );
    }
    if (!content) {
      return NextResponse.json(
        { error: "내용이 비어 있습니다." },
        { status: 400 }
      );
    }

    const message = await updateMessageContent(convId, messageTs, content);
    return NextResponse.json({ message });
  } catch (error) {
    console.error("[second-brain] message PATCH error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
