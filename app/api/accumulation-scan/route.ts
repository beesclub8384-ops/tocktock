import { NextResponse } from "next/server";
import { loadAccumulationScan } from "@/lib/accumulation-scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await loadAccumulationScan();
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "데이터 준비 중" },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true, data });
}
