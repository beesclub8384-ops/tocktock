"use client";

import { useState, useEffect } from "react";

export function SplashScreen() {
  const [show, setShow] = useState(false);
  const [minTimePassed, setMinTimePassed] = useState(false);
  const [pageLoaded, setPageLoaded] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [unmount, setUnmount] = useState(false);

  // 초기 마운트: sessionStorage 확인
  useEffect(() => {
    if (sessionStorage.getItem("splashShown")) {
      setUnmount(true);
      return;
    }
    setShow(true);
    sessionStorage.setItem("splashShown", "1");

    // 최소 1초 타이머
    const timer = setTimeout(() => setMinTimePassed(true), 1000);

    // 페이지 로딩 완료 감지
    const handleLoad = () => setPageLoaded(true);
    if (document.readyState === "complete") {
      setPageLoaded(true);
    } else {
      window.addEventListener("load", handleLoad);
    }

    return () => {
      clearTimeout(timer);
      window.removeEventListener("load", handleLoad);
    };
  }, []);

  // 두 조건 모두 충족되면 페이드아웃 시작
  useEffect(() => {
    if (minTimePassed && pageLoaded) {
      setFadeOut(true);
      const timer = setTimeout(() => setUnmount(true), 500);
      return () => clearTimeout(timer);
    }
  }, [minTimePassed, pageLoaded]);

  if (unmount || !show) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white transition-opacity duration-500 ${
        fadeOut ? "opacity-0" : "opacity-100"
      }`}
    >
      <img src="/logo.png" alt="TockTock" style={{ width: 200 }} />
      <p className="text-sm text-gray-500 mt-3">
        내가 매매하는데 보려고 만든 사이트
      </p>
    </div>
  );
}
