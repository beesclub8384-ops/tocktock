import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { GrowthScorePanel } from "@/components/growth-score-panel";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TockTock - 주식 정보 공유",
  description: "실시간 주식 정보를 공유하고 투자 인사이트를 나누는 커뮤니티 플랫폼",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Navbar />
        <div className="flex">
          <aside className="hidden lg:block w-72 shrink-0 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto border-r border-border/40 p-3">
            <GrowthScorePanel />
          </aside>
          <main className="min-h-screen flex-1">{children}</main>
        </div>
        <Footer />
      </body>
    </html>
  );
}
