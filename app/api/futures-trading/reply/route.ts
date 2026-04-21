import { NextRequest, NextResponse } from "next/server";
import {
  loadRecords,
  loadQuantified,
  addReplyToThread,
  updateThreadStatus,
  updateReplyContent,
  updateThreadTitle,
  addQuantifiedCondition,
} from "@/lib/futures-trading-store";
import type { QAReply, QuantifiedCondition } from "@/lib/types/futures-trading";
import { analyzeReply, type AnalyzeReplyResult } from "@/lib/futures-claude-analyzer";

const PASSWORD = "8384";
const LOG_TAG = "[futures-trading/reply]";

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

    // 1. 용태 답글 추가 (Redis 저장 성공 확인)
    const now = new Date().toISOString();
    const reply: QAReply = {
      id: crypto.randomUUID(),
      author: "용태",
      content: content.trim(),
      createdAt: now,
    };
    const added = await addReplyToThread(recordId, threadId, reply);
    if (!added) {
      console.error(`${LOG_TAG} addReplyToThread returned false`, { recordId, threadId });
      return NextResponse.json(
        { error: "스레드 또는 매매 기록을 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    console.log(`${LOG_TAG} reply saved`, { recordId, threadId, replyId: reply.id });

    // 2. 최신 스레드 재조회 (용태 답변 포함된 replies 보장)
    const records = await loadRecords();
    const record = records.find((r) => r.id === recordId);
    const thread = record?.qaThreads?.find((t) => t.id === threadId);
    if (!thread) {
      console.error(`${LOG_TAG} thread reload failed`, { recordId, threadId });
      return NextResponse.json(
        { error: "스레드 조회 실패" },
        { status: 500 }
      );
    }
    console.log(`${LOG_TAG} thread reloaded; replies=${thread.replies.length}`);

    // 3. Claude 분석 — 내부에서 재시도 + 실패 시 fallbackFollowUp 반환
    const quantifiedList = await loadQuantified();
    let analysis: AnalyzeReplyResult;
    try {
      analysis = await analyzeReply(thread, quantifiedList);
    } catch (err) {
      // analyzer는 내부 fallback을 가지므로 throw는 이론상 거의 없음.
      // 혹시라도 throw되면 UI를 멈추지 않도록 기본 follow_up으로 복구.
      console.error(`${LOG_TAG} analyzeReply threw unexpectedly:`, err);
      analysis = {
        action: "follow_up",
        reason: "분석 요청이 실패했습니다. 다시 답변해 주시면 재시도합니다.",
        followUpQuestion: "조금 더 자세히 설명해 주실 수 있나요?",
      };
    }
    console.log(`${LOG_TAG} analysis done; action=${analysis.action}`);

    // 4. action에 따른 후속 처리 (각 단계 저장 결과 검증 + 로깅)
    if (analysis.action === "completed") {
      const statusOk = await updateThreadStatus(
        recordId,
        threadId,
        "completed",
        analysis.reason
      );
      if (!statusOk) {
        console.error(`${LOG_TAG} updateThreadStatus(completed) failed`, { recordId, threadId });
      }
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
      console.log(`${LOG_TAG} completed: quantified saved`, { quantifiedId: quantified.id });
    } else if (analysis.action === "impossible") {
      const statusOk = await updateThreadStatus(
        recordId,
        threadId,
        "impossible",
        analysis.reason
      );
      if (!statusOk) {
        console.error(`${LOG_TAG} updateThreadStatus(impossible) failed`, { recordId, threadId });
      }
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
      console.log(`${LOG_TAG} impossible: quantified saved`, { quantifiedId: quantified.id });
    } else {
      // follow_up (analyzer가 followUpQuestion 기본값을 보장하지만 한번 더 방어)
      const followUp = analysis.followUpQuestion?.trim() || "조금 더 자세히 설명해 주실 수 있나요?";
      const systemReply: QAReply = {
        id: crypto.randomUUID(),
        author: "system",
        content: followUp,
        createdAt: new Date().toISOString(),
      };
      const sysOk = await addReplyToThread(recordId, threadId, systemReply);
      if (!sysOk) {
        console.error(`${LOG_TAG} addReplyToThread(system) failed`, { recordId, threadId });
      } else {
        console.log(`${LOG_TAG} follow_up: system reply added`, { systemReplyId: systemReply.id });
      }
    }

    return NextResponse.json({
      success: true,
      reply,
      analysis,
    });
  } catch (error) {
    console.error(`${LOG_TAG} POST error:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "답변 처리 실패" },
      { status: 500 }
    );
  }
}

/**
 * qaThread 내의 reply content 수정 또는 thread title 수정
 * - { recordId, threadId, replyId, content } : 해당 reply의 content 수정
 * - { recordId, threadId, title } : 해당 thread의 title 수정
 */
export async function PATCH(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      recordId?: string;
      threadId?: string;
      replyId?: string;
      content?: string;
      title?: string;
    };
    const { recordId, threadId, replyId, content, title } = body;

    if (!recordId || !threadId) {
      return NextResponse.json(
        { error: "recordId, threadId가 필요합니다." },
        { status: 400 }
      );
    }

    // reply content 수정
    if (replyId) {
      if (typeof content !== "string" || !content.trim()) {
        return NextResponse.json(
          { error: "content가 필요합니다." },
          { status: 400 }
        );
      }
      const ok = await updateReplyContent(recordId, threadId, replyId, content.trim());
      if (!ok) {
        return NextResponse.json(
          { error: "reply를 찾을 수 없습니다." },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true });
    }

    // thread title 수정
    if (typeof title === "string") {
      const ok = await updateThreadTitle(recordId, threadId, title.trim());
      if (!ok) {
        return NextResponse.json(
          { error: "스레드를 찾을 수 없습니다." },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: "replyId+content 또는 title 중 하나가 필요합니다." },
      { status: 400 }
    );
  } catch (error) {
    console.error(`${LOG_TAG} PATCH error:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수정 실패" },
      { status: 500 }
    );
  }
}
