import { NextRequest, NextResponse } from "next/server";
import { analyzeSymbol, buildCandidateSymbols } from "@/lib/dcf-engine";

export const revalidate = 3600; // 1시간 캐싱

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;

  if (!/^[A-Za-z0-9.\-^=]{1,20}$/.test(symbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  const candidates = buildCandidateSymbols(decodeURIComponent(symbol));
  if (candidates.length === 0) {
    return NextResponse.json({ error: "Empty symbol" }, { status: 400 });
  }

  try {
    const result = await analyzeSymbol(symbol.toUpperCase(), candidates);
    if ("error" in result) {
      return NextResponse.json(result, { status: 404 });
    }
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("DCF analyze error:", error);
    return NextResponse.json(
      { error: "Failed to analyze symbol" },
      { status: 500 }
    );
  }
}
