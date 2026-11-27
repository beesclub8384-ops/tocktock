"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * 가로로 긴 표를 처음부터 오른쪽 끝(최신 달)에 맞춰 보여 준다.
 * 화면 폭이 바뀌어도(회전·창 크기) 사용자가 직접 밀기 전까지는 끝에 붙여 둔다.
 */
export function ScrollEnd({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let touched = false;
    const toEnd = () => {
      if (!touched) el.scrollLeft = el.scrollWidth;
    };
    const markTouched = () => {
      touched = true;
    };
    toEnd();
    const ro = new ResizeObserver(toEnd);
    ro.observe(el);
    el.addEventListener("pointerdown", markTouched, { passive: true });
    el.addEventListener("wheel", markTouched, { passive: true });
    el.addEventListener("touchstart", markTouched, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("pointerdown", markTouched);
      el.removeEventListener("wheel", markTouched);
      el.removeEventListener("touchstart", markTouched);
    };
  }, []);
  return (
    <div ref={ref} className={`overflow-x-auto ${className}`}>
      {children}
    </div>
  );
}
