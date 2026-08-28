import { NextRequest, NextResponse } from "next/server";
import { createBranch, SB_ROOT_ID } from "@/lib/second-brain";

const ACCESS_KEY = "8384";

function checkAuth(request: NextRequest): boolean {
  return request.headers.get("x-sb-key") === ACCESS_KEY;
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      parentId?: string;
      parentMessageTs?: number;
      title?: string;
    };

    const parentId = body.parentId?.trim() || SB_ROOT_ID;
    const parentMessageTs = body.parentMessageTs;
    const title = body.title?.trim();

    if (typeof parentMessageTs !== "number" || !Number.isFinite(parentMessageTs)) {
      return NextResponse.json(
        { error: "가지를 뻗을 메시지가 지정되지 않았습니다." },
        { status: 400 }
      );
    }
    if (!title) {
      return NextResponse.json(
        { error: "가지 이름이 비어 있습니다." },
        { status: 400 }
      );
    }

    const branch = await createBranch(parentId, parentMessageTs, title);
    return NextResponse.json({ convId: branch.id });
  } catch (error) {
    console.error("[second-brain] branch POST error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
