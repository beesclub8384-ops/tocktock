import { NextRequest, NextResponse } from "next/server";
import {
  loadQA,
  addQuestion,
  addReply,
  deleteReply,
  deleteQuestion,
} from "@/lib/futures-trading-store";
import type { QAAuthor } from "@/lib/types/futures-trading";

const PASSWORD = "8384";

function checkAuth(request: NextRequest): boolean {
  return request.headers.get("x-password") === PASSWORD;
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const threads = await loadQA();
    return NextResponse.json({ threads });
  } catch (error) {
    console.error("[futures-qa] GET error:", error);
    return NextResponse.json({ error: "불러오기 실패" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { title } = (await request.json()) as { title?: string };
    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "title이 필요합니다." }, { status: 400 });
    }
    const thread = await addQuestion(title);
    return NextResponse.json({ success: true, thread });
  } catch (error) {
    console.error("[futures-qa] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "등록 실패" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as {
      qaId?: string;
      author?: QAAuthor;
      content?: string;
    };
    if (!body.qaId || !body.author || !body.content) {
      return NextResponse.json(
        { error: "qaId, author, content가 필요합니다." },
        { status: 400 }
      );
    }
    const reply = await addReply(body.qaId, body.author, body.content);
    if (!reply) {
      return NextResponse.json(
        { error: "해당 스레드를 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, reply });
  } catch (error) {
    console.error("[futures-qa] PATCH error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "댓글 등록 실패" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as {
      type?: "thread" | "reply";
      qaId?: string;
      replyId?: string;
    };

    if (!body.type || !body.qaId) {
      return NextResponse.json(
        { error: "type, qaId가 필요합니다." },
        { status: 400 }
      );
    }

    if (body.type === "thread") {
      const ok = await deleteQuestion(body.qaId);
      if (!ok) {
        return NextResponse.json(
          { error: "스레드를 찾을 수 없습니다." },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true });
    }

    if (body.type === "reply") {
      if (!body.replyId) {
        return NextResponse.json(
          { error: "replyId가 필요합니다." },
          { status: 400 }
        );
      }
      const ok = await deleteReply(body.qaId, body.replyId);
      if (!ok) {
        return NextResponse.json(
          { error: "댓글을 찾을 수 없습니다." },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "type이 올바르지 않습니다." }, { status: 400 });
  } catch (error) {
    console.error("[futures-qa] DELETE error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "삭제 실패" },
      { status: 500 }
    );
  }
}
