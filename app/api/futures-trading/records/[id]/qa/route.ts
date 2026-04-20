import { NextRequest, NextResponse } from "next/server";
import { loadRecords, saveRecords } from "@/lib/futures-trading-store";
import type { QAAuthor, QAThread } from "@/lib/types/futures-trading";

const PASSWORD = "8384";

function checkAuth(request: NextRequest): boolean {
  return request.headers.get("x-password") === PASSWORD;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = (await request.json()) as {
      content?: string;
      author?: QAAuthor;
    };

    if (!body.content || !body.content.trim() || !body.author) {
      return NextResponse.json(
        { error: "content, author가 필요합니다." },
        { status: 400 }
      );
    }
    if (body.author !== "태양" && body.author !== "용태") {
      return NextResponse.json({ error: "작성자가 올바르지 않습니다." }, { status: 400 });
    }

    const records = await loadRecords();
    const target = records.find((r) => r.id === id);
    if (!target) {
      return NextResponse.json({ error: "매매 기록을 찾을 수 없습니다." }, { status: 404 });
    }

    const now = new Date().toISOString();
    const thread: QAThread = {
      id: crypto.randomUUID(),
      title: "",
      replies: [
        {
          id: crypto.randomUUID(),
          author: body.author,
          content: body.content.trim(),
          createdAt: now,
        },
      ],
      createdAt: now,
    };

    if (!Array.isArray(target.qaThreads)) target.qaThreads = [];
    target.qaThreads.push(thread);

    await saveRecords(records);
    return NextResponse.json({ success: true, thread });
  } catch (error) {
    console.error("[futures-records-qa] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "스레드 추가 실패" },
      { status: 500 }
    );
  }
}
