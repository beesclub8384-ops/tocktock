import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
