import { redirect } from "next/navigation";

// 메인 화면을 섹터별 현황으로 변경 (뉴스는 /news로 그대로 유지, 메뉴에서 접근 가능)
export default function Home() {
  redirect("/sectors");
}
