import { NextRequest, NextResponse } from "next/server";
import { createRoot, deleteTree, loadRoots } from "@/lib/second-brain";

const ACCESS_KEY = "8384";

function checkAuth(request: NextRequest): boolean {
  return request.headers.get("x-sb-key") === ACCESS_KEY;
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const conv = await createRoot();
    return NextResponse.json({ convId: conv.id });
  } catch (error) {
    console.error("[second-brain] root POST error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}

/** 주제(나무) 하나를 통째로 삭제한다 */
export async function DELETE(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { rootId?: string };
    const rootId = body.rootId?.trim();

    if (!rootId) {
      return NextResponse.json(
        { error: "삭제할 주제가 지정되지 않았습니다." },
        { status: 400 }
      );
    }

    // 가지 id로는 지울 수 없다. 반드시 뿌리여야 한다
    const roots = await loadRoots();
    if (!roots.includes(rootId)) {
      return NextResponse.json(
        { error: "주제(줄기)만 삭제할 수 있습니다." },
        { status: 400 }
      );
    }

    await deleteTree(rootId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[second-brain] root DELETE error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
