"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Users,
  TrendingDown,
  UserCheck,
  ChevronDown,
  ExternalLink,
  HelpCircle,
  X,
} from "lucide-react";
import { useDraggable } from "@/hooks/useDraggable";
import { useResizable } from "@/hooks/useResizable";

// ── 타입 (서버 타입과 동일) ���─

interface ConsensusStock {
  ticker: string;
  companyName: string;
  buyerCount: number;
  buyers: { name: string; activityType: "Buy" | "Add" }[];
}

interface DiscountStock {
  ticker: string;
  companyName: string;
  topHolder: string;
  topHolderWeight: number;
  holdPrice: number;
  currentPrice: number;
  discountPercent: number;
  holderCount: number;
}

interface InsiderStock {
  ticker: string;
  companyName: string;
  superinvestorCount: number;
  insiderBuyCount: number;
  insiderBuyAmount: number;
}

interface Manager {
  code: string;
  name: string;
}

interface Holding {
  ticker: string;
  companyName: string;
  weightPercent: number;
  activity: string;
  reportedPrice: number;
  currentPrice: number;
  changePct: number;
}

// ── 보는 법 모달 ──

function SuperinvestorGuideModal({ onClose }: { onClose: () => void }) {
  const { position, handleMouseDown } = useDraggable();
  const { size, handleResizeMouseDown } = useResizable();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-draggable-modal
        className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
          ...(size.width
            ? { width: size.width, height: size.height }
            : { width: "100%", maxWidth: "56rem" }),
        }}
      >
        <div
          className="overflow-y-auto p-6 sm:p-8"
          style={{ maxHeight: size.height ? size.height - 2 : "85vh" }}
        >
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-10 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X size={20} />
          </button>

          <h2
            className="mb-6 text-xl font-bold cursor-move select-none"
            onMouseDown={handleMouseDown}
          >
            슈퍼투자자 보는 법
          </h2>

          {/* 1부 */}
          <section className="mb-6">
            <h3 className="mb-2 text-base font-semibold">
              전설적 투자자들의 장바구니를 들여다봅니다
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              워런 버핏, 빌 애크먼처럼 수십 년간 시장을 이긴 투자자 82명이
              이번 분기에 무엇을 샀는지, 팔았는지, 더 담았는지를 보여줍니다.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              미국 법상 1억 달러 이상 굴리는 펀드는 분기마다
              보유 종목을 정부(SEC)에 의무적으로 신고해야 합니다.
              이걸 <strong className="text-foreground">13F 공시</strong>라고 해요.
            </p>
            <blockquote className="mt-3 border-l-2 border-border pl-4 text-sm italic text-muted-foreground">
              &ldquo;세상에서 가장 요리를 잘하는 셰프 82명이 이번 달 장을 어디서 봤는지
              영수증을 공개하는 거예요. 우리는 그 영수증을 모아서 보여주는 겁니다.&rdquo;
            </blockquote>
          </section>

          <hr className="my-5 border-border" />

          {/* 2부: 섹션 1 */}
          <section className="mb-6">
            <h3 className="mb-1 text-base font-semibold">
              섹션 1 — 이번 분기 거물들의 선택
            </h3>
            <p className="mb-2 text-xs text-muted-foreground/70">
              혼자 산 게 아니라, 여럿이 같은 종목을 샀다
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              이번 분기에 2명 이상의 슈퍼투자자가 서로 상의도 없이
              같은 종목을 담은 경우만 보여줍니다.
            </p>
            <blockquote className="mt-2 border-l-2 border-border pl-4 text-sm italic text-muted-foreground">
              &ldquo;버핏도 사고, 애크먼도 사고, 파브라이도 샀다면?
              우연이라고 보기 어렵습니다.&rdquo;
            </blockquote>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              숫자가 클수록 더 많은 거물이 주목한 종목이에요.
            </p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>
                <strong className="text-foreground">Buy</strong> = 이번 분기 처음 매수 (새로 관심 가짐)
              </li>
              <li>
                <strong className="text-foreground">Add</strong> = 원래 갖고 있었는데 더 담음 (확신이 커짐)
              </li>
            </ul>
          </section>

          <hr className="my-5 border-border" />

          {/* 2부: 섹션 2 */}
          <section className="mb-6">
            <h3 className="mb-1 text-base font-semibold">
              섹션 2 — 지금 할인 중인 거물 종목
            </h3>
            <p className="mb-2 text-xs text-muted-foreground/70">
              거물이 비싸게 샀는데, 지금은 더 싸다
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              슈퍼투자자가 포트폴리오의 3% 이상을 크게 베팅한 종목 중에서,
              현재 주가가 그들이 샀을 때보다 낮은 종목만 추렸어요.
            </p>
            <blockquote className="mt-2 border-l-2 border-border pl-4 text-sm italic text-muted-foreground">
              &ldquo;버핏이 150달러에 크게 샀는데 지금 주가가 120달러라면?
              버핏보다 싸게 살 수 있는 상황입니다.&rdquo;
            </blockquote>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              할인율 숫자가 클수록 더 많이 내려온 상태예요.
            </p>
            <p className="mt-2 text-xs text-amber-400/80">
              Hold Price는 분기말 종가 기준이라 정확한 매수가가 아닐 수 있어요.
              실제 매수는 그 분기 중 어느 날이든 일어날 수 있습니다.
            </p>
          </section>

          <hr className="my-5 border-border" />

          {/* 2부: 섹션 3 */}
          <section className="mb-6">
            <h3 className="mb-1 text-base font-semibold">
              섹션 3 — 거물 + 내부자 동시 매수
            </h3>
            <p className="mb-2 text-xs text-muted-foreground/70">
              밖에서도 사고, 안에서도 샀다
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              슈퍼투자자가 매수한 종목 중에서,
              그 회사 임원(내부자)도 최근 6개월 안에 자기 돈으로 주식을 사들인 종목입니다.
            </p>
            <blockquote className="mt-2 border-l-2 border-border pl-4 text-sm italic text-muted-foreground">
              외부의 전설적 투자자 &rarr; &ldquo;이 회사 좋아 보인다&rdquo;<br />
              내부 임원 &rarr; &ldquo;우리 회사 잘 될 거 알아, 내 돈 넣는다&rdquo;<br />
              둘이 같은 방향 &rarr; <strong className="text-foreground">가장 강한 매수 시그널</strong>
            </blockquote>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              내부자 매수 건수가 많을수록 임원들의 확신이 강한 거예요.
            </p>
          </section>

          <hr className="my-5 border-border" />

          {/* 2부: 섹션 4 */}
          <section className="mb-6">
            <h3 className="mb-1 text-base font-semibold">
              섹션 4 — 투자자별 포트폴리오
            </h3>
            <p className="mb-2 text-xs text-muted-foreground/70">
              내가 존경하는 그 투자자, 지금 뭘 들고 있나
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              드롭다운에서 투자자를 선택하면
              그 사람의 현재 포트폴리오 전체를 볼 수 있어요.
            </p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>
                <strong className="text-foreground">비중(%)</strong> = 전체 포트폴리오에서 이 종목에 얼마나 베팅했는지
              </li>
              <li>
                <span className="text-emerald-400 font-medium">Add</span> = 이번 분기 더 담음
              </li>
              <li>
                <span className="text-red-400 font-medium">Reduce</span> = 이번 분기 일부 팜
              </li>
              <li>
                <span className="text-muted-foreground">Hold</span> = 변화 없음
              </li>
            </ul>
          </section>

          <hr className="my-5 border-border" />

          {/* 3부 */}
          <section className="mb-2">
            <h3 className="mb-3 text-base font-semibold">
              따라 사는 게 목적이 아닙니다
            </h3>

            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <h4 className="mb-1.5 text-sm font-semibold">
                  ① 데이터가 늦습니다
                </h4>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  13F는 분기가 끝나고 최대 45일 후에 공개돼요.
                  지금 내가 보는 건 최대 4개월 전 데이터일 수 있어요.
                  공시되는 시점엔 이미 주가가 많이 오른 경우도 많습니다.
                </p>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <h4 className="mb-1.5 text-sm font-semibold">
                  ② 이들은 초장기 투자자입니다
                </h4>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  버핏은 &ldquo;영원히 보유&rdquo;를 목표로 삽니다.
                  이 종목들을 사고 단기 하락에 패닉 셀하면 손실이 납니다.
                </p>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <h4 className="mb-1.5 text-sm font-semibold">
                  ③ 종목 발굴의 출발점으로 쓰세요
                </h4>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  &ldquo;이 종목을 거물들이 주목하는구나, 내가 직접 공부해봐야겠다&rdquo;
                  &mdash; 여기서부터 시작하는 게 올바른 활용법입니다.
                </p>
              </div>
            </div>
          </section>
        </div>
        <div
          onMouseDown={handleResizeMouseDown}
          className="absolute bottom-0 right-0 cursor-se-resize px-2 py-1 text-xs text-gray-400 hover:text-gray-200 select-none"
        >
          ↔ 크기조절
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── 유틸 ──

