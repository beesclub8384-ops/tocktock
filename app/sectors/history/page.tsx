import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// 섹터 없는 경로(/sectors/history)로 오면 섹터별 현황으로 리다이렉트
export default function SectorHistoryIndexRedirect() {
  redirect("/sectors");
}
