"use client";

import { useState, useCallback, useEffect, useRef } from "react";

interface Size {
  width: number;
  height: number;
}

const MIN_WIDTH = 400;
const MIN_HEIGHT = 300;

export function useResizable() {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const resizing = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const startSize = useRef<Size>({ width: 0, height: 0 });
  const modalRef = useRef<HTMLDivElement | null>(null);

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const modalEl = (e.currentTarget as HTMLElement).closest(
        "[data-draggable-modal]",
      ) as HTMLDivElement | null;

      if (!modalEl) return;

      modalRef.current = modalEl;
      resizing.current = true;

      const rect = modalEl.getBoundingClientRect();
      startPos.current = { x: e.clientX, y: e.clientY };
      startSize.current = {
        width: size.width || rect.width,
        height: size.height || rect.height,
      };

      e.preventDefault();
      e.stopPropagation();
    },
    [size],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizing.current) return;

      const maxWidth = window.innerWidth * 0.9;
      const maxHeight = window.innerHeight * 0.9;

      const newWidth = startSize.current.width + (e.clientX - startPos.current.x);
      const newHeight = startSize.current.height + (e.clientY - startPos.current.y);

      setSize({
        width: Math.max(MIN_WIDTH, Math.min(maxWidth, newWidth)),
        height: Math.max(MIN_HEIGHT, Math.min(maxHeight, newHeight)),
      });
    };

    const handleMouseUp = () => {
      resizing.current = false;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  return { size, handleResizeMouseDown };
}
