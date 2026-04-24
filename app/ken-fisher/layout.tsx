import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Sans_KR, JetBrains_Mono } from "next/font/google";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "600", "800"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});

const ibmPlex = IBM_Plex_Sans_KR({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-ibm-plex",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-jetbrains",
  display: "swap",
});

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
  return (
    <div
      className={`${fraunces.variable} ${ibmPlex.variable} ${jetbrains.variable}`}
      style={
        {
          "--kf-bg": "#0f1115",
          "--kf-bg-2": "#161922",
          "--kf-ink": "#e8e6e1",
          "--kf-ink-dim": "#8a8f99",
          "--kf-accent-dow": "#d4a574",
          "--kf-accent-sp": "#6ba3d6",
          "--kf-accent-nas": "#c87da8",
          "--kf-danger": "#e06c5e",
          "--kf-success": "#7fb685",
          "--kf-border": "#2a2e3a",
          "--kf-surface": "#1b1f2a",
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}
