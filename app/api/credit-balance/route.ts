import { NextResponse } from "next/server";
import { fetchCreditBalanceData } from "@/lib/fetch-credit-balance";

export async function GET() {
  try {
    const data = await fetchCreditBalanceData({
      beginBasDt: "20211101",
      numOfRows: 1200,
    });
    return NextResponse.json({ data });
  } catch (error) {
    console.error("Credit balance API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch credit balance data" },
      { status: 500 }
    );
  }
}
