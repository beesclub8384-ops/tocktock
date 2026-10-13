"use client";

import { useState } from "react";
import type { DiscountStock } from "@/lib/types/superinvestor";
import { cleanText, formatPrice, formatSignedPct, MONO } from "../_lib/format";
import { josa, shortName } from "../_lib/names";
import type { QuarterInfo } from "../_lib/quarter";
import { ACCENT, CardShell, FooterButton } from "./CardShell";
import { FullListSheet, SheetRow } from "./FullListSheet";
import { TickerLink } from "./TickerLink";

export function DiscountCard({ stocks, quarter }: { stocks: DiscountStock[]; quarter: QuarterInfo }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  // API 가 할인율 오름차순(가장 많이 내려온 순)으로 준다
  const [first, ...rest] = stocks;
  const endText = quarter.daysSince === null ? "분기 마지막 날" : quarter.endLabel;

  return (
    <CardShell
      index={2}
      tag="분기말보다 싸진 종목"
      accent="discount"
      headline={first ? "거물이 크게 들고 있는데 그때보다 내려왔어요" : "지금은 분기말보다 내려온 종목이 없어요"}
      why={{
        summary: `왜 중요해요? 기준은 매수가가 아니라 ${endText} 종가예요`,
        detail:
          "Hold Price는 분기 마지막 날 종가예요. 실제 매수가는 알 수 없어요. 그 기준보다 낮은 가격에 거래되고 있다는 뜻이에요.",
      }}
      footer={
        stocks.length > 0 && (
          <FooterButton onClick={() => setSheetOpen(true)}>{stocks.length}개 전부 보기</FooterButton>
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
              className={`text-[72px] font-semibold leading-none tracking-tight tabular-nums ${ACCENT.discount.text}`}
              style={MONO}
            >
              {formatSignedPct(first.discountPercent)}
            </p>
            <p className="text-[15px]">
              분기말 <span style={MONO}>{formatPrice(first.holdPrice)}</span> → 지금{" "}
              <span style={MONO}>{formatPrice(first.currentPrice)}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              {josa(shortName(first.topHolder), "이", "가")} 포트폴리오의{" "}
              <span style={MONO}>{first.topHolderWeight}%</span>를 넣은 종목
            </p>
          </div>

          {rest.length > 0 && (
            <ul className="divide-y divide-border border-y border-border">
              {rest.slice(0, 3).map((s) => (
                <li key={s.ticker} className="flex min-h-11 items-center justify-between gap-3">
                  <TickerLink ticker={s.ticker} className="text-[15px]" />
                  <span className={`text-[15px] tabular-nums ${ACCENT.discount.text}`} style={MONO}>
                    {formatSignedPct(s.discountPercent)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <FullListSheet open={sheetOpen} title={`분기말보다 싸진 종목 ${stocks.length}개`} onClose={() => setSheetOpen(false)}>
        <ul>
          {stocks.map((s) => (
            <SheetRow key={s.ticker}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <TickerLink ticker={s.ticker} className="font-semibold" />
                  <p className="truncate text-sm text-muted-foreground">{cleanText(s.companyName)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    분기말 <span style={MONO}>{formatPrice(s.holdPrice)}</span> → 지금{" "}
                    <span style={MONO}>{formatPrice(s.currentPrice)}</span> · 최대 비중 {shortName(s.topHolder)}{" "}
                    <span style={MONO}>{s.topHolderWeight}%</span> · {s.holderCount}명 보유
                  </p>
                </div>
                <span className={`shrink-0 text-lg font-semibold tabular-nums ${ACCENT.discount.text}`} style={MONO}>
                  {formatSignedPct(s.discountPercent)}
                </span>
              </div>
            </SheetRow>
          ))}
        </ul>
      </FullListSheet>
    </CardShell>
  );
}
