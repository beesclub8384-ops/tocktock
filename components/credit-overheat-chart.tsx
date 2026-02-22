"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  LineSeries,
  type IChartApi,
  type Time,
} from "lightweight-charts";
import { HelpCircle, Maximize2, Minimize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  OverheatIndexItem,
  OverheatIndexResponse,
} from "@/lib/types/credit-balance";

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
  safe: { text: "안전 구간", color: "#22c55e" },
  caution: { text: "주의 구간", color: "#eab308" },
  danger: { text: "위험 구간", color: "#ef4444" },
};

type Period = "daily" | "weekly" | "monthly";

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "daily", label: "일간" },
  { value: "weekly", label: "주간" },
  { value: "monthly", label: "월간" },
];

function fmt(v: number): string {
  return v.toFixed(3) + "%";
}

/* ────────────────────────────────────────────
   데이터 샘플링: 주간/월간
   ──────────────────────────────────────────── */

function getISOWeekKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const dayOfWeek = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - dayOfWeek);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return `${d.getFullYear()}-W${weekNo}`;
}

function sampleOverheatData(
  data: OverheatIndexItem[],
  period: Period
): OverheatIndexItem[] {
  if (period === "daily") return data;

  const result: OverheatIndexItem[] = [];

  for (let i = 0; i < data.length; i++) {
    const key =
      period === "monthly"
        ? data[i].date.slice(0, 7)
        : getISOWeekKey(data[i].date);

    const nextKey =
      i + 1 < data.length
        ? period === "monthly"
          ? data[i + 1].date.slice(0, 7)
          : getISOWeekKey(data[i + 1].date)
        : null;

    if (key !== nextKey) {
      result.push(data[i]);
    }
  }

  return result;
}

/* ────────────────────────────────────────────
   가이드 모달
   ──────────────────────────────────────────── */
