import { NextRequest, NextResponse } from "next/server";
import {
  loadMessages,
  addMessage,
  deleteMessage,
} from "@/lib/futures-trading-store";

const PASSWORD = "8384";

function checkAuth(request: NextRequest): boolean {
  return request.headers.get("x-password") === PASSWORD;
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const messages = await loadMessages();
    return NextResponse.json({ messages });
  } catch (error) {
    console.error("[futures-messages] GET error:", error);
    return NextResponse.json({ error: "불러오기 실패" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { author, content } = await request.json();
    if (!author || !content?.trim()) {
      return NextResponse.json({ error: "작성자와 내용이 필요합니다." }, { status: 400 });
    }
    if (author !== "태양" && author !== "용태") {
      return NextResponse.json({ error: "작성자는 태양 또는 용태만 가능합니다." }, { status: 400 });
    }
    const item = await addMessage(author, content.trim());
    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error("[futures-messages] POST error:", error);
    return NextResponse.json({ error: "메시지 등록 실패" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await request.json();
    const ok = await deleteMessage(id);
    if (!ok) {
      return NextResponse.json({ error: "메시지를 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[futures-messages] DELETE error:", error);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
