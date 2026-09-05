"use client";

import { useState, useCallback, useEffect, useRef } from "react";

interface Position {
  x: number;
  y: number;
}

export function useDraggable() {
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const dragging = useRef(false);
  const offset = useRef<Position>({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement | null>(null);

  const startDrag = useCallback(
    (
      clientX: number,
      clientY: number,
      target: HTMLElement,
      currentTarget: HTMLElement
    ) => {
      // 닫기 버튼 등 클릭 시 드래그 방지
      if (target.closest("button")) return false;

      dragging.current = true;
      offset.current = {
        x: clientX - position.x,
        y: clientY - position.y,
      };

      // 드래그 중인 모달 요소 저장
      const modalEl = currentTarget.closest(
        "[data-draggable-modal]",
      ) as HTMLDivElement | null;
      modalRef.current = modalEl;

      return true;
    },
    [position],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const started = startDrag(
        e.clientX,
        e.clientY,
        e.target as HTMLElement,
        e.currentTarget as HTMLElement,
      );
      if (started) e.preventDefault();
    },
    [startDrag],
  );

  // 모바일 터치 드래그
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      const touch = e.touches[0];
      if (!touch) return;
      startDrag(
        touch.clientX,
        touch.clientY,
        e.target as HTMLElement,
        e.currentTarget as HTMLElement,
      );
    },
    [startDrag],
  );

  useEffect(() => {
    const moveTo = (clientX: number, clientY: number) => {
      if (!dragging.current || !modalRef.current) return;

      const modal = modalRef.current;
      const rect = modal.getBoundingClientRect();

      let newX = clientX - offset.current.x;
      let newY = clientY - offset.current.y;

      // 화면 밖으로 나가지 않도록 경계 제한
      const minX = -(rect.left - position.x);
      const maxX = window.innerWidth - rect.right + position.x;
      const minY = -(rect.top - position.y);
      const maxY = window.innerHeight - rect.bottom + position.y;

      newX = Math.max(minX, Math.min(maxX, newX));
      newY = Math.max(minY, Math.min(maxY, newY));

      setPosition({ x: newX, y: newY });
    };

    const handleMouseMove = (e: MouseEvent) => {
      moveTo(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!dragging.current || !modalRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      // 드래그 중에는 페이지가 같이 스크롤되지 않도록 막는다
      e.preventDefault();
      moveTo(touch.clientX, touch.clientY);
    };

    const handleEnd = () => {
      dragging.current = false;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleEnd);
    // preventDefault를 쓰려면 passive: false 필요
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleEnd);
    document.addEventListener("touchcancel", handleEnd);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleEnd);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleEnd);
      document.removeEventListener("touchcancel", handleEnd);
    };
  }, [position]);

  return { position, handleMouseDown, handleTouchStart };
}