function formatUSD(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatLargeUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function TickerLink({ ticker }: { ticker: string }) {
  return (
    <a
      href={`https://www.tradingview.com/chart/?symbol=${ticker}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-foreground hover:text-blue-400 transition-colors"
    >
      {ticker} <ExternalLink size={11} className="opacity-50" />
    </a>
  );
}

// ── 섹션 공통 ──

function SectionHeader({
  icon,
  title,
  desc,
  count,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  count?: number;
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        {count !== undefined && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {count}개
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function SectionEmpty({ text }: { text: string }) {
  return (
    <div className="flex h-32 items-center justify-center rounded-xl border border-border bg-card">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function SectionLoading() {
  return (
    <div className="flex h-32 items-center justify-center rounded-xl border border-border bg-card">
      <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
    </div>
  );
}

// ── 섹션 1: 동시 매수 ──

function ConsensusSection({ stocks }: { stocks: ConsensusStock[] }) {
  if (stocks.length === 0) return <SectionEmpty text="이번 분기 동시 매수 종목이 ��습니다." />;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {stocks.map((s) => (
        <div
          key={s.ticker}
          className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/30"
        >
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="text-lg font-bold">
                <TickerLink ticker={s.ticker} />
              </div>
              <p className="text-sm text-muted-foreground">{s.companyName}</p>
            </div>
            <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-bold text-emerald-400">
              {s.buyerCount}명 매수
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {s.buyers.map((b) => (
              <span
                key={b.name}
                className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {b.name.split(" - ")[0]}
                <span className="ml-1 opacity-60">
                  {b.activityType === "Add" ? "Add" : "New"}
                </span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 섹션 2: 할인 종목 ──

function DiscountSection({ stocks }: { stocks: DiscountStock[] }) {
  if (stocks.length === 0) return <SectionEmpty text="현재 할인 중인 종목이 없습니다." />;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {stocks.map((s) => (
        <div
          key={s.ticker}
          className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/30"
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-lg font-bold">
                <TickerLink ticker={s.ticker} />
              </div>
              <p className="text-sm text-muted-foreground">{s.companyName}</p>
            </div>
            <span className="text-xl font-bold text-red-400 tabular-nums" style={{ fontFamily: "'DM Mono', monospace" }}>
              {s.discountPercent.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm mb-2">
            <div>
              <span className="text-xs text-muted-foreground">Hold Price</span>
              <div className="font-medium tabular-nums" style={{ fontFamily: "'DM Mono', monospace" }}>
                {formatUSD(s.holdPrice)}
              </div>
            </div>
            <span className="text-muted-foreground">→</span>
            <div>
              <span className="text-xs text-muted-foreground">현재가</span>
              <div className="font-medium tabular-nums" style={{ fontFamily: "'DM Mono', monospace" }}>
                {formatUSD(s.currentPrice)}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            최대 비중: {s.topHolder.split(" - ")[0]} ({s.topHolderWeight}%) · {s.holderCount}명 보유
          </p>
        </div>
      ))}
    </div>
  );
}

// ── 섹션 3: 내부자 동반 매수 ──

function InsiderSection({ stocks }: { stocks: InsiderStock[] }) {
  if (stocks.length === 0) return <SectionEmpty text="내부자 동반 매수 종목이 없습니다." />;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {stocks.map((s) => (
        <div
          key={s.ticker}
          className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/30"
        >
          <div className="mb-3">
            <div className="text-lg font-bold">
              <TickerLink ticker={s.ticker} />
            </div>
            <p className="text-sm text-muted-foreground">{s.companyName}</p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <Users size={14} className="text-muted-foreground" />
              <span>슈퍼투자자 {s.superinvestorCount}명</span>
            </div>
            <div className="flex items-center gap-1.5">
              <UserCheck size={14} className="text-amber-400" />
              <span className="font-medium text-amber-400">
                내부자 {s.insiderBuyCount}건
              </span>
            </div>
          </div>
          {s.insiderBuyAmount > 0 && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              내부자 매수 총액: {formatLargeUSD(s.insiderBuyAmount)}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── 섹션 4: 투자자별 포트폴리오 ──

function PortfolioSection({ managers }: { managers: Manager[] }) {
  const [selected, setSelected] = useState<Manager | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const loadHoldings = useCallback(async (mgr: Manager) => {
    setSelected(mgr);
    setOpen(false);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/superinvestor?section=holdings&manager=${encodeURIComponent(mgr.code)}`
      );
      const json = await res.json();
      setHoldings(json.holdings ?? []);
    } catch {
      setHoldings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div>
      {/* 드롭다운 */}
      <div className="relative mb-4 max-w-md">
        <button
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5 text-sm transition-colors hover:bg-accent"
        >
          <span className={selected ? "text-foreground" : "text-muted-foreground"}>
            {selected?.name ?? "투자자를 선택하세요"}
          </span>
          <ChevronDown size={16} className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
            {managers.map((m) => (
              <button
                key={m.code}
                onClick={() => loadHoldings(m)}
                className="block w-full px-4 py-2 text-left text-sm transition-colors hover:bg-accent"
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Holdings 표시 */}
      {loading && <SectionLoading />}
      {!loading && selected && holdings.length === 0 && (
        <SectionEmpty text="보유 종목 데이터를 불러올 수 없습니다." />
      )}
      {!loading && holdings.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {holdings.map((h) => {
            const isDown = h.changePct < 0;
            return (
              <div
                key={h.ticker}
                className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/30"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-base font-bold">
                      <TickerLink ticker={h.ticker} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {h.companyName}
                    </p>
                  </div>
                  <span
                    className="text-lg font-bold tabular-nums"
                    style={{ fontFamily: "'DM Mono', monospace" }}
                  >
                    {h.weightPercent.toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      h.activity.startsWith("Add") || h.activity === "Buy"
                        ? "bg-emerald-500/15 text-emerald-400"
                        : h.activity.startsWith("Reduce") ||
                            h.activity.startsWith("Sell")
                          ? "bg-red-500/15 text-red-400"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {h.activity || "Hold"}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums" style={{ fontFamily: "'DM Mono', monospace" }}>
                    {formatUSD(h.reportedPrice)}
                  </span>
                  <span
                    className={`text-xs font-medium tabular-nums ${isDown ? "text-red-400" : "text-emerald-400"}`}
                    style={{ fontFamily: "'DM Mono', monospace" }}
                  >
                    {h.changePct >= 0 ? "+" : ""}{h.changePct.toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!loading && !selected && (
        <SectionEmpty text="위에서 투자자를 선택하면 포트폴리오가 표시됩니다." />
      )}
    </div>
  );
}

// ── 메인 페이지 ──

export default function SuperinvestorPage() {
  const [consensus, setConsensus] = useState<ConsensusStock[]>([]);
  const [discountStocks, setDiscountStocks] = useState<DiscountStock[]>([]);
  const [insiderStocks, setInsiderStocks] = useState<InsiderStock[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [lastUpdated, setLastUpdated] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch("/api/superinvestor")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setConsensus(data.consensus ?? []);
        setDiscountStocks(data.discount ?? []);
        setInsiderStocks(data.insider ?? []);
        setManagers(data.managers ?? []);
        setLastUpdated(data.lastUpdated ?? "");
      })
      .catch(() => setError("데이터를 불러올 수 없습니다."))
      .finally(() => setLoading(false));
  }, []);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-red-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-8">
        {/* 헤더 */}
        <header className="mb-10">
          <h1 className="mb-2 text-3xl font-bold tracking-tight">
            슈퍼투자자 포트폴리오
          </h1>
          <p className="text-sm text-muted-foreground">
            82명의 슈퍼투자자 SEC 13F 공시 기반 분석 · Dataroma 제공
          </p>
          {lastUpdated && (
            <p className="mt-1 text-xs text-muted-foreground/60">
              기준일:{" "}
              {new Date(lastUpdated).toLocaleString("ko-KR", {
                timeZone: "Asia/Seoul",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
          <button
            onClick={() => setGuideOpen(true)}
            className="guide-btn mt-3 inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-all"
          >
            <HelpCircle size={13} />
            슈퍼투자자 보는 법
          </button>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground/30 border-t-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">
                ���퍼투자자 데이터를 분석하는 중...
              </p>
              <p className="mt-1 text-xs text-muted-foreground/50">
                최초 로딩 시 Dataroma 데이터 수집으로 시간이 걸릴 수 있습니다
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-12">
            {/* 섹션 1 */}
            <section>
              <SectionHeader
                icon={<Users size={20} />}
                title="이번 분기 거물들의 선택"
                desc="2명 이상의 슈퍼투자자가 동시에 매수(Buy/Add)한 종목"
                count={consensus.length}
              />
              <ConsensusSection stocks={consensus} />
            </section>

            <hr className="border-border" />

            {/* 섹��� 2 */}
            <section>
              <SectionHeader
                icon={<TrendingDown size={20} />}
                title="지금 할인 중인 거물 종목"
                desc="Hold Price(분기말 매수가) 대비 현재가가 낮고, 비중 3% 이상 보유자가 있는 종목"
                count={discountStocks.length}
              />
              <DiscountSection stocks={discountStocks} />
            </section>

            <hr className="border-border" />

            {/* 섹션 3 */}
            <section>
              <SectionHeader
                icon={<UserCheck size={20} />}
                title="거물 + 내부자 동시 매수"
                desc="슈퍼투자자와 기업 내부자가 함께 매수한 종목 (가장 강한 시그널)"
                count={insiderStocks.length}
              />
              <InsiderSection stocks={insiderStocks} />
            </section>

            <hr className="border-border" />

            {/* 섹션 4 */}
            <section>
              <SectionHeader
                icon={<Users size={20} />}
                title="투자자별 포트폴리오"
                desc="개별 슈퍼투자��의 전체 보유 종목과 비중"
              />
              <PortfolioSection managers={managers} />
            </section>
          </div>
        )}

        {/* 면책 */}
        <div className="mt-10 rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          <p>
            본 정보는 SEC 13F 공시(Dataroma 제공) 기반이며 투자 권유가 아닙니다.
            13F는 분기 종료 후 최대 45일 지연 공시되므로 현재 실제 보유 현황과
            다를 수 있습니다. 모든 투자 판단은 본인의 책임입니다.
          </p>
        </div>
      </div>

      {guideOpen && (
        <SuperinvestorGuideModal onClose={() => setGuideOpen(false)} />
      )}
    </div>
  );
}
