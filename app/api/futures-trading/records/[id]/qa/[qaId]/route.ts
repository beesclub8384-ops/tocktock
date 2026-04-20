import { NextRequest, NextResponse } from "next/server";
import { loadRecords, saveRecords } from "@/lib/futures-trading-store";
import { redis } from "@/lib/redis";
import type { QAAuthor, QAReply } from "@/lib/types/futures-trading";

const PASSWORD = "8384";

function checkAuth(request: NextRequest): boolean {
  return request.headers.get("x-password") === PASSWORD;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; qaId: string }> }
) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, qaId } = await params;
    const body = (await request.json()) as {
      content?: string;
      author?: QAAuthor;
    };

    if (!body.content || !body.author) {
      return NextResponse.json(
        { error: "content, author가 필요합니다." },
        { status: 400 }
      );
    }
    if (body.author !== "태양" && body.author !== "용태") {
      return NextResponse.json({ error: "작성자가 올바르지 않습니다." }, { status: 400 });
    }

    const records = await loadRecords();
    const record = records.find((r) => r.id === id);
    if (!record) {
      return NextResponse.json({ error: "매매 기록을 찾을 수 없습니다." }, { status: 404 });
    }
    const thread = record.qaThreads?.find((t) => t.id === qaId);
    if (!thread) {
      return NextResponse.json({ error: "스레드를 찾을 수 없습니다." }, { status: 404 });
    }

    const reply: QAReply = {
      id: crypto.randomUUID(),
      author: body.author,
      content: body.content.trim(),
      createdAt: new Date().toISOString(),
    };
    thread.replies.push(reply);

    await saveRecords(records);
    return NextResponse.json({ success: true, reply });
  } catch (error) {
    console.error("[futures-records-qa/qaId] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "댓글 추가 실패" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; qaId: string }> }
) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, qaId } = await params;

    const records = await loadRecords();
    const record = records.find((r) => r.id === id);
    if (!record || !Array.isArray(record.qaThreads)) {
      return NextResponse.json({ error: "매매 기록을 찾을 수 없습니다." }, { status: 404 });
    }

    const target = record.qaThreads.find((t) => t.id === qaId);
    if (!target) {
      return NextResponse.json({ error: "스레드를 찾을 수 없습니다." }, { status: 404 });
    }

    // 삭제 전 백업
    const backupKey = `futures-trading:qa:deleted-${Date.now()}`;
    await redis.set(backupKey, {
      recordId: id,
      thread: target,
      deletedAt: new Date().toISOString(),
    });

    record.qaThreads = record.qaThreads.filter((t) => t.id !== qaId);
    await saveRecords(records);

    return NextResponse.json({ success: true, backupKey });
  } catch (error) {
    console.error("[futures-records-qa/qaId] DELETE error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "스레드 삭제 실패" },
      { status: 500 }
    );
  }
}
