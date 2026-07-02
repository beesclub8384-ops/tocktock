"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

/* ── 타입 (Redis us-sector-board:data 구조) ── */
export interface UsStock {
  ticker: string;
  name: string; // 영문 회사명
  nameKo?: string; // 한글명(없으면 영문 폴백)
  marketCap: number; // USD
  price: number; // USD
  changeRate: number; // %
  tradingValue: number; // USD (현재가×거래량 근사)
  volume: number; // 주
}
export interface UsSector {
  name: string; // GICS 영문
  nameKo: string; // 한글
  count: number;
  stocks: UsStock[];
}

const TOP_N = 10;

/* ── 단위 변환 (USD → $B / $M) ── */
function fmtUSD(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${Math.round(v / 1e6).toLocaleString()}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${Math.round(v).toLocaleString()}`;
}
function fmtVol(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return `${v.toLocaleString()}`;
}
/* 한국식(사이트 일관성): 상승 빨강 / 하락 파랑 / 보합 회색 */
function changeClass(rate: number): string {
  if (rate > 0) return "text-red-600 dark:text-red-400";
  if (rate < 0) return "text-blue-600 dark:text-blue-400";
  return "text-muted-foreground";
}
function fmtRate(rate: number): string {
  return `${rate > 0 ? "+" : ""}${rate.toFixed(2)}%`;
}

function StockRow({ s }: { s: UsStock }) {
  const label = s.nameKo || s.name; // 한글명 우선, 없으면 영문
  return (
    <li className="flex items-center gap-2 text-xs">
      <span className="min-w-0 flex-1 truncate" title={`${label} (${s.ticker}) · ${s.name} · 시총 ${fmtUSD(s.marketCap)}`}>
        {label} <span className="text-muted-foreground">({s.ticker})</span>
      </span>
      <span className={`w-14 shrink-0 text-right tabular-nums ${changeClass(s.changeRate)}`}>{fmtRate(s.changeRate)}</span>
      <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">{fmtUSD(s.tradingValue)}</span>
      <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">{fmtVol(s.volume)}</span>
    </li>
  );
}

function SectorModal({ sub, onClose }: { sub: UsSector; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h3 className="truncate text-sm font-semibold">
            {sub.nameKo || sub.name}{" "}
            <span className="text-xs font-normal text-muted-foreground">{sub.count}종목 · 시총순</span>
          </h3>
          <button onClick={onClose} aria-label="닫기" className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 border-b border-border px-4 py-1.5 text-[10px] font-medium text-muted-foreground">
          <span className="min-w-0 flex-1">종목</span>
          <span className="w-14 text-right">등락률</span>
          <span className="w-16 text-right">거래대금</span>
          <span className="w-12 text-right">거래량</span>
        </div>
        <ul className="space-y-1 overflow-y-auto px-4 py-3">
          {sub.stocks.map((s) => (
            <StockRow key={s.ticker} s={s} />
          ))}
        </ul>
      </div>
    </div>
  );
}

export function UsSectorTile({ sub }: { sub: UsSector }) {
  const [open, setOpen] = useState(false);
  const top = sub.stocks.slice(0, TOP_N);
  const more = sub.count - top.length;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-border pb-2">
        <h3 className="min-w-0 truncate text-sm font-semibold">{sub.nameKo || sub.name}</h3>
        <span className="shrink-0 text-xs text-muted-foreground">{sub.count}종목</span>
      </div>
      {top.length === 0 ? (
        <p className="text-xs text-muted-foreground">종목 없음</p>
      ) : (
        <ul className="space-y-1">
          {top.map((s) => (
            <StockRow key={s.ticker} s={s} />
          ))}
        </ul>
      )}
      {more > 0 && (
        <button
          onClick={() => setOpen(true)}
          className="mt-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          +{more}개 더
        </button>
      )}
      {open && <SectorModal sub={sub} onClose={() => setOpen(false)} />}
    </div>
  );
}
