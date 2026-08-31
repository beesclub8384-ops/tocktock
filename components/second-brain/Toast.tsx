"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** 동작 결과를 알리는 짧은 토스트. 하단에서 2초 */
export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string) => {
    setMessage(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setMessage(null), 2000);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { message, show };
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[90] flex justify-center px-4"
      style={{ bottom: "calc(96px + env(safe-area-inset-bottom))" }}
    >
      <div className="rounded-full bg-foreground px-4 py-2.5 text-[15px] leading-none text-background shadow-lg">
        {message}
      </div>
    </div>
  );
}
