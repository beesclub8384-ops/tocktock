import { NextRequest, NextResponse } from "next/server";
import { loadTradingPattern } from "@/lib/futures-trading-store";

const PASSWORD = "8384";

function checkAuth(request: NextRequest): boolean {
  return request.headers.get("x-password") === PASSWORD;
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pattern = await loadTradingPattern();
    return NextResponse.json({ pattern });
  } catch (error) {
    console.error("[futures-trading/pattern] GET error:", error);
    return NextResponse.json(
      { error: "패턴 조회 실패" },
      { status: 500 }
    );
  }
}
