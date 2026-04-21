import { NextRequest, NextResponse } from "next/server";
import { loadQuantified } from "@/lib/futures-trading-store";

const PASSWORD = "8384";

function checkAuth(request: NextRequest): boolean {
  return request.headers.get("x-password") === PASSWORD;
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const list = await loadQuantified();
    return NextResponse.json({ items: list });
  } catch (error) {
    console.error("[futures-trading/quantified] GET error:", error);
    return NextResponse.json(
      { error: "불러오기 실패" },
      { status: 500 }
    );
  }
}
