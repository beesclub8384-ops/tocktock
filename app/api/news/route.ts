import { NextResponse } from "next/server";
import { getAllNews } from "@/lib/news-rss";

export async function GET() {
  try {
    const news = await getAllNews();
    return NextResponse.json(
      { news },
      { headers: { "Cache-Control": "public, max-age=1800" } }
    );
  } catch (error) {
    console.error("[news] API error:", error);
    return NextResponse.json({ news: [] }, { status: 500 });
  }
}
