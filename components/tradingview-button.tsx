"use client";

export function TradingViewButton() {
  return (
    <>
      {/* PC: 오른쪽 하단 */}
      <a
        href="https://kr.tradingview.com/"
        target="_blank"
        rel="noopener noreferrer"
        title="TradingView"
        className="fixed bottom-6 right-6 z-50 hidden lg:flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-lg shadow-md transition-colors hover:bg-accent"
      >
        📈
      </a>

      {/* 모바일: 왼쪽 하단, 사이드바 토글(bottom-5) 위 */}
      <a
        href="https://kr.tradingview.com/"
        target="_blank"
        rel="noopener noreferrer"
        title="TradingView"
        className="fixed bottom-[4.5rem] left-5 z-50 flex lg:hidden h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-lg shadow-md transition-colors hover:bg-accent"
      >
        📈
      </a>
    </>
  );
}
