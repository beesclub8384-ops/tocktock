import { NextRequest, NextResponse } from "next/server";
import { loadRoots, loadTree } from "@/lib/second-brain";

const ACCESS_KEY = "8384";

function checkAuth(request: NextRequest): boolean {
  return request.headers.get("x-sb-key") === ACCESS_KEY;
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [roots, tree] = await Promise.all([loadRoots(), loadTree()]);
    return NextResponse.json({ roots, tree });
  } catch (error) {
    console.error("[second-brain] tree GET error:", error);
    return NextResponse.json(
      { error: "트리를 불러올 수 없습니다." },
      { status: 500 }
    );
  }
}
