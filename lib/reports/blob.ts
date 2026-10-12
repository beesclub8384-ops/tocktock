import { get, put } from "@vercel/blob";

/**
 * 보고서 원문 Vercel Blob 저장 (설계서 7장)
 *
 * - private 저장소. 브라우저에서 직접 열 수 없고 /api/reports/[id]/file 을 거친다.
 * - Hobby 포함량: 저장 1GB/월, 고급 작업 2,000회/월, 전송 10GB.
 *   **넘으면 30일간 Blob 사용이 막힌다.** 그래서 파일 크기를 기록해 화면에 합계를 띄운다.
 */

/** 파일 하나 상한 (바이트). 이보다 크면 저장하지 않고 오류로 남긴다 */
export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB

export type FileType = "pdf" | "html";

function requireToken(): void {
  // 없으면 put/get 이 모호한 메시지로 실패한다. 원인을 바로 알 수 있게 먼저 막는다
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN 환경변수 미설정 — 원문을 저장할 수 없음");
  }
}

export async function saveOriginal(
  sourceId: string,
  editionKey: string,
  body: ArrayBuffer,
  fileType: FileType
): Promise<{ url: string; size: number }> {
  requireToken();
  const pathname = `reports/${sourceId}/${editionKey}.${fileType}`;
  const blob = await put(pathname, Buffer.from(body), {
    access: "private",
    contentType: fileType === "pdf" ? "application/pdf" : "text/html; charset=utf-8",
    addRandomSuffix: false,
    // Blob 저장 후 Redis 저장이 실패하면 seen 에 안 들어가 다음 날 같은 경로로 다시 올린다
    allowOverwrite: true,
  });
  return { url: blob.url, size: body.byteLength };
}

export async function readOriginal(blobUrl: string) {
  requireToken();
  return get(blobUrl, { access: "private" });
}
