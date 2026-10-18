import { NextResponse } from "next/server";
import { BTC_ALERT_PCTILE, BTC_CAUTION_PCTILE } from "@/lib/observatory-constants";
import { buildAuctionResponse } from "@/lib/observatory-auction-response";

export type { AuctionMetricResponse } from "@/lib/observatory-auction-response";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json(await buildAuctionResponse("btc", BTC_CAUTION_PCTILE, BTC_ALERT_PCTILE));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
