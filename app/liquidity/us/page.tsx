"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useDraggable } from "@/hooks/useDraggable";
import { useResizable } from "@/hooks/useResizable";

/* ── 타입 ── */

interface IndicatorResult {
  id: string;
  name: string;
  value: number;
  score: number;
  levelScore: number;
  momentumScore: number;
  combinedScore: number;
  unit: string;
  description: string;
  category: "macro" | "market";
  inverted: boolean;
}

type RegimeType = "RECOVERY" | "EXPANSION" | "SLOWDOWN" | "CONTRACTION";

interface LiquidityData {
  finalScore: number;
  macroScore: number;
  marketScore: number;
  subtitle: string;
  indicators: IndicatorResult[];
  regime: RegimeType;
  regimeLabel: string;
  regimeColor: string;
  regimeSignal: string;
  scoreChange3m: number | null;
  fetchedAt: string;
}

/* ── 점수 해석 ── */

function getScoreInfo(score: number) {
  if (score >= 75) return { label: "강한 상승 기대", color: "#16a34a", bg: "rgba(22,163,74,.12)", border: "rgba(22,163,74,.3)" };
  if (score >= 50) return { label: "보통 상승 기대", color: "#3b82f6", bg: "rgba(59,130,246,.12)", border: "rgba(59,130,246,.3)" };
  if (score >= 25) return { label: "약한 상승 기대", color: "#ca8a04", bg: "rgba(202,138,4,.12)", border: "rgba(202,138,4,.3)" };
  return { label: "위험 구간", color: "#dc2626", bg: "rgba(220,38,38,.12)", border: "rgba(220,38,38,.3)" };
}

function getBarColor(score: number) {
  if (score >= 75) return "#16a34a";
  if (score >= 50) return "#3b82f6";
  if (score >= 25) return "#ca8a04";
  return "#dc2626";
}

/* ── 아코디언 데이터 ── */

const GUIDE_DATA: Record<string, { title: string; body: string }> = {
  "net-liquidity": {
    title: "연준 순유동성이란?",
    body: "연준의 총자산(WALCL)에서 역레포(RRPONTSYD)와 재무부 일반계좌(TGA)를 뺀 값입니다. 시중에 실제로 돌아다니는 돈의 양을 나타냅니다. 이 값이 늘면 주식시장에 유리하고, 줄면 불리합니다. 변화 추세가 4~6개월 뒤 나스닥과 상관관계를 보입니다.",
  },
  "m2-growth": {
    title: "M2 통화량 증가율이란?",
    body: "현금, 수시입출금 예금, 저축성 예금 등 시중의 전체 돈의 양(M2)이 1년 전 대비 얼마나 변했는지 보여줍니다. 양수면 돈이 늘고 있다는 뜻이고, 음수면 돈이 줄어들고 있다는 뜻입니다. 2022년 사상 첫 마이너스 전환 후 나스닥이 -33% 하락했습니다.",
  },
  "t10y2y": {
    title: "장단기 금리차란?",
    body: "10년 국채 금리에서 2년 국채 금리를 뺀 값입니다. 이 값이 마이너스(역전)가 되면 경기침체 신호로 알려져 있습니다. 역전이 해소되면서 정상화될 때 나스닥이 반등하는 경향이 있어, 4~6개월 선행 지표로 활용됩니다.",
  },
  "copper-gold": {
    title: "구리/금 비율이란?",
    body: "구리(경기 민감 원자재) 가격을 금(안전자산) 가격으로 나눈 비율입니다. 구리가 강하면 경기 낙관, 금이 강하면 경기 비관을 반영합니다. 이 비율이 낮을 때(비관이 극심할 때) 역설적으로 4~6개월 후 나스닥이 반등하는 패턴이 관찰됩니다.",
  },
  "ted-spread": {
    title: "테드 스프레드란?",
    body: "3개월 LIBOR와 3개월 미국 국채 수익률의 차이입니다. 은행 간 대출에서 체감하는 위험 수준을 나타냅니다. 스프레드가 높으면 금융 시스템의 스트레스가 크다는 뜻이지만, 역사적으로 이런 공포가 극심한 시점에서 4~6개월 후 시장이 반등하는 경향이 있습니다.",
  },
  nfci: {
    title: "NFCI (금융상황지수)란?",
    body: "시카고 연준이 매주 발표하는 종합 금융상황 지표입니다. 105개의 금융 변수(금리, 스프레드, 레버리지 등)를 종합합니다. 양수이면 금융환경이 긴축적, 0 이하이면 완화적입니다. 절대 수준이 높을수록(긴축적일수록) 향후 반등 가능성이 높아지는 역발상 지표입니다.",
  },
};

/* ── 포맷 ── */

function formatKST(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

/* ── 컴포넌트 ── */

function ScoreGauge({ score }: { score: number }) {
  const info = getScoreInfo(score);
  return (
    <div className="rounded-xl border bg-card p-6 sm:p-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-muted-foreground mb-1">미국 유동성 종합 점수</p>
          <div className="flex items-baseline gap-3">
            <span className="text-5xl font-bold tabular-nums" style={{ color: info.color }}>
              {score}
            </span>
            <span className="text-lg text-muted-foreground">/ 100</span>
          </div>
        </div>
        <div
          className="rounded-lg px-4 py-2 text-sm font-semibold"
          style={{ backgroundColor: info.bg, color: info.color, border: `1px solid ${info.border}` }}
        >
          {info.label}
        </div>
      </div>
      {/* Gauge bar */}
      <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, backgroundColor: getBarColor(score) }}
        />
      </div>
      <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
        <span>위험</span>
        <span>약한 상승</span>
        <span>보통 상승</span>
        <span>강한 상승</span>
      </div>
    </div>
  );
}

