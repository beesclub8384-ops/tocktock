import { NextRequest, NextResponse } from "next/server";
import { calculateGrowthScore } from "@/lib/stock-score";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;

  try {
    const result = await calculateGrowthScore(symbol.toUpperCase());
    return NextResponse.json(result);
  } catch (error) {
    console.error("Growth score error:", error);
    return NextResponse.json(
      { error: "Failed to calculate growth score" },
      { status: 500 }
    );
  }
}
