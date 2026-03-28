"use client";

import { useEffect, useState } from "react";

export function TradingViewButton() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const update = () => {
      setHidden(
        document.documentElement.hasAttribute("data-sidebar-open") ||
        document.documentElement.hasAttribute("data-menu-open")
      );
    };
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-sidebar-open", "data-menu-open"],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* PC: 오른쪽 하단 */}
      <a
        href="https://kr.tradingview.com/"
        target="_blank"
        rel="noopener noreferrer"
        title="TradingView"
        className="fixed bottom-6 right-6 z-50 hidden lg:flex h-12 w-12 items-center justify-center rounded-full border-2 border-blue-500 bg-white text-blue-600 text-lg shadow-lg transition-colors hover:bg-blue-50"
      >
        📈
      </a>

      {/* 모바일: 왼쪽 하단, 사이드바 토글(bottom-5) 위 */}
      {!hidden && (
        <a
          href="https://kr.tradingview.com/"
          target="_blank"
          rel="noopener noreferrer"
          title="TradingView"
          className="fixed bottom-[4.5rem] left-5 z-50 flex lg:hidden h-12 w-12 items-center justify-center rounded-full border-2 border-blue-500 bg-white text-blue-600 text-lg shadow-lg transition-colors hover:bg-blue-50"
        >
          📈
        </a>
      )}
    </>
  );
}
