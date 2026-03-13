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

  // 모달이 열릴 때마다 position 초기화
  useEffect(() => {
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      // 닫기 버튼 등 클릭 시 드래그 방지
      if ((e.target as HTMLElement).closest("button")) return;

      dragging.current = true;
      offset.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      };

      // 드래그 중인 모달 요소 저장
      const modalEl = (e.currentTarget as HTMLElement).closest(
        "[data-draggable-modal]",
      ) as HTMLDivElement | null;
      modalRef.current = modalEl;

      e.preventDefault();
    },
    [position],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !modalRef.current) return;

      const modal = modalRef.current;
      const rect = modal.getBoundingClientRect();

      let newX = e.clientX - offset.current.x;
      let newY = e.clientY - offset.current.y;

      // 화면 밖으로 나가지 않도록 경계 제한
      const minX = -(rect.left - position.x);
      const maxX = window.innerWidth - rect.right + position.x;
      const minY = -(rect.top - position.y);
      const maxY = window.innerHeight - rect.bottom + position.y;

      newX = Math.max(minX, Math.min(maxX, newX));
      newY = Math.max(minY, Math.min(maxY, newY));

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      dragging.current = false;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [position]);

  return { position, handleMouseDown };
}
