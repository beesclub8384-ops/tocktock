import { NextRequest, NextResponse } from "next/server";
import {
  getMarketAttractiveness,
  analyzeStock,
  screenTopStocks,
} from "@/lib/korea-market-engine";

export const revalidate = 21600; // 6시간

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "market";

  try {
    if (type === "market") {
      const data = await getMarketAttractiveness();
      return NextResponse.json(data, {
        headers: {
          "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
        },
      });
    }

    if (type === "stock") {
      const symbol = searchParams.get("symbol");
      if (!symbol || !/^[A-Za-z0-9.\-]{1,20}$/.test(symbol)) {
        return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
      }
      const data = await analyzeStock(symbol.toUpperCase());
      if ("error" in data) {
        return NextResponse.json(data, { status: 404 });
      }
      return NextResponse.json(data, {
        headers: {
          "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
        },
      });
    }

    if (type === "screening") {
      const market = searchParams.get("market");
      if (market !== "kospi" && market !== "kosdaq") {
        return NextResponse.json({ error: "market must be 'kospi' or 'kosdaq'" }, { status: 400 });
      }
      const top = Math.min(30, Math.max(1, parseInt(searchParams.get("top") ?? "10", 10) || 10));
      const data = await screenTopStocks(market, top);
      return NextResponse.json(data, {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
        },
      });
    }

    return NextResponse.json(
      { error: "Invalid type. Use 'market', 'stock', or 'screening'." },
      { status: 400 },
    );
  } catch (error) {
    console.error("[korea-market] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 },
    );
  }
}
