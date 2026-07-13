"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BizAreaIcon } from "./biz-area";

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
  avgWeighted?: number; // 시총가중 등락 %
  avgSimple?: number; // 단순평균 등락 %
  avgCount?: number; // 평균 계산에 쓴 종목수
  stocks: SectorStock[];
}

/* 배경 tint — 시총가중 등락 기준(양수 빨강/음수 파랑), |등락| ±3%에서 최대 진하기 */
function headerTint(w: number): string {
  if (!Number.isFinite(w) || w === 0) return "transparent";
  const mag = Math.min(Math.abs(w) / 3, 1); // 0..1
  const alpha = (0.05 + mag * 0.25).toFixed(3); // 0.05 ~ 0.30 (텍스트 대비 유지)
  return w > 0 ? `rgba(220,38,38,${alpha})` : `rgba(37,99,235,${alpha})`;
}

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
      <span className="flex min-w-0 flex-1 items-center gap-1">
        <span className="truncate" title={`${s.name} · 시총 ${fmtKRW(s.marketCap)}`}>
          {s.name}
        </span>
        <BizAreaIcon code={s.code} name={s.name} />
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

/* 종목 팝업 (모달) */
function StockPopup({ sub, onClose }: { sub: SubSector; onClose: () => void }) {
  const w = sub.avgWeighted ?? 0;
  const s = sub.avgSimple ?? 0;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${sub.name} 종목`}
        className="my-8 w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-xl"
      >
        <div className="border-b border-border px-5 py-3" style={{ backgroundColor: headerTint(w) }}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="min-w-0 truncate text-base font-bold">{sub.name}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs tabular-nums">
            <span className="text-[11px] text-muted-foreground">시총 가중치 적용</span>
            <span className={changeClass(w)}>{fmtRate(w)}</span>
            <span className="text-[11px] text-muted-foreground">· 단순평균</span>
            <span className={changeClass(s)}>{fmtRate(s)}</span>
            <span className="text-[11px] text-muted-foreground">· {sub.count}종목</span>
          </div>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-3">
          {sub.stocks.length === 0 ? (
            <p className="text-xs text-muted-foreground">종목 없음</p>
          ) : (
            <ul className="space-y-1.5">
              {sub.stocks.map((st) => (
                <StockRow key={st.code} s={st} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* 바둑판 격자 타일 — 섹터명 + 등락 두 숫자 + 배경색. 클릭/햄버거 시 종목 팝업 */
export function SectorTile({ sub, hasHistory }: { sub: SubSector; hasHistory?: boolean }) {
  const [open, setOpen] = useState(false);
  const w = sub.avgWeighted ?? 0;
  const s = sub.avgSimple ?? 0;
  return (
    <div className="relative h-full">
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`${sub.name} · ${sub.count}종목`}
        aria-label={`${sub.name} 종목 보기`}
        className={`flex h-full w-full flex-col justify-between rounded-md border border-border bg-card p-2 text-left transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-foreground/20 ${
          hasHistory ? "pr-6" : ""
        }`}
        style={{ backgroundColor: headerTint(w) }}
      >
        <div className="flex items-start justify-between gap-1">
          <h3 className="min-w-0 truncate text-xs font-semibold leading-tight">{sub.name}</h3>
          <span className="shrink-0 text-muted-foreground" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </span>
        </div>
        <div className="mt-1 flex items-baseline gap-1 tabular-nums">
          <span className={`text-sm font-bold ${changeClass(w)}`}>{fmtRate(w)}</span>
          <span className={`text-[10px] ${changeClass(s)}`}>{fmtRate(s)}</span>
        </div>
      </button>
      {hasHistory && (
        <Link
          href={`/sectors/history/${encodeURIComponent(sub.name)}`}
          onClick={(e) => e.stopPropagation()}
          title="히스토리 지수 보기"
          aria-label={`${sub.name} 히스토리 지수 보기`}
          className="absolute right-1 top-1 z-10 rounded p-0.5 text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="3 16 8 11 12 14 21 5" />
          </svg>
        </Link>
      )}
      {open && <StockPopup sub={sub} onClose={() => setOpen(false)} />}
    </div>
  );
}
