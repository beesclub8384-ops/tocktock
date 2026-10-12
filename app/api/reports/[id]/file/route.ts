import { NextResponse } from "next/server";
import { readOriginal } from "@/lib/reports/blob";
import { getRecord } from "@/lib/reports/store";

export const dynamic = "force-dynamic";

/**
 * 원문 내려받기 — private Blob 은 브라우저에서 바로 못 열어 서버를 거친다.
 * 인증은 proxy.ts 의 비밀번호 쿠키 확인이 맡는다 (/api/reports/*).
 * ⚠ 이 경로로 나가는 바이트가 Blob 전송 한도(Hobby 월 10GB)에 잡힌다.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);

  const record = await getRecord(id);
  if (!record?.blobUrl) {
    return NextResponse.json({ error: "저장된 원문이 없습니다" }, { status: 404 });
  }

  try {
    const blob = await readOriginal(record.blobUrl);
    if (!blob || blob.statusCode !== 200) {
      return NextResponse.json({ error: "Blob 에서 원문을 찾을 수 없습니다" }, { status: 404 });
    }
    const ext = record.fileType ?? "pdf";
    // 헤더에 그대로 들어가므로 영문·숫자·-·_ 외에는 걸러 낸다 (slug 는 사이트가 정한다)
    const filename = `${record.sourceId}-${record.editionKey}`.replace(/[^A-Za-z0-9_-]/g, "-") + `.${ext}`;
    return new Response(blob.stream, {
      headers: {
        "Content-Type": blob.blob.contentType,
        "Content-Length": String(blob.blob.size),
        // PDF 는 브라우저에서 바로 열리게 inline. 파일명은 저장할 때 쓰인다
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[reports/file] 원문 읽기 실패:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
