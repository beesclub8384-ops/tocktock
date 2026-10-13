"use client";

import { useEffect, useMemo, useState } from "react";
import type { Holding, Manager } from "@/lib/types/superinvestor";
import { cleanText, formatSignedPct, formatUSD, MONO } from "../_lib/format";
import { hasBatchim, josa, personPart, shortName } from "../_lib/names";
import { ACCENT, CardShell, FooterButton } from "./CardShell";
import { FullListSheet, SheetRow } from "./FullListSheet";
import { RankBar } from "./RankBar";
import { TickerLink } from "./TickerLink";

// 앞에 고정할 투자자 (" - " 앞 이름으로 매칭, 없는 사람은 건너뜀)
const PINNED = ["Warren Buffett", "Bill Ackman", "Mohnish Pabrai", "Li Lu", "David Tepper"];

function activityClass(activity: string): string {
  if (activity === "Buy" || activity.startsWith("Add")) {
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
  }
  if (activity.startsWith("Reduce") || activity.startsWith("Sell")) {
    return "bg-red-500/15 text-red-700 dark:text-red-400";
  }
  return "bg-muted text-muted-foreground";
}

type HoldingsResult = { code: string; holdings: Holding[]; error: boolean };

export function PortfolioCard({ managers }: { managers: Manager[] }) {
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [result, setResult] = useState<HoldingsResult | null>(null);
  const [managerSheetOpen, setManagerSheetOpen] = useState(false);
  const [holdingSheetOpen, setHoldingSheetOpen] = useState(false);

  const pinned = useMemo(
    () =>
      PINNED.map((p) => managers.find((m) => personPart(m.name) === p)).filter(
        (m): m is Manager => !!m
      ),
    [managers]
  );

  // 기본 선택: 버핏 → 없으면 첫 번째
  const defaultManager =
    managers.find((m) => m.name.includes("Warren Buffett")) ?? managers[0] ?? null;
  const selected =
    managers.find((m) => m.code === selectedCode) ?? defaultManager;

  // 고정 칩에 없는 사람을 고르면 그 사람을 맨 앞에 보여 준다
  const chips = selected && !pinned.some((m) => m.code === selected.code) ? [selected, ...pinned] : pinned;

  useEffect(() => {
    if (!selected) return;
    const code = selected.code;
    let cancelled = false;
    fetch(`/api/superinvestor?section=holdings&manager=${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setResult({ code, holdings: json.holdings ?? [], error: !json.holdings });
      })
      .catch(() => {
        if (!cancelled) setResult({ code, holdings: [], error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  // 로딩 여부는 따로 state 로 두지 않고 "결과가 지금 선택한 사람 것인지"로 판단
  const loading = !!selected && result?.code !== selected.code;
  const holdings = !loading && result ? result.holdings : [];
  const sortedHoldings = [...holdings].sort((a, b) => b.weightPercent - a.weightPercent);
  const top3 = sortedHoldings.slice(0, 3);
  const top3Sum = Math.round(top3.reduce((sum, h) => sum + h.weightPercent, 0));
  const name = selected ? shortName(selected.name) : "";

  return (
    <CardShell
      index={4}
      tag="한 사람의 장바구니"
      accent="portfolio"
      headlineClassName={name.length > 10 ? "text-[22px]" : "text-[28px]"}
      headline={
        !selected
          ? "투자자 목록을 불러오지 못했어요"
          : hasBatchim(name) === null
            ? `${name}, 지금 뭘 들고 있을까요` // 영문 이름은 조사를 정할 수 없음
            : `${josa(name, "은", "는")} 지금 뭘 들고 있을까요`
      }
      why={{
        summary: "비중(%) = 그 사람 전체 돈 중 이 종목에 넣은 몫",
        detail: "Add는 해당 분기에 더 담은 것, Reduce는 일부 판 것, 표시가 없으면 그대로 들고 있는 거예요.",
      }}
      footer={
        sortedHoldings.length > 0 && (
          <FooterButton onClick={() => setHoldingSheetOpen(true)}>
            {name} {sortedHoldings.length}종목 전부 보기
          </FooterButton>
        )
      }
    >
      {managers.length > 0 && (
        <div
          role="group"
          aria-label="투자자 고르기"
          className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [contain:inline-size] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:px-0"
        >
          {chips.map((m) => {
            const active = m.code === selected?.code;
            return (
              <button
                key={m.code}
                type="button"
                aria-pressed={active}
                title={m.name}
                onClick={() => setSelectedCode(m.code)}
                className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card hover:bg-accent"
                }`}
              >
                {shortName(m.name)}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setManagerSheetOpen(true)}
            className="min-h-10 shrink-0 rounded-full border border-dashed border-border px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            전체 {managers.length}명
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="보유 종목을 불러오는 중">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
          ))}
        </div>
      ) : top3.length > 0 ? (
        <>
          <RankBar
            rows={top3.map((h) => ({
              key: h.ticker,
              label: h.ticker,
              value: h.weightPercent,
              valueLabel: `${h.weightPercent.toFixed(1)}%`,
            }))}
            barClassName={ACCENT.portfolio.bar}
          />
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            {sortedHoldings.length > 3 ? (
              <>
                위 세 종목이 전체의 <span className="text-foreground" style={MONO}>{top3Sum}%</span>예요. 나머지{" "}
                {sortedHoldings.length - 3}종목은 아래에서 볼 수 있어요.
              </>
            ) : (
              <>위 {sortedHoldings.length}종목이 보유 종목 전부예요.</>
            )}
          </p>
        </>
      ) : selected ? (
        <p className="text-[15px] text-muted-foreground">보유 종목을 불러오지 못했어요. 잠시 뒤 다시 골라 주세요.</p>
      ) : null}

      <FullListSheet open={managerSheetOpen} title={`투자자 ${managers.length}명`} onClose={() => setManagerSheetOpen(false)}>
        <ul>
          {managers.map((m) => (
            <li key={m.code} className="border-b border-border last:border-b-0">
              <button
                type="button"
                aria-pressed={m.code === selected?.code}
                onClick={() => {
                  setSelectedCode(m.code);
                  setManagerSheetOpen(false);
                }}
                className={`flex min-h-12 w-full items-center justify-between gap-3 px-1 text-left text-sm transition-colors hover:bg-accent ${
                  m.code === selected?.code ? "font-semibold" : ""
                }`}
              >
                <span>{cleanText(m.name)}</span>
                {shortName(m.name) !== personPart(m.name) && (
                  <span className="shrink-0 text-xs text-muted-foreground">{shortName(m.name)}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </FullListSheet>

      <FullListSheet
        open={holdingSheetOpen}
        title={`${name} 보유 ${sortedHoldings.length}종목`}
        onClose={() => setHoldingSheetOpen(false)}
      >
        <ul>
          {sortedHoldings.map((h) => (
            <SheetRow key={h.ticker}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <TickerLink ticker={h.ticker} className="font-semibold" />
                  <p className="truncate text-sm text-muted-foreground">{cleanText(h.companyName)}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className={`rounded px-1.5 py-0.5 font-medium ${activityClass(h.activity)}`}>
                      {h.activity || "보유 유지"}
                    </span>
                    <span>
                      공시가 <span style={MONO}>{formatUSD(h.reportedPrice)}</span> 대비{" "}
                      <span
                        className={h.changePct < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}
                        style={MONO}
                      >
                        {formatSignedPct(h.changePct)}
                      </span>
                    </span>
                  </div>
                </div>
                <span className={`shrink-0 text-lg font-semibold tabular-nums ${ACCENT.portfolio.text}`} style={MONO}>
                  {h.weightPercent.toFixed(1)}%
                </span>
              </div>
            </SheetRow>
          ))}
        </ul>
      </FullListSheet>
    </CardShell>
  );
}
