/**
 * 매집 스캔 cron — 매일 KST 07:00 (월~금).
 * Vercel Cron은 GET 요청을 보내므로 반드시 GET으로 export.
 */

import { NextResponse } from "next/server";
import { runAccumulationScan, saveAccumulationScan } from "@/lib/accumulation-scan";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runAccumulationScan();
    await saveAccumulationScan(result);
    return NextResponse.json({
      ok: true,
      asOfDate: result.asOfDate,
      signalCount: result.signalCount,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
