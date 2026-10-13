"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { formatKst, MONO } from "../_lib/format";
import type { QuarterInfo } from "../_lib/quarter";
import { ACCENT, type Accent, CardShell } from "./CardShell";

type Navigate = (e: React.MouseEvent<HTMLAnchorElement>) => void;

export function CoverCard({
  quarter,
  managerCount,
  consensusCount,
  discountCount,
  insiderCount,
  lastUpdated,
  onNavigate,
}: {
  quarter: QuarterInfo;
  managerCount: number;
  consensusCount: number;
  discountCount: number;
  insiderCount: number;
  lastUpdated: string;
  onNavigate: Navigate;
}) {
  const menus: { href: string; label: string; count: number; accent: Accent }[] = [
    { href: "#card-1", label: "2명 이상이 같이 산 종목", count: consensusCount, accent: "buy" },
    { href: "#card-2", label: "분기말보다 싸진 종목", count: discountCount, accent: "discount" },
    { href: "#card-3", label: "내부자도 같이 산 종목", count: insiderCount, accent: "insider" },
  ];

  return (
    <CardShell
      index={0}
      tag={`${quarter.label} 공시 기준`}
      accent="neutral"
      headlineClassName="text-[34px]"
      headline={
        managerCount > 0
          ? `거물 ${managerCount}명의 장바구니를 열어봤어요`
          : "거물들의 장바구니를 열어봤어요"
      }
      footer={
        <p className="text-xs leading-relaxed text-muted-foreground">
          SEC 13F 공시(Dataroma 제공) 기준 · 투자 권유가 아니에요
          {lastUpdated && (
            <>
              <br />
              수집 시각 {formatKst(lastUpdated)}
            </>
          )}
        </p>
      }
    >
      <p className="text-[15px] leading-relaxed text-muted-foreground">
        {quarter.endLabel} 기준 보유 현황이에요. 세 가지만 보면 돼요.
      </p>

      <nav aria-label="카드 바로가기" className="flex flex-col gap-2.5">
        {menus.map((m) => (
          <a
            key={m.href}
            href={m.href}
            onClick={onNavigate}
            className="flex min-h-16 items-center justify-between gap-3 rounded-[14px] border border-border bg-card px-4 transition-colors hover:bg-accent"
          >
            <span className="flex items-center gap-1 text-[15px] font-medium">
              {m.label}
              <ChevronRight size={16} className="text-muted-foreground" aria-hidden />
            </span>
            <span className={`text-[22px] font-semibold tabular-nums ${ACCENT[m.accent].text}`} style={MONO}>
              {m.count}
            </span>
          </a>
        ))}
      </nav>

      <p className="mt-2 flex items-center justify-center gap-1 text-sm text-muted-foreground lg:hidden">
        <ChevronDown size={18} className="motion-safe:animate-bounce" aria-hidden />
        아래로 넘겨서 보세요
      </p>
    </CardShell>
  );
}
