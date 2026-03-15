"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

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
  if (score >= 75) return { label: "유동성 풍부", color: "#16a34a", bg: "rgba(22,163,74,.12)", border: "rgba(22,163,74,.3)" };
  if (score >= 50) return { label: "중립", color: "#ca8a04", bg: "rgba(202,138,4,.12)", border: "rgba(202,138,4,.3)" };
  if (score >= 25) return { label: "유동성 긴장", color: "#ea580c", bg: "rgba(234,88,12,.12)", border: "rgba(234,88,12,.3)" };
  return { label: "유동성 경색", color: "#dc2626", bg: "rgba(220,38,38,.12)", border: "rgba(220,38,38,.3)" };
}

function getBarColor(score: number) {
  if (score >= 75) return "#16a34a";
  if (score >= 50) return "#ca8a04";
  if (score >= 25) return "#ea580c";
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
        <span>경색</span>
        <span>긴장</span>
        <span>중립</span>
        <span>풍부</span>
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
      <p className="text-sm text-muted-foreground mb-4">{data.regimeSignal}</p>
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

function IndicatorCard({ ind }: { ind: IndicatorResult }) {
  const barColor = getBarColor(ind.score);
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold">{ind.name}</p>
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

/* ── 메인 페이지 ── */

export default function UsLiquidityPage() {
  const [data, setData] = useState<LiquidityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
          연준 유동성·크레딧·시장 상황을 종합한 나스닥 4~6개월 선행 지표
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
                <IndicatorCard key={ind.id} ind={ind} />
              ))}
            </div>
          </section>

          {/* 마켓 유동성 지표 */}
          <section className="mt-10">
            <h2 className="text-lg font-bold mb-4">마켓 유동성</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {marketIndicators.map((ind) => (
                <IndicatorCard key={ind.id} ind={ind} />
              ))}
            </div>
          </section>

          {/* 점수 해석 기준 */}
          <section className="mt-10 rounded-xl border-l-4 border-blue-500 bg-blue-500/10 px-5 py-4">
            <p className="text-sm font-semibold text-blue-400 mb-2">점수 해석 기준</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: "#16a34a" }} />
                <span>75+ 유동성 풍부</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: "#ca8a04" }} />
                <span>50~75 중립</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: "#ea580c" }} />
                <span>25~50 긴장</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: "#dc2626" }} />
                <span>25 이하 경색</span>
              </div>
            </div>
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
    </main>
  );
}
