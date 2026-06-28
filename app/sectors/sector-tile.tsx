"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

/* ── 타입 (Redis sector-board:data 구조와 동일) ── */
export interface SectorStock {
  code: string;
  name: string;
  marketCap: number; // 원
  price: number; // 원
  changeRate: number; // %
  tradingValue: number; // 원
  market: string;
}
export interface SubSector {
  name: string;
  count: number;
  stocks: SectorStock[];
}

const TOP_N = 10;

/* ── 단위 변환 (원 → 조/억) ── */
function fmtKRW(won: number): string {
  const v = Math.abs(won);
  if (v >= 1e12) return `${(won / 1e12).toFixed(1)}조`;
  if (v >= 1e8) return `${Math.round(won / 1e8).toLocaleString()}억`;
  if (v >= 1e4) return `${Math.round(won / 1e4).toLocaleString()}만`;
  return `${Math.round(won).toLocaleString()}원`;
}
/* 한국식: 상승 빨강 / 하락 파랑 / 보합 회색 */
function changeClass(rate: number): string {
  if (rate > 0) return "text-red-600 dark:text-red-400";
  if (rate < 0) return "text-blue-600 dark:text-blue-400";
  return "text-muted-foreground";
}
function fmtRate(rate: number): string {
  return `${rate > 0 ? "+" : ""}${rate.toFixed(2)}%`;
}

function StockRow({ s }: { s: SectorStock }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      <span
        className="min-w-0 flex-1 truncate"
        title={`${s.name} · 시총 ${fmtKRW(s.marketCap)}`}
      >
        {s.name}
      </span>
      <span className={`w-16 shrink-0 text-right tabular-nums ${changeClass(s.changeRate)}`}>
        {fmtRate(s.changeRate)}
      </span>
      <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
        {fmtKRW(s.tradingValue)}
      </span>
    </li>
  );
}

function SectorModal({ sub, onClose }: { sub: SubSector; onClose: () => void }) {
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
            {sub.name}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              {sub.count}종목 · 시총순
            </span>
          </h3>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="space-y-1 overflow-y-auto px-4 py-3">
          {sub.stocks.map((s) => (
            <StockRow key={s.code} s={s} />
          ))}
        </ul>
      </div>
    </div>
  );
}

export function SectorTile({ sub }: { sub: SubSector }) {
  const [open, setOpen] = useState(false);
  const top = sub.stocks.slice(0, TOP_N);
  const more = sub.count - top.length;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-border pb-2">
        <h3 className="truncate text-sm font-semibold">{sub.name}</h3>
        <span className="shrink-0 text-xs text-muted-foreground">{sub.count}종목</span>
      </div>
      {top.length === 0 ? (
        <p className="text-xs text-muted-foreground">종목 없음</p>
      ) : (
        <ul className="space-y-1">
          {top.map((s) => (
            <StockRow key={s.code} s={s} />
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
