import { NextRequest, NextResponse } from "next/server";
import {
  loadRecords,
  loadQuantified,
  addReplyToThread,
  updateThreadStatus,
  addQuantifiedCondition,
} from "@/lib/futures-trading-store";
import type { QAReply, QuantifiedCondition } from "@/lib/types/futures-trading";
import { analyzeReply } from "@/lib/futures-claude-analyzer";

const PASSWORD = "8384";

function checkAuth(request: NextRequest): boolean {
  return request.headers.get("x-password") === PASSWORD;
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      recordId?: string;
      threadId?: string;
      content?: string;
    };
    const { recordId, threadId, content } = body;

    if (!recordId || !threadId || !content || !content.trim()) {
      return NextResponse.json(
        { error: "recordId, threadId, content가 필요합니다." },
        { status: 400 }
      );
    }

    // 1. 용태 답글 추가
    const now = new Date().toISOString();
    const reply: QAReply = {
      id: crypto.randomUUID(),
      author: "용태",
      content: content.trim(),
      createdAt: now,
    };
    const added = await addReplyToThread(recordId, threadId, reply);
    if (!added) {
      return NextResponse.json(
        { error: "스레드 또는 매매 기록을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 2. 최신 스레드 재조회 (replies 반영된 상태)
    const records = await loadRecords();
    const record = records.find((r) => r.id === recordId);
    const thread = record?.qaThreads?.find((t) => t.id === threadId);
    if (!thread) {
      return NextResponse.json(
        { error: "스레드 조회 실패" },
        { status: 500 }
      );
    }

    // 3. Claude 분석
    const quantifiedList = await loadQuantified();
    let analysis;
    try {
      analysis = await analyzeReply(thread, quantifiedList);
    } catch (err) {
      console.error("[futures-trading/reply] analyzeReply failed:", err);
      return NextResponse.json({
        success: true,
        reply,
        analysisError: err instanceof Error ? err.message : String(err),
      });
    }

    // 4. action에 따른 후속 처리
    if (analysis.action === "completed") {
      await updateThreadStatus(recordId, threadId, "completed", analysis.reason);
      const quantified: QuantifiedCondition = {
        id: crypto.randomUUID(),
        condition: thread.title,
        value: analysis.value ?? null,
        status: "completed",
        reason: analysis.reason,
        sourceRecordId: recordId,
        sourceThreadId: threadId,
        createdAt: new Date().toISOString(),
      };
      await addQuantifiedCondition(quantified);
    } else if (analysis.action === "impossible") {
      await updateThreadStatus(recordId, threadId, "impossible", analysis.reason);
      const quantified: QuantifiedCondition = {
        id: crypto.randomUUID(),
        condition: thread.title,
        value: null,
        status: "impossible",
        reason: analysis.reason,
        sourceRecordId: recordId,
        sourceThreadId: threadId,
        createdAt: new Date().toISOString(),
      };
      await addQuantifiedCondition(quantified);
    } else if (analysis.action === "follow_up" && analysis.followUpQuestion) {
      const systemReply: QAReply = {
        id: crypto.randomUUID(),
        author: "system",
        content: analysis.followUpQuestion,
        createdAt: new Date().toISOString(),
      };
      await addReplyToThread(recordId, threadId, systemReply);
    }

    return NextResponse.json({
      success: true,
      reply,
      analysis,
    });
  } catch (error) {
    console.error("[futures-trading/reply] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "답변 처리 실패" },
      { status: 500 }
    );
  }
}
