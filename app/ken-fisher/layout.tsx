import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "켄 피셔 | TockTock",
  description:
    "켄 피셔의 『불변의 차트 90』 기준을 현재 시장에 적용한 차트 모음",
};

export default function KenFisherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