function SubScore({ label, score }: { label: string; score: number }) {
  const info = getScoreInfo(score);
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums" style={{ color: info.color }}>
          {score}
        </span>
        <span className="text-xs" style={{ color: info.color }}>{info.label}</span>
      </div>
      <div className="w-full h-2 rounded-full bg-muted overflow-hidden mt-2">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, backgroundColor: getBarColor(score) }}
        />
      </div>
    </div>
  );
}

const REGIME_STYLES: Record<RegimeType, { color: string; bg: string; border: string; emoji: string }> = {
  RECOVERY: { color: "#3b82f6", bg: "rgba(59,130,246,.12)", border: "rgba(59,130,246,.3)", emoji: "↗" },
  EXPANSION: { color: "#16a34a", bg: "rgba(22,163,74,.12)", border: "rgba(22,163,74,.3)", emoji: "↑" },
  SLOWDOWN: { color: "#ea580c", bg: "rgba(234,88,12,.12)", border: "rgba(234,88,12,.3)", emoji: "↘" },
  CONTRACTION: { color: "#dc2626", bg: "rgba(220,38,38,.12)", border: "rgba(220,38,38,.3)", emoji: "↓" },
};

const REGIME_QUADRANTS: { type: RegimeType; label: string; desc: string }[] = [
  { type: "RECOVERY", label: "바닥 탈출", desc: "점수 낮지만 상승 중" },
  { type: "EXPANSION", label: "상승 지속", desc: "점수 높고 상승 중" },
  { type: "SLOWDOWN", label: "고점 경고", desc: "점수 높지만 하락 중" },
  { type: "CONTRACTION", label: "하락 지속", desc: "점수 낮고 하락 중" },
];

