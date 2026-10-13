import { ExternalLink } from "lucide-react";
import { MONO } from "../_lib/format";

/** 티커 → TradingView 차트 (새 탭) */
export function TickerLink({ ticker, className = "" }: { ticker: string; className?: string }) {
  return (
    <a
      href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(ticker)}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${ticker} TradingView 차트 (새 탭)`}
      className={`inline-flex items-center gap-1 text-foreground transition-colors hover:text-blue-600 dark:hover:text-blue-400 ${className}`}
      style={MONO}
    >
      {ticker} <ExternalLink size={11} className="opacity-50" aria-hidden />
    </a>
  );
}
