"use client";

import { useMemo, useState } from "react";
import type { InsiderStock } from "@/lib/types/superinvestor";
import { cleanText, formatLargeUSD, MONO } from "../_lib/format";
import { ACCENT, CardShell, FooterButton } from "./CardShell";
import { FullListSheet, SheetRow } from "./FullListSheet";
import { TickerLink } from "./TickerLink";

export function InsiderCard({ stocks }: { stocks: InsiderStock[] }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  // API 는 건수 순. 화면에서는 금액 순으로 다시 정렬한다 (소액 여러 건이 위로 오지 않게).
  const sorted = useMemo(
    () => [...stocks].sort((a, b) => b.insiderBuyAmount - a.insiderBuyAmount),
    [stocks]
  );
  const [first, ...rest] = sorted;

  return (
    <CardShell
      index={3}
      tag="내부자도 같이 산 종목"
      accent="insider"
      headline={first ? "밖에서도 사고 회사 안에서도 샀어요" : "지금은 내부자 매수가 함께 있는 종목이 없어요"}
      why={{
        summary: "왜 중요해요? 건수보다 금액을 보세요. 소액이 여러 건일 수 있어요",
        detail:
          "회사 임원이 자기 돈으로 산 기록이에요. 슈퍼투자자와 방향이 같다면 함께 살펴볼 만한 신호예요.",
      }}
      footer={
        sorted.length > 0 && (
          <FooterButton onClick={() => setSheetOpen(true)}>{sorted.length}개 전부 보기</FooterButton>
        )
      }
    >
      {first && (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <TickerLink ticker={first.ticker} className="text-[20px] font-semibold" />
              <span className="truncate text-sm text-muted-foreground">{cleanText(first.companyName)}</span>
            </div>
            <p
              className={`text-[72px] font-semibold leading-none tracking-tight tabular-nums ${ACCENT.insider.text}`}
              style={MONO}
            >
              {formatLargeUSD(first.insiderBuyAmount)}
            </p>
            <p className="text-[15px]">
              임원들이 6개월간 <span style={MONO}>{first.insiderBuyCount}</span>건 자기 돈으로 매수
            </p>
            <p className="text-sm text-muted-foreground">
              슈퍼투자자 <span style={MONO}>{first.superinvestorCount}</span>명도 같은 분기에 보유
            </p>
          </div>

          {rest.length > 0 && (
            <ul className="divide-y divide-border border-y border-border">
              {rest.slice(0, 3).map((s) => (
                <li key={s.ticker} className="flex min-h-11 items-center gap-3">
                  <TickerLink ticker={s.ticker} className="flex-1 text-[15px]" />
                  <span className="text-sm text-muted-foreground tabular-nums" style={MONO}>
                    {s.insiderBuyCount}건
                  </span>
                  <span className={`w-20 text-right text-[15px] tabular-nums ${ACCENT.insider.text}`} style={MONO}>
                    {formatLargeUSD(s.insiderBuyAmount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <FullListSheet open={sheetOpen} title={`내부자도 같이 산 종목 ${sorted.length}개`} onClose={() => setSheetOpen(false)}>
        <ul>
          {sorted.map((s) => (
            <SheetRow key={s.ticker}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <TickerLink ticker={s.ticker} className="font-semibold" />
                  <p className="truncate text-sm text-muted-foreground">{cleanText(s.companyName)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    내부자 매수 <span style={MONO}>{s.insiderBuyCount}</span>건 · 슈퍼투자자{" "}
                    <span style={MONO}>{s.superinvestorCount}</span>명 보유
                  </p>
                </div>
                <span className={`shrink-0 text-lg font-semibold tabular-nums ${ACCENT.insider.text}`} style={MONO}>
                  {formatLargeUSD(s.insiderBuyAmount)}
                </span>
              </div>
            </SheetRow>
          ))}
        </ul>
      </FullListSheet>
    </CardShell>
  );
}
