import { NextRequest, NextResponse } from "next/server";
import { createNote, listNotes } from "@/lib/second-brain-notes";

const ACCESS_KEY = "8384";

function checkAuth(request: NextRequest): boolean {
  return request.headers.get("x-sb-key") === ACCESS_KEY;
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const notes = await listNotes();
    return NextResponse.json({ notes });
  } catch (error) {
    console.error("[second-brain] notes GET error:", error);
    return NextResponse.json(
      { error: "노트 목록을 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const note = await createNote();
    return NextResponse.json({ id: note.id });
  } catch (error) {
    console.error("[second-brain] notes POST error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
