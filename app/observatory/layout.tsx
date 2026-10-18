/**
 * 관측소 공통 레이아웃 — 하단 여백만 더한다.
 *
 * 사이트 공통 플로팅 버튼(단타 기록 · 트레이딩뷰 · 사이드바)은 화면 아래에 고정돼 있어, 스크롤 중에는
 * 그 자리에 오는 본문을 늘 가린다(버튼 자체는 건드리지 않기로 했다). 이 여백은 본문 마지막 문단을
 * 버튼 높이보다 위로 올려 끝까지 읽을 수 있게 하는 용도다.
 * 버튼 높이(실측, components/*): 모바일 바닥에서 최대 약 120px(4.5rem + 48px), 데스크톱 약 136px → 160px.
 *
 * ⚠ 독립 검증에서 확인된 사실: 루트 레이아웃이 본문 뒤에 푸터(약 286px)를 두기 때문에, 이 여백이 없어도
 *   끝까지 내리면 본문 마지막 문단은 버튼보다 위에 있었다. 실제로 겹치는 것은 모바일 **푸터의 저작권 줄**과
 *   단타 기록 버튼이다. 이것은 사이트 전체 문제라 관측소 레이아웃으로는 고칠 수 없다(남은 위험으로 기록).
 */
import { NyFedNotice } from "./source-notices";

export default function ObservatoryLayout({ children }: { children: React.ReactNode }) {
  // 뉴욕 연은 이용 약관이 요구하는 고지 (source-notices.tsx) — 목록·섹션 카드에도 그 자료가 나와 모든 관측소 페이지에 둔다.
  // FRED 고지는 미션 5부터 FRED 자료가 보이는 페이지에서만 그린다(FredNotice keys).
  return (
    <div className="pb-40">
      {children}
      <NyFedNotice />
    </div>
  );
}
