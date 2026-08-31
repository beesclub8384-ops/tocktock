import { NextRequest, NextResponse } from "next/server";
import { createRoot } from "@/lib/second-brain";

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