function RegimeCard({ data }: { data: LiquidityData }) {
  const style = REGIME_STYLES[data.regime];
  return (
    <div className="rounded-xl border bg-card p-6 sm:p-8 mt-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-muted-foreground mb-1">현재 유동성 국면</p>
          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold" style={{ color: style.color }}>
              {style.emoji} {data.regimeLabel}
            </span>
          </div>
        </div>
        <div
          className="rounded-lg px-4 py-2 text-sm font-semibold"
          style={{ backgroundColor: style.bg, color: style.color, border: `1px solid ${style.border}` }}
        >
          {data.regime}
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        {data.regime === "RECOVERY" && "유동성 개선 중 — 과거 평균 6개월 +10.2% 수익률 구간"}
        {data.regime === "EXPANSION" && "유동성 양호 — 과거 평균 6개월 +12.0% 수익률 구간, 승률 90.9%"}
        {data.regime === "SLOWDOWN" && "유동성 둔화 중 — 과거 평균 6개월 +5.6% 수익률 구간, 주의"}
        {data.regime === "CONTRACTION" && "유동성 악화 중 — 과거 평균 6개월 +9.8% 수익률이나 변동성 높음"}
      </p>
      {data.scoreChange3m != null && (
        <p className="text-sm mb-4">
          3개월 전 대비{" "}
          <span className="font-semibold" style={{ color: data.scoreChange3m > 0 ? "#16a34a" : data.scoreChange3m < 0 ? "#dc2626" : "#888" }}>
            {data.scoreChange3m > 0 ? "+" : ""}{data.scoreChange3m}점
          </span>
        </p>
      )}
      {/* 4-quadrant legend */}
      <div className="grid grid-cols-2 gap-2 mt-4">
        {REGIME_QUADRANTS.map((q) => {
          const s = REGIME_STYLES[q.type];
          const isActive = q.type === data.regime;
          return (
            <div
              key={q.type}
              className="rounded-lg px-3 py-2 text-xs"
              style={{
                backgroundColor: isActive ? s.bg : "transparent",
                border: `1px solid ${isActive ? s.border : "rgba(255,255,255,0.08)"}`,
                opacity: isActive ? 1 : 0.5,
              }}
            >
              <span className="font-semibold" style={{ color: s.color }}>{s.emoji} {q.label}</span>
              <span className="text-muted-foreground ml-1">— {q.desc}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IndicatorCard({ ind, onGuideOpen }: { ind: IndicatorResult; onGuideOpen?: () => void }) {
  const barColor = getBarColor(ind.score);
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">{ind.name}</p>
          {onGuideOpen && (
            <button
              onClick={onGuideOpen}
              className="guide-btn inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
              보는 법
            </button>
          )}
        </div>
        <span
          className="text-xs font-mono font-semibold px-2 py-0.5 rounded"
          style={{ backgroundColor: `${barColor}20`, color: barColor }}
        >
          {ind.score}점
        </span>
      </div>
      <div className="flex items-baseline gap-1.5 mb-2">
        <span className="text-xl font-bold tabular-nums">{ind.value}</span>
        {ind.unit && <span className="text-xs text-muted-foreground">{ind.unit}</span>}
      </div>
      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden mb-2">
        <div
          className="h-full rounded-full"
          style={{ width: `${ind.score}%`, backgroundColor: barColor }}
        />
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{ind.description}</p>
      <p className="text-[10px] text-muted-foreground/60 mt-1">
        레벨 {ind.levelScore} · 모멘텀 {ind.momentumScore}
      </p>
      {ind.inverted && (
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">* 낮을수록 유동성에 유리 (점수 역산)</p>
      )}
    </div>
  );
}

function GuideAccordion() {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold mb-4">지표 설명</h2>
      <div className="flex flex-col gap-2">
        {Object.entries(GUIDE_DATA).map(([id, { title, body }]) => (
          <div key={id} className="rounded-lg border bg-card overflow-hidden">
            <button
              onClick={() => setOpenId(openId === id ? null : id)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-left hover:bg-accent/50 transition-colors"
            >
              {title}
              <span className="text-muted-foreground text-xs">{openId === id ? "▲" : "▼"}</span>
            </button>
            {openId === id && (
              <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">
                {body}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── 연준 순유동성 보는 법 모달 ── */

function NetLiquidityGuideModal({ onClose }: { onClose: () => void }) {
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

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div data-draggable-modal className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" style={{ transform: `translate(${position.x}px, ${position.y}px)`, ...(size.width ? { width: size.width, height: size.height } : { width: "100%", maxWidth: "56rem" }) }}>
      <div className="overflow-y-auto p-6 sm:p-8" style={{ maxHeight: size.height ? size.height - 2 : "85vh" }}>
        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>

        <h2 className="mb-6 text-xl font-bold cursor-move select-none" onMouseDown={handleMouseDown}>연준 순유동성 보는 법</h2>

        {/* 섹션1: 한 줄 요약 */}
        <section className="mb-6">
          <p className="text-sm leading-relaxed text-muted-foreground">
            연준이 시장에 실제로 풀어놓은 돈이 얼마나 되는지 보는 지표입니다.
          </p>
        </section>

        <hr className="my-5 border-border" />

        {/* 섹션2: 왜 단순히 연준 자산만 보면 안 되나 */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">연준이 돈을 풀었다고 다 시장에 오는 게 아니에요</h3>
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground space-y-2">
            <p>태양님이 식당을 운영해요. 오늘 매출이 1,000만원이에요.</p>
            <p>근데 직원 월급, 식재료, 임대료를 빼면 실제 내 손에 남는 돈은 350만원이에요.</p>
            <p><strong className="text-foreground">매출만 보면 착각해요. 연준도 마찬가지예요.</strong></p>
            <p>연준이 아무리 많은 돈을 풀어도, 그 돈이 전부 시장에 도는 게 아니에요.</p>
          </div>
        </section>

        <hr className="my-5 border-border" />

        {/* 섹션3: 3가지 항목 설명 */}
        <section className="mb-6">
          <h3 className="mb-3 text-base font-semibold">계산식: WALCL - RRP - TGA</h3>

          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <h4 className="mb-1.5 text-sm font-semibold">
                WALCL (연준 자산 전체){" "}
                <span className="font-normal text-muted-foreground">— 수도꼭지에서 나온 물 전체</span>
              </h4>
              <p className="text-sm leading-relaxed text-muted-foreground">
                연준이 시장에서 사들인 국채, 주택담보채권 등의 총합이에요.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <h4 className="mb-1.5 text-sm font-semibold">
                역레포 RRP (다시 빨아들인 돈){" "}
                <span className="font-normal text-muted-foreground">— 배수구로 다시 빠진 물</span>
              </h4>
              <div className="text-sm leading-relaxed text-muted-foreground space-y-2">
                <p>은행들이 &ldquo;나 지금 쓸 데 없어&rdquo; 하면서 연준에 다시 맡긴 돈이에요.</p>
                <p className="text-xs text-muted-foreground/70">
                  실제 사례: 2021~2022년 코로나 때 연준이 돈을 엄청 풀었는데, 은행들이 그 돈을 다 쓰지 못하고 연준에 다시 맡겨버렸어요. RRP가 2조 달러까지 올라갔었어요.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <h4 className="mb-1.5 text-sm font-semibold">
                TGA (정부 금고){" "}
                <span className="font-normal text-muted-foreground">— 저수지에 가둬놓은 물</span>
              </h4>
              <div className="text-sm leading-relaxed text-muted-foreground space-y-2">
                <p>미국 재무부(정부)가 연준에 갖고 있는 통장이에요.</p>
                <p>세금 걷으면 여기 쌓이고, 정부가 돈 쓸 때 여기서 나가요. 저수지에 있는 동안은 동네에 안 와요.</p>
              </div>
            </div>
          </div>
        </section>

        <hr className="my-5 border-border" />

        {/* 섹션4: 실제 계산 예시 */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">실제로 이렇게 계산해요</h3>
          <div className="rounded-lg border border-border bg-muted/30 p-4 font-mono text-sm leading-relaxed text-muted-foreground">
            <div className="space-y-1">
              <p>연준 자산 (WALCL): &nbsp;&nbsp;&nbsp; 6,700억 달러</p>
              <p>역레포 (RRP): &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; - &nbsp;400억 달러</p>
              <p>정부 금고 (TGA): &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; - &nbsp;500억 달러</p>
              <p className="border-t border-border pt-1 font-semibold text-foreground">실제 순유동성: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 5,800억 달러</p>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            WALCL만 보면 &ldquo;6,700억이나 있네, 풍부하다&rdquo;고 착각해요.
            순유동성을 보면 <strong className="text-foreground">&ldquo;실제로 시장에 도는 건 5,800억이네&rdquo;</strong>가 맞아요.
          </p>
        </section>

        <hr className="my-5 border-border" />

        {/* 섹션5: 점수 해석 */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">점수를 어떻게 읽나요?</h3>
          <div className="text-sm leading-relaxed text-muted-foreground space-y-2">
            <p>이 지표는 지금 값이 높냐 낮냐보다 <strong className="text-foreground">방향이 중요</strong>해요.</p>
            <div className="flex flex-col gap-1.5 mt-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: "#16a34a" }} />
                <span><strong className="text-foreground">늘어나는 중</strong> → 좋아지는 신호</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: "#dc2626" }} />
                <span><strong className="text-foreground">줄어드는 중</strong> → 나빠지는 신호</span>
              </div>
            </div>
            <p className="mt-2">과거 10년 데이터와 비교해서 현재 변화 속도가 빠를수록 점수가 높아요.</p>
          </div>
        </section>

        <hr className="my-5 border-border" />

        {/* 섹션6: 왜 4~6개월 선행인가 */}
        <section className="mb-2">
          <h3 className="mb-2 text-base font-semibold">왜 지금 변화가 4~6개월 뒤 나스닥에 영향을 주나요?</h3>
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground space-y-2">
            <p>봄에 씨앗을 심으면 (연준이 돈을 풀기 시작)</p>
            <p>씨앗이 발아하고 자라는 데 시간이 걸려요.</p>
            <p>4~6개월 뒤에 수확해요. (나스닥이 반응)</p>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            돈이 풀리면 → 기업들이 대출을 받고 → 투자를 하고 → 실적이 좋아지고 → 그때서야 주가가 반응해요.
            <strong className="text-foreground"> 이 과정이 4~6개월 걸려요.</strong>
          </p>
        </section>
      </div>

      {/* 리사이즈 핸들 */}
      <div
        className="absolute right-0 bottom-0 w-5 h-5 cursor-se-resize"
        onMouseDown={handleResizeMouseDown}
        style={{ background: "linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.15) 50%)" }}
      />
      </div>
    </div>
  );
}

/* ── M2 통화량 증가율 보는 법 모달 ── */

function M2GrowthGuideModal({ onClose }: { onClose: () => void }) {
  const { position, handleMouseDown } = useDraggable();
  const { size, handleResizeMouseDown } = useResizable();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div data-draggable-modal className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" style={{ transform: `translate(${position.x}px, ${position.y}px)`, ...(size.width ? { width: size.width, height: size.height } : { width: "100%", maxWidth: "56rem" }) }}>
      <div className="overflow-y-auto p-6 sm:p-8" style={{ maxHeight: size.height ? size.height - 2 : "85vh" }}>
        <button onClick={onClose} className="absolute right-4 top-4 z-10 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>

        <h2 className="mb-6 text-xl font-bold cursor-move select-none" onMouseDown={handleMouseDown}>M2 통화량 증가율 보는 법</h2>

        <section className="mb-6">
          <p className="text-sm leading-relaxed text-muted-foreground">
            시중 은행 전체에 돈이 작년보다 얼마나 늘었는지 보는 지표입니다.
          </p>
        </section>

        <hr className="my-5 border-border" />

        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">연준 순유동성과 뭐가 달라요?</h3>
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground space-y-2">
            <p>연준 순유동성이 &ldquo;중앙은행 본사에서 나오는 돈&rdquo;이라면,</p>
            <p>M2는 <strong className="text-foreground">&ldquo;전국 모든 은행 지점에 실제로 있는 돈&rdquo;</strong>이에요.</p>
            <p>본사에서 돈을 풀어도 지점들에 실제로 얼마나 퍼졌는지는 M2를 봐야 알 수 있어요.</p>
          </div>
        </section>

        <hr className="my-5 border-border" />

        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">계산 방법</h3>
          <div className="rounded-lg border border-border bg-muted/30 p-4 font-mono text-sm leading-relaxed text-muted-foreground">
            <p>M2 증가율 = (이번 달 M2 - 작년 같은 달 M2) &divide; 작년 같은 달 M2 &times; 100</p>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            쉽게 말하면 작년 이맘때보다 시중에 돈이 몇 % 늘었냐예요.
          </p>
        </section>

        <hr className="my-5 border-border" />

        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">실제 사례로 이해해요</h3>
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
              <p><strong className="text-foreground">2021년:</strong> M2 증가율 +27% → 코로나 때 돈을 엄청 풀었어요 → 나스닥 폭등</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
              <p><strong className="text-foreground">2022년:</strong> M2 증가율 급감 → 금리 인상으로 돈이 줄었어요 → 나스닥 폭락</p>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            증가율이 높을수록 시중에 돈이 풍부한 상태예요.
          </p>
        </section>

        <hr className="my-5 border-border" />

        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">점수를 어떻게 읽나요?</h3>
          <div className="text-sm leading-relaxed text-muted-foreground space-y-2">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: "#16a34a" }} />
                <span><strong className="text-foreground">늘어나는 중</strong> → 시중에 돈이 풍부해지는 신호</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: "#dc2626" }} />
                <span><strong className="text-foreground">줄어드는 중</strong> → 시중에서 돈이 빠져나가는 신호</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground/70">단, 이 데이터는 한 달 늦게 발표돼요. 실시간이 아닌 점 참고하세요.</p>
          </div>
        </section>

        <hr className="my-5 border-border" />

        <section className="mb-2">
          <h3 className="mb-2 text-base font-semibold">왜 4~6개월 선행인가요?</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            M2가 늘어나면 → 사람들이 쓸 돈이 많아지고 → 기업 실적이 좋아지고 → <strong className="text-foreground">4~6개월 뒤 주가에 반영</strong>돼요.
          </p>
        </section>
      </div>
      <div className="absolute right-0 bottom-0 w-5 h-5 cursor-se-resize" onMouseDown={handleResizeMouseDown} style={{ background: "linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.15) 50%)" }} />
      </div>
    </div>
  );
}

/* ── 장단기 금리차 보는 법 모달 ── */

function T10Y2YGuideModal({ onClose }: { onClose: () => void }) {
  const { position, handleMouseDown } = useDraggable();
  const { size, handleResizeMouseDown } = useResizable();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div data-draggable-modal className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" style={{ transform: `translate(${position.x}px, ${position.y}px)`, ...(size.width ? { width: size.width, height: size.height } : { width: "100%", maxWidth: "56rem" }) }}>
      <div className="overflow-y-auto p-6 sm:p-8" style={{ maxHeight: size.height ? size.height - 2 : "85vh" }}>
        <button onClick={onClose} className="absolute right-4 top-4 z-10 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>

        <h2 className="mb-6 text-xl font-bold cursor-move select-none" onMouseDown={handleMouseDown}>장단기 금리차 보는 법</h2>

        <section className="mb-6">
          <p className="text-sm leading-relaxed text-muted-foreground">
            10년짜리 금리와 2년짜리 금리의 차이. 경기침체 신호를 미리 알려주는 지표입니다.
          </p>
        </section>

        <hr className="my-5 border-border" />

        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">이게 왜 중요한가요?</h3>
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground space-y-2">
            <p>보통 5년짜리 예금이 1년짜리 예금보다 이자가 높아요.</p>
            <p>기다리는 시간이 길수록 더 많이 받아야 하니까요.</p>
            <p>근데 이게 뒤집히면? 1년짜리가 5년짜리보다 이자가 높아진다면?</p>
            <p>→ 시장이 <strong className="text-foreground">&ldquo;미래보다 지금이 더 위험하다&rdquo;</strong>고 판단한 거예요.</p>
            <p>→ 이걸 <strong className="text-foreground">금리 역전</strong>이라고 해요.</p>
          </div>
        </section>

        <hr className="my-5 border-border" />

        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">정상 vs 역전</h3>
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: "#16a34a" }} />
                <strong className="text-foreground">정상:</strong>
              </div>
              <p>10년 금리 &gt; 2년 금리 → 양수 → 경기 건강</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: "#dc2626" }} />
                <strong className="text-foreground">역전:</strong>
              </div>
              <p>10년 금리 &lt; 2년 금리 → 음수 → 경기침체 경고</p>
            </div>
          </div>
          <div className="mt-3 text-sm leading-relaxed text-muted-foreground space-y-1">
            <p>역전이 발생한 후 평균 12~18개월 뒤에 경기침체가 왔어요.</p>
            <p>1970년 이후 거의 모든 경기침체 전에 역전이 먼저 발생했어요.</p>
          </div>
        </section>

        <hr className="my-5 border-border" />

        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">실제 사례</h3>
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
              <p><strong className="text-foreground">2019년 하반기:</strong> 역전 발생 → 2020년 코로나 경기침체</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
              <p><strong className="text-foreground">2022년 중반:</strong> 역전 발생 → 2022~2023년 경기 둔화</p>
            </div>
          </div>
        </section>

        <hr className="my-5 border-border" />

        <section className="mb-2">
          <h3 className="mb-2 text-base font-semibold">점수를 어떻게 읽나요?</h3>
          <div className="text-sm leading-relaxed text-muted-foreground space-y-2">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: "#16a34a" }} />
                <span><strong className="text-foreground">역전이 풀리는 중</strong> (음수 → 양수로 회복) → 나스닥 반등 신호</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: "#dc2626" }} />
                <span><strong className="text-foreground">역전이 심해지는 중</strong> → 경기침체 우려 커지는 중</span>
              </div>
            </div>
          </div>
        </section>
      </div>
      <div className="absolute right-0 bottom-0 w-5 h-5 cursor-se-resize" onMouseDown={handleResizeMouseDown} style={{ background: "linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.15) 50%)" }} />
      </div>
    </div>
  );
}

