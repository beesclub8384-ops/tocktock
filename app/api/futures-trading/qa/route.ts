import { NextRequest, NextResponse } from "next/server";
import {
  loadQA,
  addQuestion,
  answerQuestion,
  deleteQuestion,
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
    const qa = await loadQA();
    return NextResponse.json({ qa });
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
    const { question } = await request.json();
    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "질문 내용이 필요합니다." }, { status: 400 });
    }
    const item = await addQuestion(question.trim());
    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error("[futures-qa] POST error:", error);
    return NextResponse.json({ error: "질문 등록 실패" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id, answer } = await request.json();
    if (!id || typeof answer !== "string") {
      return NextResponse.json({ error: "id와 answer가 필요합니다." }, { status: 400 });
    }
    const ok = await answerQuestion(id, answer.trim());
    if (!ok) {
      return NextResponse.json({ error: "해당 질문을 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[futures-qa] PATCH error:", error);
    return NextResponse.json({ error: "답변 등록 실패" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await request.json();
    const ok = await deleteQuestion(id);
    if (!ok) {
      return NextResponse.json({ error: "해당 질문을 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[futures-qa] DELETE error:", error);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
