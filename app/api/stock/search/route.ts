import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");
  if (!query || query.length < 1) {
    return NextResponse.json({ results: [] });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yahooFinance.search(query, {
      quotesCount: 8,
      newsCount: 0,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = (result.quotes || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((q: any) =>
        q.symbol &&
        (q.quoteType === "EQUITY" || q.quoteType === "INDEX" || q.quoteType === "ETF")
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((q: any) => ({
        symbol: q.symbol as string,
        name: (q.shortname || q.longname || q.symbol) as string,
        exchange: (q.exchDisp || q.exchange || "") as string,
        type: (q.quoteType || "EQUITY") as string,
      }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json({ results: [] });
  }
}