/* ── 구리/금 비율 보는 법 모달 ── */

function CopperGoldGuideModal({ onClose }: { onClose: () => void }) {
  const { position, handleMouseDown } = useDraggable();
  const { size, handleResizeMouseDown } = useResizable();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div data-draggable-modal className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" style={{ transform: `translate(${position.x}px, ${position.y}px)`, ...(size.width ? { width: size.width, height: size.height } : { width: "100%", maxWidth: "56rem" }) }}>
      <div className="overflow-y-auto p-6 sm:p-8" style={{ maxHeight: size.height ? size.height - 2 : "85vh" }}>
        <button onClick={onClose} className="absolute right-4 top-4 z-10 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>

        <h2 className="mb-6 text-xl font-bold cursor-move select-none" onMouseDown={handleMouseDown}>구리/금 비율 보는 법</h2>

        <section className="mb-6">
          <p className="text-sm leading-relaxed text-muted-foreground">
            경기 낙관(구리)과 경기 비관(금)의 싸움. 비율이 낮을수록 역설적으로 반등 신호입니다.
          </p>
        </section>

        <hr className="my-5 border-border" />

        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">구리와 금이 각각 뭘 의미하나요?</h3>
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground space-y-1">
              <p><strong className="text-foreground">구리:</strong> 공장, 건설, 전자제품에 쓰이는 원자재예요.</p>
              <p>경기가 좋으면 수요가 늘어서 가격이 올라요. → &ldquo;경기 낙관의 금속&rdquo;</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground space-y-1">
              <p><strong className="text-foreground">금:</strong> 위기 때 사람들이 몰리는 안전자산이에요.</p>
              <p>불안할 때 가격이 올라요. → &ldquo;경기 비관의 금속&rdquo;</p>
            </div>
          </div>
          <div className="mt-3 text-sm leading-relaxed text-muted-foreground space-y-1">
            <p><strong className="text-foreground">구리/금 비율이 높다</strong> → 경기 낙관 심리 강함</p>
            <p><strong className="text-foreground">구리/금 비율이 낮다</strong> → 경기 비관 심리 강함</p>
          </div>
        </section>

        <hr className="my-5 border-border" />

        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">왜 역발상 지표인가요?</h3>
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground space-y-2">
            <p>이 지표는 다른 지표들과 반대로 작동해요.</p>
            <p>비율이 낮다 = 시장이 이미 많이 불안하고 빠진 상태</p>
            <p>= 바닥일 가능성이 높음</p>
            <p>= <strong className="text-foreground">6개월 뒤 반등 가능성 높음</strong></p>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            비유: 모든 사람이 겁먹고 팔 때가 사실 살 때인 것처럼요.
          </p>
        </section>

        <hr className="my-5 border-border" />

        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">실제 사례</h3>
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground space-y-2">
            <p><strong className="text-foreground">2020년 3월 코로나 바닥:</strong></p>
            <p>구리/금 비율 역사적 최저</p>
            <p>→ 6개월 뒤 나스닥 역사상 최대 반등</p>
          </div>
        </section>

        <hr className="my-5 border-border" />

        <section className="mb-2">
          <h3 className="mb-2 text-base font-semibold">점수를 어떻게 읽나요?</h3>
          <div className="text-sm leading-relaxed text-muted-foreground space-y-2">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: "#16a34a" }} />
                <span><strong className="text-foreground">비율이 역사적으로 낮은 상태</strong> → 역설적으로 높은 점수 (반등 기대)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: "#dc2626" }} />
                <span><strong className="text-foreground">비율이 역사적으로 높은 상태</strong> → 낮은 점수 (고점 주의)</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground/70">현재 구리/금 비율이 매우 낮은 상태 (11점대) → 역사적으로 강한 반등이 나왔던 구간</p>
          </div>
        </section>
      </div>
      <div className="absolute right-0 bottom-0 w-5 h-5 cursor-se-resize" onMouseDown={handleResizeMouseDown} style={{ background: "linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.15) 50%)" }} />
      </div>
    </div>
  );
}

