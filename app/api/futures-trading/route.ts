import { NextRequest, NextResponse } from "next/server";
import {
  loadRecords,
  addRecord,
  deleteRecord,
} from "@/lib/futures-trading-store";
import type { FuturesRecord } from "@/lib/types/futures-trading";

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
    return NextResponse.json({ success: true, record });
  } catch (error) {
    console.error("[futures-trading] POST error:", error);
    return NextResponse.json(
      { error: "기록 추가에 실패했습니다." },
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
