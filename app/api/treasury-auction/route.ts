import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

const CACHE_KEY = "treasury:auctions";
const CACHE_TTL = 1800; // 30분

const PICK_FIELDS = [
  "cusip",
  "securityType",
  "term",
  "auctionDate",
  "maturityDate",
  "offeringAmount",
  "highYield",
  "highDiscountRate",
  "highInvestmentRate",
  "bidToCoverRatio",
  "totalTendered",
  "totalAccepted",
  "indirectBidderAccepted",
  "interestRate",
  "tips",
  "floatingRate",
] as const;

type AuctionItem = Record<(typeof PICK_FIELDS)[number], string>;

function pick(raw: Record<string, string>): AuctionItem {
  const out = {} as Record<string, string>;
  for (const k of PICK_FIELDS) out[k] = raw[k] ?? "";
  return out as AuctionItem;
}

export async function GET() {
  try {
    const cached = await redis.get<{
      upcoming: AuctionItem[];
      results: AuctionItem[];
      updatedAt: string;
    }>(CACHE_KEY);

    if (cached) {
      return NextResponse.json(cached);
    }

    const now = new Date();
    const endDate = now.toISOString().slice(0, 10);
    const past = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const startDate = past.toISOString().slice(0, 10);

    const [upcomingRes, resultsRes] = await Promise.allSettled([
      fetch(
        "https://www.treasurydirect.gov/TA_WS/securities/upcoming?format=json",
        { signal: AbortSignal.timeout(10000) },
      ),
      fetch(
        `https://www.treasurydirect.gov/TA_WS/securities/search?startDate=${startDate}&endDate=${endDate}&dateFieldName=auctionDate&format=json`,
        { signal: AbortSignal.timeout(10000) },
      ),
    ]);

    const upcomingRaw: Record<string, string>[] =
      upcomingRes.status === "fulfilled" ? await upcomingRes.value.json() : [];
    const resultsRaw: Record<string, string>[] =
      resultsRes.status === "fulfilled" ? await resultsRes.value.json() : [];

    const upcoming = upcomingRaw.map(pick);
    const results = resultsRaw
      .filter((r) => r.bidToCoverRatio && r.bidToCoverRatio !== "")
      .map(pick);

    const data = {
      upcoming,
      results,
      updatedAt: now.toISOString(),
    };

    try {
      await redis.set(CACHE_KEY, data, { ex: CACHE_TTL });
    } catch { /* cache write fail ok */ }

    return NextResponse.json(data);
  } catch (e) {
    console.error("treasury-auction API error:", e);
    return NextResponse.json(
      { error: "Failed to fetch treasury auction data" },
      { status: 500 },
    );
  }
}