/* ── 테드 스프레드 보는 법 모달 ── */

function TedSpreadGuideModal({ onClose }: { onClose: () => void }) {
  const { position, handleMouseDown } = useDraggable();
  const { size, handleResizeMouseDown } = useResizable();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div data-draggable-modal className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" style={{ transform: `translate(${position.x}px, ${position.y}px)`, ...(size.width ? { width: size.width, height: size.height } : { width: "100%", maxWidth: "56rem" }) }}>
      <div className="overflow-y-auto p-6 sm:p-8" style={{ maxHeight: size.height ? size.height - 2 : "85vh" }}>
        <button onClick={onClose} className="absolute right-4 top-4 z-10 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>

        <h2 className="mb-6 text-xl font-bold cursor-move select-none" onMouseDown={handleMouseDown}>테드 스프레드 보는 법</h2>

        <section className="mb-6">
          <p className="text-sm leading-relaxed text-muted-foreground">
            은행들이 서로를 얼마나 믿는지 보는 지표. 높을수록 금융 시스템이 불안한 상태입니다.
          </p>
        </section>

        <hr className="my-5 border-border" />

        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">테드 스프레드가 뭔가요?</h3>
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground space-y-2">
            <p><strong className="text-foreground">테드 스프레드 = 은행들끼리 돈 빌릴 때 이자 - 미국 국채 이자</strong></p>
            <p>친한 친구한테 돈 빌려줄 때: 이자 0% (완전히 신뢰)</p>
            <p>잘 모르는 사람한테 빌려줄 때: 이자 10% (불신)</p>
            <p>테드 스프레드가 크다 = 은행들이 서로를 못 믿는 상태 = 금융 시스템 위기 신호</p>
          </div>
        </section>

        <hr className="my-5 border-border" />

        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">왜 역발상 지표인가요?</h3>
          <div className="text-sm leading-relaxed text-muted-foreground space-y-2">
            <p>높을수록 금융 시스템이 불안한 상태예요.</p>
            <p>근데 <strong className="text-foreground">불안이 극에 달했을 때가 오히려 바닥</strong>이에요.</p>
            <p>테드 스프레드가 매우 높았던 이후 5개월 뒤 나스닥이 반등하는 경향이 있어요.</p>
          </div>
        </section>

        <hr className="my-5 border-border" />

        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">실제 사례</h3>
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground space-y-1">
              <p><strong className="text-foreground">2008년 금융위기:</strong> 테드 스프레드 4.6%까지 폭등</p>
              <p>→ 은행들이 서로를 전혀 못 믿는 상태</p>
              <p>→ 이후 2009년 대반등</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground space-y-1">
              <p><strong className="text-foreground">현재 (2026년 3월):</strong> 0.09%</p>
              <p>→ 역사적 최저 수준</p>
              <p>→ 은행들이 서로를 완전히 신뢰하는 상태</p>
            </div>
          </div>
        </section>

        <hr className="my-5 border-border" />

        <section className="mb-2">
          <h3 className="mb-2 text-base font-semibold">점수를 어떻게 읽나요?</h3>
          <div className="text-sm leading-relaxed text-muted-foreground space-y-2">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: "#16a34a" }} />
                <span><strong className="text-foreground">낮을수록</strong> → 금융 안정 → 높은 점수</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: "#dc2626" }} />
                <span><strong className="text-foreground">높을수록</strong> → 금융 불안 → 낮은 점수</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground/70">단, 극단적으로 높으면 오히려 반등 신호일 수 있어요.</p>
          </div>
        </section>
      </div>
      <div className="absolute right-0 bottom-0 w-5 h-5 cursor-se-resize" onMouseDown={handleResizeMouseDown} style={{ background: "linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.15) 50%)" }} />
      </div>
    </div>
  );
}

