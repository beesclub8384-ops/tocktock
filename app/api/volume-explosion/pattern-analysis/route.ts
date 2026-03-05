import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const filePath = join(
      process.cwd(),
      "data",
      "krx-history",
      "institutional-entry-analysis.json"
    );
    const raw = await readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "패턴 분석 데이터를 찾을 수 없습니다." },
      { status: 404 }
    );
  }
}
