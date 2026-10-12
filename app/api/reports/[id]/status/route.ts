import { NextResponse } from "next/server";
import { updateStatus } from "@/lib/reports/store";
import { REPORT_STATUSES, type ReportStatus } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

/**
 * 보고서 상태 변경 (new → studying → done)
 * 인증은 proxy.ts 의 HTTP Basic 인증이 맡는다 (/api/reports/*).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);

  let status: unknown;
  try {
    status = ((await request.json()) as { status?: unknown }).status;
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다" }, { status: 400 });
  }
  if (!REPORT_STATUSES.includes(status as ReportStatus)) {
    return NextResponse.json({ error: `status 는 ${REPORT_STATUSES.join(", ")} 중 하나` }, { status: 400 });
  }

  const updated = await updateStatus(id, status as ReportStatus);
  if (!updated) return NextResponse.json({ error: "보고서를 찾을 수 없습니다" }, { status: 404 });
  return NextResponse.json({ id, status: updated.status });
}