/* ── NFCI 보는 법 모달 ── */

function NfciGuideModal({ onClose }: { onClose: () => void }) {
  const { position, handleMouseDown } = useDraggable();
  const { size, handleResizeMouseDown } = useResizable();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div data-draggable-modal className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" style={{ transform: `translate(${position.x}px, ${position.y}px)`, ...(size.width ? { width: size.width, height: size.height } : { width: "100%", maxWidth: "56rem" }) }}>
      <div className="overflow-y-auto p-6 sm:p-8" style={{ maxHeight: size.height ? size.height - 2 : "85vh" }}>
        <button onClick={onClose} className="absolute right-4 top-4 z-10 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>

        <h2 className="mb-6 text-xl font-bold cursor-move select-none" onMouseDown={handleMouseDown}>NFCI 보는 법</h2>

        <section className="mb-6">
          <p className="text-sm leading-relaxed text-muted-foreground">
            미국 금융 상황 전체를 105가지 항목으로 종합한 건강검진 점수입니다.
          </p>
        </section>

        <hr className="my-5 border-border" />

        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">NFCI가 뭔가요?</h3>
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground space-y-2">
            <p>병원 건강검진을 받았어요.</p>
            <p>혈압, 혈당, 콜레스테롤, 체중... 105가지 항목을 다 재서 종합 점수를 내는 거예요.</p>
            <p><strong className="text-foreground">NFCI = 미국 금융 시스템 건강검진 종합 점수</strong></p>
            <p>시카고 연준이 매주 직접 계산해서 발표해요.</p>
          </div>
        </section>

        <hr className="my-5 border-border" />

        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">다른 지표와 뭐가 달라요?</h3>
          <div className="text-sm leading-relaxed text-muted-foreground space-y-2">
            <div className="flex flex-col gap-1.5">
              <p><strong className="text-foreground">다른 지표들:</strong> 내가 직접 계산</p>
              <p><strong className="text-foreground">NFCI:</strong> 연준 전문가들이 이미 계산해서 발표</p>
            </div>
            <p className="mt-2">계산 오류 위험이 없고, <strong className="text-foreground">신뢰도가 6개 지표 중 가장 높아요.</strong></p>
            <p>금리, 신용, 레버리지, 위험자산 등 105개 항목을 종합하기 때문에 어느 한 곳에서 문제가 생겨도 잡아낼 수 있어요.</p>
          </div>
        </section>

        <hr className="my-5 border-border" />

        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">어떻게 읽나요?</h3>
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: "#16a34a" }} />
                <strong className="text-foreground">NFCI 0 미만 (음수)</strong>
              </div>
              <p>→ 평균보다 건강한 상태 → 좋음</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: "#dc2626" }} />
                <strong className="text-foreground">NFCI 0 이상 (양수)</strong>
              </div>
              <p>→ 평균보다 불건강한 상태 → 나쁨</p>
            </div>
          </div>
          <div className="mt-3 text-sm leading-relaxed text-muted-foreground space-y-1">
            <p><strong className="text-foreground">2020년 3월 코로나:</strong> +1.27 (매우 불건강)</p>
            <p><strong className="text-foreground">2021년 중반:</strong> -0.8 (매우 건강)</p>
            <p><strong className="text-foreground">현재:</strong> -0.514 (건강한 상태)</p>
          </div>
        </section>

        <hr className="my-5 border-border" />

        <section className="mb-2">
          <h3 className="mb-2 text-base font-semibold">점수를 어떻게 읽나요?</h3>
          <div className="text-sm leading-relaxed text-muted-foreground space-y-2">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: "#16a34a" }} />
                <span><strong className="text-foreground">음수이고 더 내려가는 중</strong> → 금융 상황 좋아지는 중 → 높은 점수</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: "#dc2626" }} />
                <span><strong className="text-foreground">양수이고 올라가는 중</strong> → 금융 상황 나빠지는 중 → 낮은 점수</span>
              </div>
            </div>
          </div>
        </section>
      </div>
      <div className="absolute right-0 bottom-0 w-5 h-5 cursor-se-resize" onMouseDown={handleResizeMouseDown} style={{ background: "linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.15) 50%)" }} />
      </div>
    </div>
  );
}

