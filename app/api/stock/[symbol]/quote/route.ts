import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;

  try {
    const result = await yahooFinance.quote(symbol.toUpperCase());
    const quote = result as unknown as {
      regularMarketPrice?: number;
      regularMarketChange?: number;
      regularMarketChangePercent?: number;
      shortName?: string;
    };

    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      price: quote.regularMarketPrice ?? null,
      change: quote.regularMarketChange ?? null,
      changePercent: quote.regularMarketChangePercent ?? null,
      name: quote.shortName ?? symbol.toUpperCase(),
    });
  } catch (error) {
    console.error("Yahoo Finance quote error:", error);
    return NextResponse.json(
      { error: "Failed to fetch quote" },
      { status: 500 }
    );
  }
}