function OverheatGuideModal({ onClose }: { onClose: () => void }) {
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
      <div className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl sm:p-8">
        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X size={20} />
        </button>

        <h2 className="mb-6 text-xl font-bold">빚투 과열지수 보는 법</h2>

        {/* 1. 빚투가 뭔가요? */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">빚투가 뭔가요?</h3>
          <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            <li>
              주식투자를 할 때, 내 돈으로만 사는 게 아니라 증권사에서 돈을
              빌려서 사는 것을 &ldquo;신용융자&rdquo; 또는
              &ldquo;빚투(빚내서 투자)&rdquo;라고 합니다.
            </li>
            <li>
              예를 들어, 내 돈이 100만원인데 증권사에서 100만원을 빌리면
              200만원어치 주식을 살 수 있습니다. 주가가 오르면 수익이 2배지만,
              떨어지면 손실도 2배입니다.
            </li>
            <li>
              이렇게 빌린 돈의 전체 합계를
              &ldquo;신용융자잔고&rdquo;라고 부르며, 금융투자협회가 매일
              공개합니다.
            </li>
          </ul>
        </section>

        <hr className="my-5 border-border" />

        {/* 2. 빚투 과열지수란? */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">빚투 과열지수란?</h3>
          <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            <li>
              신용융자잔고를 주식시장 전체 크기(시가총액)와 비교한
              비율(%)입니다.
            </li>
            <li>
              <strong className="text-foreground">
                공식: 신용융자잔고 &divide; 시가총액 &times; 100 = 빚투
                과열지수(%)
              </strong>
            </li>
            <li>
              쉽게 말하면: &ldquo;주식시장 전체 돈 중에서 빚으로 투자한 비중이
              얼마나 되나?&rdquo;를 보는 지표입니다.
            </li>
            <li>
              예시: 시장 전체가 5,000조원이고 빚투 금액이 30조원이면 &rarr; 30
              &divide; 5,000 &times; 100 = 0.6%
            </li>
          </ul>
        </section>

        <hr className="my-5 border-border" />

        {/* 3. 왜 중요한가? */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">
            왜 이 지표가 중요한가요?
          </h3>
          <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            <li>
              빚으로 주식을 사면 담보를 맡겨야 합니다 (보통 주식 자체가
              담보).
            </li>
            <li>
              주가가 떨어져서 담보 가치가 일정 수준 아래로 내려가면, 증권사가
              강제로 주식을 팔아버립니다. 이것을
              &ldquo;반대매매&rdquo;라고 합니다.
            </li>
            <li>
              반대매매로 주가가 더 떨어지면 &rarr; 다른 사람도 반대매매 당하고
              &rarr; 주가가 더 떨어지는 악순환이 발생합니다.
            </li>
            <li>
              실제 사례: 2020년 코로나19 폭락 때, 신용융자 비율이 높은 종목은
              평균보다 훨씬 크게 하락했습니다. 2024년 8월 블랙먼데이에서도
              신용잔고가 높았던 코스닥 종목들이 더 큰 낙폭을 보였습니다.
            </li>
          </ul>
        </section>

        <hr className="my-5 border-border" />

        {/* 4. 구간별 의미 */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">
            구간별 의미 — 신호등처럼 읽으세요
          </h3>
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="mb-1 text-sm font-semibold text-green-500">
                안전 (평균 미만)
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                빚투 비율이 정상 범위입니다. 시장이 건강하다는 의미이지만, 다른
                리스크가 없다는 뜻은 아닙니다.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="mb-1 text-sm font-semibold text-yellow-500">
                주의 (평균 ~ 평균+1&sigma;)
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                빚투가 평소보다 많아지고 있습니다. 추가 빚투를 자제하고, 보유
                종목의 담보비율을 점검하세요.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="mb-1 text-sm font-semibold text-red-500">
                위험 (평균+1&sigma; 초과)
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                빚투가 과도한 수준입니다. 작은 충격에도 반대매매 연쇄가 발생할
                수 있습니다. 신용융자 비중 축소를 고려하세요.
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground/70">
            * &sigma;(시그마)는 표준편차입니다. 쉽게 말해 &ldquo;평소에 이
            정도까지는 움직인다&rdquo;는 범위를 뜻합니다.
          </p>
        </section>

        <hr className="my-5 border-border" />

        {/* 5. 차트 읽는 법 */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">차트 읽는 법</h3>
          <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            <li>
              <span
                className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: "#a855f7" }}
              />
              <strong className="text-foreground">보라색 선</strong>: 빚투
              과열지수(%) 추이 — 올라가면 빚투 비중이 늘고 있다는 뜻
            </li>
            <li>
              <span
                className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: "#eab308" }}
              />
              <strong className="text-foreground">노란 점선</strong>: 주의선
              (6개월 평균값)
            </li>
            <li>
              <span
                className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: "#ef4444" }}
              />
              <strong className="text-foreground">빨간 점선</strong>: 위험선
              (평균 + 1 표준편차)
            </li>
            <li>
              보라색 선이 급격히 올라가는 구간을 특히 주의하세요. 빚투가 빠르게
              늘고 있다는 뜻입니다.
            </li>
          </ul>
        </section>

        <hr className="my-5 border-border" />

        {/* 6. 신용융자잔고 차트와 함께 보기 */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">
            신용융자잔고 차트와 함께 보면 더 좋습니다
          </h3>
          <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
            신용융자잔고 차트는 빌린 돈의 절대 금액(억원)을, 빚투 과열지수는
            시장 규모 대비 비율(%)을 보여줍니다.
          </p>
          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">예시로 이해하기:</strong>
            </p>
            <ul className="ml-4 list-disc space-y-1">
              <li>빚투 30조, 시장 3,000조 &rarr; 과열지수 1.0% (주의)</li>
              <li>
                빚투 30조, 시장 5,000조 &rarr; 과열지수 0.6% (안전) — 빚투는
                같지만 시장이 커서 안전
              </li>
              <li>
                빚투 30조, 시장 2,000조 &rarr; 과열지수 1.5% (위험) — 빚투는
                같지만 시장이 줄어서 위험
              </li>
            </ul>
            <p className="mt-2 font-medium text-foreground">
              핵심: 빚투 금액 자체보다 &ldquo;시장 대비 얼마나 과한지&rdquo;가
              진짜 위험 신호입니다.
            </p>
          </div>
        </section>

        <hr className="my-5 border-border" />

        {/* 7. 한계 */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">
            이 지표의 한계도 알아두세요
          </h3>
          <ul className="list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-muted-foreground">
            <li>
              시장 전체의 평균적인 빚투 수준을 보여줍니다. 개별 종목의 위험은
              따로 봐야 합니다.
            </li>
            <li>
              데이터는 하루 1번 업데이트됩니다. 장중 급변에는 반영이 늦을 수
              있습니다.
            </li>
            <li>
              과열지수가 안전이라고 해서 시장이 절대 안 떨어진다는 뜻은
              아닙니다. 지정학적 리스크, 금리 변동 등 다른 요인도 영향을 줍니다.
            </li>
            <li>
              이 지표는 &ldquo;빚투로 인한 추가 하락 위험&rdquo;을 판단하는
              보조 도구로 활용하세요.
            </li>
          </ul>
        </section>

        <hr className="my-5 border-border" />

        {/* 8. 데이터 출처 */}
        <section>
          <h3 className="mb-2 text-base font-semibold">
            데이터 출처 및 업데이트
          </h3>
          <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            <li>신용융자잔고: 금융투자협회 (공공데이터포털 API)</li>
            <li>시가총액: 한국거래소 (공공데이터포털 API)</li>
            <li>업데이트: 매 영업일 자동 갱신</li>
            <li>
              TockTock이 두 공공데이터를 조합하여 자체 산출하는 독자
              지표입니다.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────
   메인 차트 컴포넌트
   ──────────────────────────────────────────── */
export function CreditOverheatChart() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [response, setResponse] = useState<OverheatIndexResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [period, setPeriod] = useState<Period>("monthly");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 데이터 fetch
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/credit-overheat");
        if (!res.ok) throw new Error("Failed to fetch");
        const json: OverheatIndexResponse = await res.json();
        setResponse(json);
      } catch {
        setError("데이터를 불러오는데 실패했습니다.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // 전체화면 상태 감지
  useEffect(() => {
    const handler = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // 샘플링된 데이터
  const chartData = useMemo(
    () => (response ? sampleOverheatData(response.data, period) : null),
    [response, period]
  );

  // 차트 높이 (SSR-safe)
  const [chartHeight, setChartHeight] = useState(300);
  useEffect(() => {
    setChartHeight(isFullscreen ? window.innerHeight - 72 : 300);
  }, [isFullscreen]);

  // 차트 생성 / 업데이트
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !chartData || chartData.length === 0 || !response) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "#0a0a0a" },
        textColor: "#a1a1aa",
      },
      grid: {
        vertLines: { color: "#27272a" },
        horzLines: { color: "#27272a" },
      },
      width: el.clientWidth,
      height: chartHeight,
      timeScale: { borderColor: "#3f3f46", timeVisible: false },
      rightPriceScale: {
        borderColor: "#3f3f46",
      },
      localization: {
        priceFormatter: (price: number) => price.toFixed(3) + "%",
      },
    });

    chartRef.current = chart;

    const series = chart.addSeries(LineSeries, {
      color: "#a855f7",
      lineWidth: 2,
      title: "",
      priceFormat: {
        type: "custom",
        formatter: (price: number) => price.toFixed(3) + "%",
      },
    });

    series.setData(
      chartData.map((d) => ({ time: d.date as Time, value: d.index }))
    );

    // 주의선 (평균)
    series.createPriceLine({
      price: response.stats.cautionLine,
      color: "#eab308",
      lineWidth: 1,
      lineStyle: 1, // dashed
      axisLabelVisible: true,
      title: "",
    });

    // 위험선 (평균 + 1σ)
    series.createPriceLine({
      price: response.stats.dangerLine,
      color: "#ef4444",
      lineWidth: 1,
      lineStyle: 1,
      axisLabelVisible: true,
      title: "",
    });

    chart.timeScale().fitContent();

    const onResize = () => {
      const h = document.fullscreenElement ? window.innerHeight - 72 : 300;
      setChartHeight(h);
      chart.applyOptions({ width: el.clientWidth, height: h });
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [chartData, response, chartHeight]);

  if (loading) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-xl border border-border bg-card text-muted-foreground">
        데이터 로딩 중...
      </div>
    );
  }

  if (error || !response) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-xl border border-border bg-card text-red-400">
        {error ?? "데이터를 불러오는데 실패했습니다."}
      </div>
    );
  }

  const { stats } = response;
  const statusInfo = STATUS_LABELS[stats.status];

  return (
    <div
      ref={wrapperRef}
      className={
        isFullscreen
          ? "flex h-screen w-screen flex-col bg-[#0a0a0a] p-4"
          : "rounded-xl border border-border bg-card p-6"
      }
    >
      {guideOpen && <OverheatGuideModal onClose={() => setGuideOpen(false)} />}

      {/* 상단: 현재 상태 + 기간 토글 + 가이드 버튼 */}
      <div className={`mb-4 flex flex-wrap items-center gap-3 text-sm ${isFullscreen ? "text-zinc-300" : ""}`}>
        <div>
          <span className={isFullscreen ? "text-zinc-400" : "text-muted-foreground"}>현재 과열지수 </span>
          <span className={`font-semibold ${isFullscreen ? "text-zinc-100" : "text-foreground"}`}>
            {fmt(stats.current)}
          </span>
          <span className={isFullscreen ? "text-zinc-400" : "text-muted-foreground"}> — </span>
          <span className="font-semibold" style={{ color: statusInfo.color }}>
            {statusInfo.text}
          </span>
        </div>

        {/* 기간 토글 */}
        <div className="flex items-center gap-1">
          {PERIOD_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={period === opt.value ? "default" : "outline"}
              size="xs"
              onClick={() => setPeriod(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        <button
          onClick={() => setGuideOpen(true)}
          className="guide-btn ml-auto inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-all"
        >
          <HelpCircle size={13} />
          과열지수 보는 법
        </button>
      </div>

      {/* 차트 */}
      <div className="relative">
        <div
          ref={containerRef}
          className={
            isFullscreen
              ? "w-full flex-1 overflow-hidden rounded-lg"
              : "w-full overflow-hidden rounded-lg"
          }
        />
        {/* 전체화면 버튼: 차트 우하단 */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? "원래 크기로" : "전체화면"}
          className="absolute bottom-2 right-2 rounded-md bg-black/50 p-1.5 text-zinc-400 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-zinc-200"
        >
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>

      {/* 하단: 범례 */}
      <div className={`mt-4 flex flex-wrap items-center gap-4 text-xs ${isFullscreen ? "text-zinc-400" : "text-muted-foreground"}`}>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
          안전 (&lt; {fmt(stats.cautionLine)})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-500" />
          주의 ({fmt(stats.cautionLine)} ~ {fmt(stats.dangerLine)})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
          위험 (&gt; {fmt(stats.dangerLine)})
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: "#a855f7" }}
          />
          {response.source === "marketCap"
            ? "과열지수 = 융자잔고 / 시가총액 × 100"
            : "과열지수 = 융자잔고 / 시가총액(추정) × 100"}
        </span>
      </div>
      {response.source === "indexClose" && (
        <p className={`mt-2 text-[11px] ${isFullscreen ? "text-zinc-500" : "text-muted-foreground/60"}`}>
          * 시가총액 API 미연결 상태로 지수 종가 기반 근사치를 표시합니다.
        </p>
      )}
    </div>
  );
}
