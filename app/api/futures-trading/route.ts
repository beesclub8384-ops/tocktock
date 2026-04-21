import { NextRequest, NextResponse } from "next/server";
import {
  loadRecords,
  addRecord,
  deleteRecord,
  updateMemo,
  loadQuantified,
  appendThreadsToRecord,
} from "@/lib/futures-trading-store";
import type { FuturesRecord, QAThread } from "@/lib/types/futures-trading";
import { generateQAThreads } from "@/lib/futures-claude-analyzer";

const PASSWORD = "8384";

function checkAuth(request: NextRequest): boolean {
  const pw = request.headers.get("x-password");
  return pw === PASSWORD;
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const records = await loadRecords();
    return NextResponse.json({ records });
  } catch (error) {
    console.error("[futures-trading] GET error:", error);
    return NextResponse.json(
      { error: "데이터를 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const record: FuturesRecord = {
      id: crypto.randomUUID(),
      date: body.date,
      direction: body.direction,
      entryTime: body.entryTime,
      entryPoint: Number(body.entryPoint),
      exitTime: body.exitTime,
      exitPoint: Number(body.exitPoint),
      contracts: Number(body.contracts),
      pnl: Number(body.pnl),
      memo: body.memo || "",
      createdAt: new Date().toISOString(),
    };

    await addRecord(record);

    // 메모가 있으면 자동으로 qaThread 생성
    let generatedCount = 0;
    if (record.memo.trim()) {
      try {
        const quantifiedList = await loadQuantified();
        const generated = await generateQAThreads(record.memo, quantifiedList);
        if (generated.length) {
          const now = new Date().toISOString();
          const threads: QAThread[] = generated.map((g) => ({
            id: crypto.randomUUID(),
            title: g.title,
            status: "open",
            createdAt: now,
            replies: [],
          }));
          await appendThreadsToRecord(record.id, threads);
          generatedCount = threads.length;
        }
      } catch (err) {
        console.error("[futures-trading] generateQAThreads failed:", err);
      }
    }

    return NextResponse.json({ success: true, record, generatedThreads: generatedCount });
  } catch (error) {
    console.error("[futures-trading] POST error:", error);
    return NextResponse.json(
      { error: "기록 추가에 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, memo } = await request.json();
    if (!id || typeof memo !== "string") {
      return NextResponse.json(
        { error: "id와 memo가 필요합니다." },
        { status: 400 }
      );
    }
    const updated = await updateMemo(id, memo);
    if (!updated) {
      return NextResponse.json(
        { error: "해당 기록을 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[futures-trading] PATCH error:", error);
    return NextResponse.json(
      { error: "메모 수정에 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await request.json();
    const deleted = await deleteRecord(id);
    if (!deleted) {
      return NextResponse.json(
        { error: "해당 기록을 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[futures-trading] DELETE error:", error);
    return NextResponse.json(
      { error: "삭제에 실패했습니다." },
      { status: 500 }
    );
  }
}
