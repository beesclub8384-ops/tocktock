"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ConsensusStock,
  DiscountStock,
  InsiderStock,
  Manager,
} from "@/lib/types/superinvestor";
import { parseQuarter } from "./_lib/quarter";
import { CARD_COUNT } from "./_components/CardShell";
import { CoverCard } from "./_components/CoverCard";
import { ConsensusCard } from "./_components/ConsensusCard";
import { DiscountCard } from "./_components/DiscountCard";
import { InsiderCard } from "./_components/InsiderCard";
import { PortfolioCard } from "./_components/PortfolioCard";
import { CautionCard } from "./_components/CautionCard";

// ── 데이터 (/api/superinvestor 응답) ──

interface SuperinvestorData {
  consensus: ConsensusStock[];
  discount: DiscountStock[];
  insider: InsiderStock[];
  managers: Manager[];
  quarter: string;
  lastUpdated: string;
}

const CARD_NAMES = ["표지", "같이 산 종목", "분기말보다 싸진 종목", "내부자도 같이 산 종목", "한 사람의 장바구니", "보기 전에 한 가지"];

// 상단 navbar(88px)를 뺀 높이를 스크롤 컨테이너가 차지한다
const SCREEN = "h-[calc(100dvh-88px)]";

export default function SuperinvestorPage() {
  const [data, setData] = useState<SuperinvestorData | null>(null);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/superinvestor")
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) {
          setError(json.error);
          return;
        }
        setData({
          consensus: json.consensus ?? [],
          discount: json.discount ?? [],
          insider: json.insider ?? [],
          managers: json.managers ?? [],
          quarter: json.quarter ?? "",
          lastUpdated: json.lastUpdated ?? "",
        });
      })
      .catch(() => {
        if (!cancelled) setError("데이터를 불러오지 못했어요.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 지금 보이는 카드 → 오른쪽 점 네비 표시
  useEffect(() => {
    const root = scrollerRef.current;
    if (!data || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.cardIndex));
        }
      },
      // 화면 세로 가운데 선에 걸린 카드를 현재 카드로 본다 (카드가 길어도 동작)
      { root, rootMargin: "-50% 0px -50% 0px" }
    );
    root.querySelectorAll("[data-card-index]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [data]);

  // #card-n 링크는 스크롤 컨테이너만 움직인다.
  // (기본 앵커 이동은 창 전체까지 스크롤해서 카드 윗부분이 navbar 아래로 숨는다)
  const navigate = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    const id = e.currentTarget.getAttribute("href")?.slice(1);
    const root = scrollerRef.current;
    const target = id ? document.getElementById(id) : null;
    if (!root || !target) return;
    e.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.scrollTo({ top: target.offsetTop, behavior: reduce ? "auto" : "smooth" });
    // 키보드·스크린리더 사용자가 이동한 카드에서 이어 읽도록
    target.focus({ preventScroll: true });
  }, []);

  if (error) {
    return (
      <div className={`flex ${SCREEN} items-center justify-center px-5`}>
        <div className="text-center">
          <p className="mb-4 text-red-600 dark:text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-12 rounded-xl border border-border bg-card px-5 text-sm font-semibold transition-colors hover:bg-accent"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={`flex ${SCREEN} items-center justify-center px-5`} role="status" aria-live="polite">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground/30 border-t-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">슈퍼투자자 데이터를 분석하는 중...</p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            처음 열 때는 Dataroma 데이터를 모으느라 시간이 걸릴 수 있어요
          </p>
        </div>
      </div>
    );
  }

  const quarter = parseQuarter(data.quarter);

  return (
    // contain: inline-size → 안쪽 가로 스크롤 줄(투자자 칩 등)이 main 폭을 넓혀 화면 전체가 옆으로 밀리지 않게
    <div className="relative [contain:inline-size]">
      <h1 className="sr-only">슈퍼투자자 포트폴리오</h1>
      <div
        ref={scrollerRef}
        className={`${SCREEN} relative overflow-x-hidden overflow-y-auto overscroll-y-contain snap-y snap-mandatory lg:snap-proximity`}
      >
        <CoverCard
          quarter={quarter}
          managerCount={data.managers.length}
          consensusCount={data.consensus.length}
          discountCount={data.discount.length}
          insiderCount={data.insider.length}
          lastUpdated={data.lastUpdated}
          onNavigate={navigate}
        />
        <ConsensusCard stocks={data.consensus} />
        <DiscountCard stocks={data.discount} quarter={quarter} />
        <InsiderCard stocks={data.insider} />
        <PortfolioCard managers={data.managers} />
        <CautionCard quarter={quarter} onNavigate={navigate} />
      </div>

      {/* PC: 오른쪽 점 네비 (스크롤 컨테이너 밖이라 화면에 고정돼 보인다) */}
      <nav
        aria-label="카드 이동"
        className="absolute right-6 top-1/2 hidden -translate-y-1/2 flex-col gap-3 lg:flex"
      >
        {Array.from({ length: CARD_COUNT }, (_, i) => (
          <a
            key={i}
            href={`#card-${i}`}
            onClick={navigate}
            aria-label={`${i + 1}번째 카드: ${CARD_NAMES[i]}`}
            aria-current={active === i ? "step" : undefined}
            className="group flex h-6 w-6 items-center justify-center rounded-full"
          >
            <span
              className={`block rounded-full transition-all motion-reduce:transition-none ${
                active === i
                  ? "h-3 w-3 bg-foreground"
                  : "h-2 w-2 bg-muted-foreground/40 group-hover:bg-muted-foreground"
              }`}
            />
          </a>
        ))}
      </nav>
    </div>
  );
}