/* ── 지표 ID → 모달 매핑 ── */

const GUIDE_MODALS: Record<string, React.ComponentType<{ onClose: () => void }>> = {
  "net-liquidity": NetLiquidityGuideModal,
  "m2-growth": M2GrowthGuideModal,
  "t10y2y": T10Y2YGuideModal,
  "copper-gold": CopperGoldGuideModal,
  "ted-spread": TedSpreadGuideModal,
  "nfci": NfciGuideModal,
};

/* ── 메인 페이지 ── */

export default function UsLiquidityPage() {
  const [data, setData] = useState<LiquidityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openGuide, setOpenGuide] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/liquidity/us")
      .then((r) => {
        if (!r.ok) throw new Error("API 오류");
        return r.json();
      })
      .then((d: LiquidityData) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const macroIndicators = data?.indicators.filter((i) => i.category === "macro") ?? [];
  const marketIndicators = data?.indicators.filter((i) => i.category === "market") ?? [];

  return (
    <main className="max-w-4xl mx-auto px-4 py-12 sm:px-8 sm:py-20">
      <header className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          미국 유동성 지표
        </h1>
        <p className="mt-2 text-muted-foreground">
          유동성 점수로 보는 나스닥 6개월 기대 수익률 강도
        </p>
        {data?.fetchedAt && (
          <p className="mt-1 text-xs text-muted-foreground">
            마지막 업데이트: {formatKST(data.fetchedAt)}
          </p>
        )}
      </header>

      {/* 로딩 */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          데이터를 불러오는 중...
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="py-20 text-center text-red-500">
          데이터를 불러오지 못했습니다: {error}
        </div>
      )}

      {/* 데이터 */}
      {data && !loading && !error && (
        <>
          {/* 종합 점수 */}
          <ScoreGauge score={data.finalScore} />

          {/* 하위 점수 */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <SubScore label="거시 유동성" score={data.macroScore} />
            <SubScore label="마켓 유동성" score={data.marketScore} />
          </div>

          {/* 국면 카드 */}
          <RegimeCard data={data} />

          {/* 거시 유동성 지표 */}
          <section className="mt-10">
            <h2 className="text-lg font-bold mb-4">거시 유동성</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {macroIndicators.map((ind) => (
                <IndicatorCard key={ind.id} ind={ind} onGuideOpen={ind.id in GUIDE_MODALS ? () => setOpenGuide(ind.id) : undefined} />
              ))}
            </div>
          </section>

          {/* 마켓 유동성 지표 */}
          <section className="mt-10">
            <h2 className="text-lg font-bold mb-4">마켓 유동성</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {marketIndicators.map((ind) => (
                <IndicatorCard key={ind.id} ind={ind} onGuideOpen={ind.id in GUIDE_MODALS ? () => setOpenGuide(ind.id) : undefined} />
              ))}
            </div>
          </section>

          {/* 점수 해석 기준 */}
          <section className="mt-10 rounded-xl border-l-4 border-blue-500 bg-blue-500/10 px-5 py-4">
            <p className="text-sm font-semibold text-blue-400 mb-3">점수 구간별 6개월 기대 수익률</p>
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-start gap-2">
                <span className="w-3 h-3 rounded-full shrink-0 mt-1" style={{ backgroundColor: "#16a34a" }} />
                <div>
                  <span className="font-semibold">75+ 강한 상승 기대</span>
                  <span className="text-muted-foreground ml-2">과거 데이터 기준 6개월 뒤 평균 +15.7% 수익률 구간</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-3 h-3 rounded-full shrink-0 mt-1" style={{ backgroundColor: "#3b82f6" }} />
                <div>
                  <span className="font-semibold">50~75 보통 상승 기대</span>
                  <span className="text-muted-foreground ml-2">과거 데이터 기준 6개월 뒤 평균 +9.1% 수익률 구간</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-3 h-3 rounded-full shrink-0 mt-1" style={{ backgroundColor: "#ca8a04" }} />
                <div>
                  <span className="font-semibold">25~50 약한 상승 기대</span>
                  <span className="text-muted-foreground ml-2">과거 데이터 기준 6개월 뒤 평균 +10.0% 수익률 구간</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-3 h-3 rounded-full shrink-0 mt-1" style={{ backgroundColor: "#dc2626" }} />
                <div>
                  <span className="font-semibold">25 이하 위험 구간</span>
                  <span className="text-muted-foreground ml-2">데이터 부족 구간. 과거 사례 없음, 보수적 접근 필요</span>
                </div>
              </div>
            </div>
          </section>

          {/* 안내 문구 */}
          <section className="mt-6 rounded-xl bg-blue-500/5 border border-blue-500/20 px-5 py-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              이 지표는 나스닥 방향(상승/하락)을 예측하지 않습니다.
              과거 10년 데이터 기준으로 유동성 점수가 높을 때
              6개월 뒤 평균 수익률이 높았다는 통계적 경향을 보여줍니다.
              투자 결과를 보장하지 않습니다.
            </p>
          </section>

          {/* 지표 설명 아코디언 */}
          <GuideAccordion />

          <div className="mt-10 text-center">
            <Link
              href="/liquidity/us/backtest"
              className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              백테스트 결과 보기 →
            </Link>
          </div>

          <p className="mt-6 text-xs text-muted-foreground text-center">
            본 페이지의 모든 지표와 점수는 참고용이며, 투자 권유가 아닙니다.
          </p>
        </>
      )}

      {/* 보는 법 모달 */}
      {openGuide && GUIDE_MODALS[openGuide] && (() => {
        const Modal = GUIDE_MODALS[openGuide];
        return <Modal onClose={() => setOpenGuide(null)} />;
      })()}
    </main>
  );
}
