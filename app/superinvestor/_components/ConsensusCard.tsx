"use client";

import { useState } from "react";
import type { ConsensusStock } from "@/lib/types/superinvestor";
import { cleanText } from "../_lib/format";
import { josa, shortName } from "../_lib/names";
import { ACCENT, CardShell, FooterButton } from "./CardShell";
import { FullListSheet, SheetRow } from "./FullListSheet";
import { RankBar } from "./RankBar";
import { TickerLink } from "./TickerLink";

function BuyerChips({ buyers }: { buyers: ConsensusStock["buyers"] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {buyers.map((b) => (
        <li key={b.name} className="rounded-full bg-muted px-2.5 py-1 text-xs" title={cleanText(b.name)}>
          {shortName(b.name)}
          <span className="ml-1 text-muted-foreground">{b.activityType === "Add" ? "추가" : "신규"}</span>
        </li>
      ))}
    </ul>
  );
}

export function ConsensusCard({ stocks }: { stocks: ConsensusStock[] }) {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const top = stocks.slice(0, 5);
  // 기본 선택은 1위. 선택한 종목이 목록에서 사라지면 다시 1위로.
  const selected = top.find((s) => s.ticker === selectedTicker) ?? top[0];

  return (
    <CardShell
      index={1}
      tag="같이 산 종목"
      accent="buy"
      headline={stocks.length > 0 ? "서로 모르는 거물들이 같은 종목을 골랐어요" : "해당 분기에 같이 산 종목이 없어요"}
      why={{
        summary: "왜 중요해요? 보유 수량을 1% 이상 늘린 경우만 셌어요",
        detail: "Buy는 새로 산 것, Add는 더 담은 거예요. 비중을 아주 조금 늘린 건 매수로 치지 않았어요.",
      }}
      footer={
        stocks.length > 0 && (
          <FooterButton onClick={() => setSheetOpen(true)}>{stocks.length}개 전부 보기</FooterButton>
        )
      }
    >
      {top.length > 0 && (
        <>
          <RankBar
            rows={top.map((s) => ({
              key: s.ticker,
              label: s.ticker,
              value: s.buyerCount,
              valueLabel: `${s.buyerCount}명`,
            }))}
            barClassName={ACCENT.buy.bar}
            selectedKey={selected?.ticker}
            onSelect={setSelectedTicker}
            selectLabel="매수자 보기"
          />
          {selected && (
            <div className="rounded-[14px] border border-border bg-card p-3.5" aria-live="polite">
              <p className="mb-2 text-sm font-semibold">
                {josa(selected.ticker, "을", "를")} 산 {selected.buyerCount}명
              </p>
              <BuyerChips buyers={selected.buyers} />
            </div>
          )}
        </>
      )}

      <FullListSheet open={sheetOpen} title={`같이 산 종목 ${stocks.length}개`} onClose={() => setSheetOpen(false)}>
        <ul>
          {stocks.map((s) => (
            <SheetRow key={s.ticker}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <TickerLink ticker={s.ticker} className="font-semibold" />
                  <p className="truncate text-sm text-muted-foreground">{cleanText(s.companyName)}</p>
                </div>
                <span className={`shrink-0 text-sm font-semibold ${ACCENT.buy.text}`}>{s.buyerCount}명</span>
              </div>
              <BuyerChips buyers={s.buyers} />
            </SheetRow>
          ))}
        </ul>
      </FullListSheet>
    </CardShell>
  );
}
