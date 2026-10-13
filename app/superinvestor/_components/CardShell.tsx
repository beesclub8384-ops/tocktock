"use client";

import type { ReactNode } from "react";
import { MONO } from "../_lib/format";
import { WhyRow } from "./WhyRow";

export const CARD_COUNT = 6;

// 카드별 강조색 (라이트 / 다크). emerald·amber 는 흰 배경 대비(WCAG AA) 때문에 라이트만 700
export const ACCENT = {
  buy: { text: "text-emerald-700 dark:text-emerald-400", bar: "bg-emerald-500 dark:bg-emerald-400" },
  discount: { text: "text-red-600 dark:text-red-400", bar: "bg-red-500 dark:bg-red-400" },
  insider: { text: "text-amber-700 dark:text-amber-400", bar: "bg-amber-500 dark:bg-amber-400" },
  portfolio: { text: "text-blue-600 dark:text-blue-400", bar: "bg-blue-500 dark:bg-blue-400" },
  neutral: { text: "text-muted-foreground", bar: "bg-foreground" },
} as const;

export type Accent = keyof typeof ACCENT;

interface CardShellProps {
  index: number;
  tag: string;
  accent: Accent;
  headline: ReactNode;
  /** 표지처럼 헤드라인을 더 크게 */
  headlineClassName?: string;
  children?: ReactNode;
  why?: { summary: string; detail: string };
  /** 맨 아래 버튼 (전부 보기 / 처음으로 등) */
  footer?: ReactNode;
}

/**
 * 카드 한 장의 공통 틀.
 * 모바일: 화면 한 장을 꽉 채우고 테두리 없음. PC(lg): 가운데 600px 카드.
 * 모바일 하단 여백이 큰 이유: 사이트 공용 고정 버튼(사이드바·TradingView·단타 기록)이
 * 화면 아래 120px 안쪽에 떠 있어서, 하단 여백 128px 로 그 위에 버튼이 오게 한다.
 */
export function CardShell({
  index,
  tag,
  accent,
  headline,
  headlineClassName = "text-[28px]",
  children,
  why,
  footer,
}: CardShellProps) {
  return (
    <section
      id={`card-${index}`}
      tabIndex={-1}
      data-card-index={index}
      aria-label={`${index + 1}번째 카드: ${tag}`}
      className="flex min-h-[calc(100dvh-88px)] snap-start outline-none lg:px-8 lg:py-10"
    >
      <div className="mx-auto flex w-full max-w-[600px] flex-col gap-4 break-keep px-5 pt-5 pb-[128px] lg:my-auto lg:gap-5 lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:p-8">
        <div className="flex items-center justify-between gap-3">
          <span className={`text-xs font-bold ${ACCENT[accent].text}`}>{tag}</span>
          <span className="text-xs text-muted-foreground tabular-nums" style={MONO}>
            {index + 1} / {CARD_COUNT}
          </span>
        </div>

        <h2 className={`line-clamp-2 font-bold leading-tight tracking-tight ${headlineClassName}`}>
          {headline}
        </h2>

        {children}

        <div className="flex-1" aria-hidden />

        {why && <WhyRow summary={why.summary} detail={why.detail} />}
        {footer}
      </div>
    </section>
  );
}

/** 카드 맨 아래 공통 버튼 모양 */
export function FooterButton({
  children,
  onClick,
  href,
  onNavigate,
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  onNavigate?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  const cls =
    "flex min-h-12 w-full items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold transition-colors hover:bg-accent";
  if (href) {
    return (
      <a href={href} onClick={onNavigate} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}
