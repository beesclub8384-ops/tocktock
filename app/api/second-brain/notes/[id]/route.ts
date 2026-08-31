import { NextRequest, NextResponse } from "next/server";
import { deleteNote, loadNote, saveNote } from "@/lib/second-brain-notes";

const ACCESS_KEY = "8384";

function checkAuth(request: NextRequest): boolean {
  return request.headers.get("x-sb-key") === ACCESS_KEY;
}

// Next.js 15부터 params는 Promise다. 반드시 await 해야 한다
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const note = await loadNote(id);
    if (!note) {
      return NextResponse.json(
        { error: "노트를 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    return NextResponse.json({ note });
  } catch (error) {
    console.error("[second-brain] note GET error:", error);
    return NextResponse.json(
      { error: "노트를 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const note = await loadNote(id);
    if (!note) {
      return NextResponse.json(
        { error: "노트를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const body = (await request.json()) as {
      title?: string;
      body?: string;
      images?: string[];
    };

    if (typeof body.title === "string") note.title = body.title;
    if (typeof body.body === "string") note.body = body.body;
    if (Array.isArray(body.images)) {
      note.images = body.images.filter(
        (url): url is string => typeof url === "string"
      );
    }
    note.updatedAt = Date.now();

    await saveNote(note);
    return NextResponse.json({ note });
  } catch (error) {
    console.error("[second-brain] note PATCH error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    await deleteNote(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[second-brain] note DELETE error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
