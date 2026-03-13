"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { HelpCircle, X, Filter } from "lucide-react";
import { useDraggable } from "@/hooks/useDraggable";

interface TrackingDay {
  day: number;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface EventCase {
  code: string;
  name: string;
  market: string;
  dDate: string;
  dDayTradingValue: number;
  dDayChangeRate: number;
  dPlusOneClose: number;
  dPlusOneTradingValue: number;
  dropRatio: number;
  postExplosion: TrackingDay[];
}

interface StatsDay {
  day: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface AnalysisData {
  generated: string;
  totalCases: number;
  trackingDays: number;
  dateRange: { start: string; end: string };
  stats: { mean: StatsDay[]; median: StatsDay[] };
  events: EventCase[];
}

const COLORS: Record<string, string> = {
  open: "#555555",
  close: "#DC2626",
  high: "#16A34A",
  low: "#2563EB",
};

const LABELS: Record<string, string> = {
  open: "시가",
  close: "종가",
  high: "고가",
  low: "저가",
};

type PriceType = "open" | "high" | "low" | "close";
const TYPES: PriceType[] = ["open", "high", "low", "close"];

function formatDateLabel(yyyymmdd: string): string {
  const y = yyyymmdd.slice(0, 4);
  const m = parseInt(yyyymmdd.slice(4, 6));
  const d = parseInt(yyyymmdd.slice(6, 8));
  return `${y}.${m}.${d}`;
}

function PatternGuideModal({ onClose }: { onClose: () => void }) {
  const { position, handleMouseDown } = useDraggable();

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
      <div data-draggable-modal className="w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" style={{ transform: `translate(${position.x}px, ${position.y}px)` }}>
        <div className="relative max-h-[85vh] overflow-y-auto p-6 sm:p-8">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X size={20} />
          </button>

          <h2 className="mb-6 text-xl font-bold cursor-move select-none" onMouseDown={handleMouseDown}>
            세력진입 의심 패턴 분석 보는 법
          </h2>

          <section className="mb-6">
            <h3 className="mb-2 text-base font-semibold">이 차트는 뭔가요?</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              거래대금이 폭발한 뒤 다음날 거래대금이 1/3 이하로 급감한 종목들,
              즉{" "}
              <strong className="text-foreground">
                &ldquo;세력진입 의심&rdquo; 패턴
              </strong>
              이 확인된 종목들의 이후 주가 흐름을 추적한 차트입니다. 하나의
              차트에 수백 건의 흐름을 겹쳐 그려{" "}
              <strong className="text-foreground">
                공통된 패턴이 있는지
              </strong>{" "}
              한눈에 볼 수 있습니다.
            </p>
          </section>

          <hr className="my-5 border-border" />

          <section className="mb-6">
            <h3 className="mb-2 text-base font-semibold">기준점이 뭔가요?</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              <strong className="text-foreground">D+1 종가 = 0%</strong>가
              기준입니다. D일은 거래대금이 폭발한 날이고, D+1은 거래대금이
              급감한 날입니다. D+1의 마감 가격을 0%로 잡고, 이후 15거래일
              동안의 시가·고가·저가·종가가 이 기준 대비 몇 % 올랐는지
              내렸는지를 보여줍니다.
            </p>
          </section>

          <hr className="my-5 border-border" />

          <section className="mb-6">
            <h3 className="mb-3 text-base font-semibold">4개 선의 의미</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-0.5 w-5 bg-[#555]" />
                  <span className="text-sm font-semibold">시가 (검정)</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  그날 장이 시작할 때의 가격입니다.
                </p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-0.5 w-5 bg-red-600" />
                  <span className="text-sm font-semibold">종가 (빨강)</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  그날 장이 끝날 때의 가격입니다.
                </p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-0.5 w-5 bg-green-600" />
                  <span className="text-sm font-semibold">고가 (초록)</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  그날 하루 중 가장 높았던 가격입니다.
                </p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-0.5 w-5 bg-blue-600" />
                  <span className="text-sm font-semibold">저가 (파랑)</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  그날 하루 중 가장 낮았던 가격입니다.
                </p>
              </div>
            </div>
          </section>

          <hr className="my-5 border-border" />

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <section>
              <h3 className="mb-2 text-base font-semibold">
                얇은 선 vs 굵은 선
              </h3>
              <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>
                  <strong className="text-foreground">얇은 투명한 선</strong> —
                  개별 종목의 실제 흐름
                </li>
                <li>
                  <strong className="text-foreground">굵은 실선</strong> — 전체
                  종목의 평균
                </li>
                <li>
                  <strong className="text-foreground">굵은 점선</strong> — 전체
                  종목의 중앙값
                </li>
              </ul>
            </section>

            <section>
              <h3 className="mb-2 text-base font-semibold">주의할 점</h3>
              <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>
                  과거 패턴이{" "}
                  <strong className="text-foreground">
                    미래를 보장하지 않습니다.
                  </strong>
                </li>
                <li>
                  개별 종목마다 편차가 크며, 시장 상황에 따라 결과가
                  달라집니다.
                </li>
                <li>참고용으로만 활용하세요.</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PatternAnalysisPage() {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | PriceType>("all");
  const [hoveredCase, setHoveredCase] = useState<number | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltipData, setTooltipData] = useState<{
    ev: EventCase;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/volume-explosion/pattern-analysis")
      .then((r) => r.json())
      .then((json: AnalysisData) => {
        if (!json.events || json.events.length === 0) {
          setError("분석 데이터가 없습니다.");
        } else {
          setData(json);
        }
      })
      .catch(() => setError("데이터를 불러올 수 없습니다."))
      .finally(() => setLoading(false));
  }, []);

  const drawChart = useCallback(() => {
    if (!data || !svgRef.current) return;

    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const width = rect.width || 900;
    const height = Math.min(550, width * 0.5);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    // Clear
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const { events, stats } = data;
    const n = events.length;
    const margin = { top: 20, right: 20, bottom: 40, left: 55 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;
    const days = Array.from({ length: 15 }, (_, i) => i + 2); // D+2 ~ D+16

    // Y domain from stats + sample
    const vals: number[] = [];
    [...stats.mean, ...stats.median].forEach((s) => {
      vals.push(s.open, s.high, s.low, s.close);
    });
    const sampleStep = Math.max(1, Math.floor(n / 200));
    for (let i = 0; i < n; i += sampleStep) {
      for (const d of events[i].postExplosion) {
        if (d.day >= 2 && d.day <= 16) vals.push(d.open, d.high, d.low, d.close);
      }
    }
    const yMin = Math.max(Math.min(...vals) - 2, -60);
    const yMax = Math.min(Math.max(...vals) + 2, 60);

    const xScale = (d: number) => margin.left + ((d - 2) / 14) * innerW;
    const yScale = (v: number) =>
      margin.top + ((yMax - Math.max(yMin, Math.min(yMax, v))) / (yMax - yMin)) * innerH;

    const ns = "http://www.w3.org/2000/svg";

    function makePath(points: { x: number; y: number }[]): string {
      return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    }

    function createLine(
      points: { x: number; y: number }[],
      color: string,
      sw: number,
      opacity: number,
      dash?: string
    ): SVGPathElement {
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", makePath(points));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", color);
      path.setAttribute("stroke-width", String(sw));
      path.setAttribute("opacity", String(opacity));
      if (dash) path.setAttribute("stroke-dasharray", dash);
      return path;
    }

    // Grid
    const gridGroup = document.createElementNS(ns, "g");
    const yTicks = 10;
    const yStep = (yMax - yMin) / yTicks;
    for (let i = 0; i <= yTicks; i++) {
      const val = yMin + i * yStep;
      const gy = yScale(val);
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", String(margin.left));
      line.setAttribute("x2", String(width - margin.right));
      line.setAttribute("y1", String(gy));
      line.setAttribute("y2", String(gy));
      line.setAttribute("stroke", "#1a1a1a");
      gridGroup.appendChild(line);

      const label = document.createElementNS(ns, "text");
      label.setAttribute("x", String(margin.left - 8));
      label.setAttribute("y", String(gy + 4));
      label.setAttribute("fill", "#666");
      label.setAttribute("font-size", "10");
      label.setAttribute("text-anchor", "end");
      label.textContent = Math.round(val) + "%";
      gridGroup.appendChild(label);
    }
    svg.appendChild(gridGroup);

    // Zero line
    const zl = document.createElementNS(ns, "line");
    zl.setAttribute("x1", String(margin.left));
    zl.setAttribute("x2", String(width - margin.right));
    zl.setAttribute("y1", String(yScale(0)));
    zl.setAttribute("y2", String(yScale(0)));
    zl.setAttribute("stroke", "#555");
    zl.setAttribute("stroke-width", "1.5");
    zl.setAttribute("stroke-dasharray", "4,3");
    svg.appendChild(zl);

    // X axis
    days.forEach((d) => {
      const lx = xScale(d);
      const t = document.createElementNS(ns, "line");
      t.setAttribute("x1", String(lx));
      t.setAttribute("x2", String(lx));
      t.setAttribute("y1", String(margin.top + innerH));
      t.setAttribute("y2", String(margin.top + innerH + 6));
      t.setAttribute("stroke", "#333");
      svg.appendChild(t);

      const label = document.createElementNS(ns, "text");
      label.setAttribute("x", String(lx));
      label.setAttribute("y", String(margin.top + innerH + 22));
      label.setAttribute("fill", "#666");
      label.setAttribute("font-size", "10");
      label.setAttribute("text-anchor", "middle");
      label.textContent = `D+${d}`;
      svg.appendChild(label);
    });

    // Individual lines (sample for performance)
    const drawStep = n > 500 ? Math.ceil(n / 500) : 1;
    const individualAlpha = Math.max(0.01, Math.min(0.15, 8 / n));
    const indGroup = document.createElementNS(ns, "g");

    // Precompute case data for hover
    const caseData: { ev: EventCase; ci: number; peMap: Map<number, TrackingDay> }[] = [];
    events.forEach((ev, ci) => {
      const peMap = new Map(ev.postExplosion.map((d) => [d.day, d]));
      caseData.push({ ev, ci, peMap });

      if (ci % drawStep !== 0) return;
      TYPES.forEach((type) => {
        if (activeFilter !== "all" && activeFilter !== type) return;
        const points: { x: number; y: number }[] = [];
        for (const day of days) {
          const d = peMap.get(day);
          if (d) points.push({ x: xScale(day), y: yScale(d[type]) });
        }
        if (points.length >= 10) {
          const isHovered = hoveredCase === ci;
          const op = hoveredCase === null ? individualAlpha : isHovered ? 0.9 : 0.01;
          indGroup.appendChild(createLine(points, COLORS[type], isHovered ? 2.5 : 0.5, op));
        }
      });
    });
    svg.appendChild(indGroup);

    // Mean
    TYPES.forEach((type) => {
      if (activeFilter !== "all" && activeFilter !== type) return;
      const pts = stats.mean.map((s) => ({ x: xScale(s.day), y: yScale(s[type]) }));
      svg.appendChild(createLine(pts, COLORS[type], 3, 0.95));
    });

    // Median
    TYPES.forEach((type) => {
      if (activeFilter !== "all" && activeFilter !== type) return;
      const pts = stats.median.map((s) => ({ x: xScale(s.day), y: yScale(s[type]) }));
      svg.appendChild(createLine(pts, COLORS[type], 2.5, 0.7, "6,4"));
    });

    // Hover overlay
    const overlay = document.createElementNS(ns, "rect");
    overlay.setAttribute("x", String(margin.left));
    overlay.setAttribute("y", String(margin.top));
    overlay.setAttribute("width", String(innerW));
    overlay.setAttribute("height", String(innerH));
    overlay.setAttribute("fill", "transparent");
    overlay.style.cursor = "crosshair";

    // Build flat points for nearest-neighbor
    const flatPts: { px: number; py: number; ci: number }[] = [];
    caseData.forEach(({ ci, peMap }) => {
      for (const day of days) {
        const d = peMap.get(day);
        if (d) flatPts.push({ px: xScale(day), py: yScale(d.close), ci });
      }
    });

    overlay.addEventListener("mousemove", (e: MouseEvent) => {
      const svgRect = svg.getBoundingClientRect();
      const mx = (e.clientX - svgRect.left) * (width / svgRect.width);
      const my = (e.clientY - svgRect.top) * (height / svgRect.height);
      let minDist = Infinity,
        nearestCi = -1;
      for (const p of flatPts) {
        const dist = (p.px - mx) ** 2 + (p.py - my) ** 2;
        if (dist < minDist) {
          minDist = dist;
          nearestCi = p.ci;
        }
      }
      if (nearestCi >= 0 && minDist < 3000) {
        setHoveredCase(nearestCi);
        setTooltipData({ ev: events[nearestCi], x: e.clientX, y: e.clientY });
      } else {
        setHoveredCase(null);
        setTooltipData(null);
      }
    });
    overlay.addEventListener("mouseleave", () => {
      setHoveredCase(null);
      setTooltipData(null);
    });
    svg.appendChild(overlay);

    // Info
    const info = document.createElementNS(ns, "text");
    info.setAttribute("x", String(width - margin.right));
    info.setAttribute("y", String(height - 4));
    info.setAttribute("text-anchor", "end");
    info.setAttribute("fill", "#444");
    info.setAttribute("font-size", "10");
    info.textContent = `n=${n.toLocaleString()}건 · ${data.dateRange.start}~${data.dateRange.end} · TockTock`;
    svg.appendChild(info);
  }, [data, activeFilter, hoveredCase]);

  useEffect(() => {
    drawChart();
    const onResize = () => drawChart();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [drawChart]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground/30 border-t-foreground" />
          <p className="mt-4 text-muted-foreground text-sm">
            패턴 분석 데이터를 불러오는 중...
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">
            {error || "데이터를 불러올 수 없습니다."}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-accent transition-colors"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* 헤더 */}
        <header className="mb-8">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
            <a
              href="/volume-explosion"
              className="hover:text-foreground transition-colors"
            >
              거래대금 폭발
            </a>
            <span>/</span>
            <span className="text-foreground">세력진입 의심 패턴 분석</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            세력진입 의심 패턴 분석
          </h1>
          <p className="text-muted-foreground text-sm">
            거래대금 폭발 후 급감한 종목들의 이후 주가 흐름을 추적합니다.
            D+1 종가를 0%로 놓고 15거래일간의 시가·고가·저가·종가 변화를
            보여줍니다.
          </p>
          <button
            onClick={() => setShowGuide(true)}
            className="guide-btn mt-3 inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-all"
          >
            <HelpCircle size={13} />
            보는 법
          </button>
        </header>

        {showGuide && (
          <PatternGuideModal onClose={() => setShowGuide(false)} />
        )}

        {/* 요약 배너 */}
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/5 px-5 py-3">
          <p className="text-sm">
            <strong className="text-amber-400">
              {data.totalCases.toLocaleString()}건
            </strong>
            <span className="text-muted-foreground">
              의 세력진입 의심 패턴을 분석했습니다 ·{" "}
              {formatDateLabel(data.dateRange.start)} ~{" "}
              {formatDateLabel(data.dateRange.end)}
            </span>
          </p>
        </div>

        {/* 필터 버튼 */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Filter size={14} className="text-muted-foreground" />
          {(
            [
              ["all", "전체"],
              ["open", "시가"],
              ["close", "종가"],
              ["high", "고가"],
              ["low", "저가"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              className={`px-3 py-1 text-xs rounded-md border transition-colors ${
                activeFilter === key
                  ? "border-foreground/30 bg-foreground/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {key !== "all" && (
                <span
                  className="inline-block w-2 h-2 rounded-full mr-1.5"
                  style={{ backgroundColor: COLORS[key as PriceType] }}
                />
              )}
              {label}
            </button>
          ))}
        </div>

        {/* 차트 */}
        <div className="border border-border rounded-xl overflow-hidden bg-[#0a0a0a] p-4">
          <svg ref={svgRef} className="w-full" style={{ minHeight: 400 }} />

          {/* 범례 */}
          <div className="flex flex-wrap gap-x-5 gap-y-1 justify-center mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-5 h-[2px] bg-[#555]" />
              시가(개별)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-5 h-[2px] bg-red-600" />
              종가(개별)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-5 h-[2px] bg-green-600" />
              고가(개별)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-5 h-[2px] bg-blue-600" />
              저가(개별)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-5 h-[3px] bg-red-600 rounded" />
              평균(굵은선)
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-5 h-[2px]"
                style={{
                  background:
                    "repeating-linear-gradient(90deg, #DC2626 0, #DC2626 3px, transparent 3px, transparent 6px)",
                }}
              />
              중앙값(점선)
            </span>
          </div>
        </div>

        {/* 툴팁 */}
        {tooltipData && (() => {
          const ev = tooltipData.ev;
          const pe16 = ev.postExplosion.find((d) => d.day === 16);
          const maxHigh = Math.max(...ev.postExplosion.filter((d) => d.day >= 2 && d.day <= 16).map((d) => d.high));
          const minLow = Math.min(...ev.postExplosion.filter((d) => d.day >= 2 && d.day <= 16).map((d) => d.low));
          return (
            <div
              className="fixed z-50 pointer-events-none bg-card/95 border border-border rounded-lg px-4 py-3 text-sm shadow-xl"
              style={{
                left:
                  tooltipData.x + 270 > window.innerWidth
                    ? tooltipData.x - 270
                    : tooltipData.x + 15,
                top: tooltipData.y - 10,
                maxWidth: 260,
              }}
            >
              <div className="font-bold text-foreground">{ev.name}</div>
              <div className="text-xs text-muted-foreground mb-2">
                {ev.code} · {ev.market} · D일: {formatDateLabel(ev.dDate)}
              </div>
              <hr className="border-border mb-2" />
              <div className="space-y-0.5 text-xs">
                <div>
                  D일 등락률:{" "}
                  <span className={ev.dDayChangeRate > 0 ? "text-red-400" : "text-blue-400"}>
                    {ev.dDayChangeRate > 0 ? "+" : ""}{ev.dDayChangeRate}%
                  </span>
                </div>
                <div>거래대금 급감: {ev.dropRatio}%</div>
                <hr className="border-border my-1.5" />
                {pe16 && (
                  <div>
                    D+16 종가:{" "}
                    <span className={pe16.close > 0 ? "text-red-400" : "text-blue-400"}>
                      {pe16.close > 0 ? "+" : ""}{pe16.close}%
                    </span>
                  </div>
                )}
                <div>
                  최고가: <span className="text-green-400">+{maxHigh.toFixed(1)}%</span>
                </div>
                <div>
                  최저가: <span className="text-blue-400">{minLow.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 통계 요약 테이블 */}
        <div className="mt-8 border border-border rounded-xl overflow-hidden">
          <div className="bg-card px-5 py-4 border-b border-border">
            <h2 className="text-lg font-bold">통계 요약</h2>
            <p className="text-xs text-muted-foreground mt-1">
              D+1 종가 대비 등락률(%) · 평균 / 중앙값 · n={data.totalCases.toLocaleString()}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-2 text-left text-muted-foreground font-medium">
                    구분
                  </th>
                  {data.stats.mean.map((s) => (
                    <th
                      key={s.day}
                      className="px-2 py-2 text-center text-muted-foreground font-medium"
                    >
                      D+{s.day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(["mean", "median"] as const).map((statType) =>
                  TYPES.map((priceType) => (
                    <tr
                      key={`${statType}-${priceType}`}
                      className="border-b border-border/50 hover:bg-accent/20"
                    >
                      <td className="px-3 py-1.5 font-medium whitespace-nowrap">
                        <span
                          className="inline-block w-2 h-2 rounded-full mr-1.5"
                          style={{ backgroundColor: COLORS[priceType] }}
                        />
                        {LABELS[priceType]}{" "}
                        {statType === "mean" ? "평균" : "중앙값"}
                      </td>
                      {data.stats[statType].map((s) => {
                        const val = s[priceType];
                        return (
                          <td
                            key={s.day}
                            className={`px-2 py-1.5 text-center tabular-nums ${
                              val > 0
                                ? "text-red-400"
                                : val < 0
                                  ? "text-blue-400"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {val > 0 ? "+" : ""}
                            {val.toFixed(1)}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 업데이트 시각 */}
        <p className="mt-4 text-xs text-muted-foreground/50 text-right">
          데이터 생성일: {data.generated} · n={data.totalCases.toLocaleString()} · 출처: 네이버 금융
        </p>
      </div>
    </div>
  );
}
