import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

const ACCESS_KEY = "8384";
/** 브라우저에서 이미 줄여 보내지만, 서버에서도 한 번 막는다 */
const MAX_BYTES = 5 * 1024 * 1024;

// 사진 업로드는 네트워크 왕복이 있다
export const maxDuration = 60;

function checkAuth(request: NextRequest): boolean {
  return request.headers.get("x-sb-key") === ACCESS_KEY;
}

/** 경로에 쓸 수 없는 문자를 걷어낸다 */
function safeFileName(name: string): string {
  const trimmed = name.trim().toLowerCase();
  const cleaned = trimmed.replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned.slice(0, 60) : "photo.jpg";
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        {
          error:
            "사진 저장소가 설정되지 않았습니다. 환경변수 BLOB_READ_WRITE_TOKEN을 추가해 주세요.",
        },
        { status: 500 }
      );
    }

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "사진이 없습니다." },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "사진이 너무 큽니다. 5MB 이하만 올릴 수 있습니다." },
        { status: 400 }
      );
    }

    const blob = await put(
      `second-brain/${Date.now()}-${safeFileName(file.name)}`,
      file,
      { access: "public" }
    );

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    console.error("[second-brain] notes upload error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `사진을 올리지 못했습니다: ${detail}` },
      { status: 500 }
    );
  }
}
