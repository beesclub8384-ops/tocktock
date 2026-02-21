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
import type { CreditBalanceItem } from "@/lib/types/credit-balance";

const LINE_COLORS = {
  kospi: "#22c55e",       // green
  kospiIndex: "#a78bfa",  // purple
} as const;

type Period = "daily" | "weekly" | "monthly";

interface KospiIndexItem {
  date: string;
  close: number;
}

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "daily", label: "일간" },
  { value: "weekly", label: "주간" },
  { value: "monthly", label: "월간" },
];

/* ────────────────────────────────────────────
   데이터 샘플링: 주간/월간
   ──────────────────────────────────────────── */

function getISOWeekKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const dayOfWeek = d.getDay() || 7; // Mon=1 ... Sun=7
  d.setDate(d.getDate() + 4 - dayOfWeek); // Thursday of this week
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return `${d.getFullYear()}-W${weekNo}`;
}

function sampleData(
  data: CreditBalanceItem[],
  period: Period
): CreditBalanceItem[] {
  if (period === "daily") return data;

  // 데이터가 날짜 오름차순이므로, 같은 그룹의 마지막 항목이 해당 기간의 마지막 영업일
  const result: CreditBalanceItem[] = [];
  let prevKey = "";

  for (let i = 0; i < data.length; i++) {
    const key =
      period === "monthly"
        ? data[i].date.slice(0, 7) // "YYYY-MM"
        : getISOWeekKey(data[i].date); // "YYYY-WNN"

    const nextKey =
      i + 1 < data.length
        ? period === "monthly"
          ? data[i + 1].date.slice(0, 7)
          : getISOWeekKey(data[i + 1].date)
        : null;

    // 그룹이 바뀌는 시점(현재가 그룹의 마지막) 또는 데이터 끝
    if (key !== nextKey) {
      result.push(data[i]);
    }
    prevKey = key;
  }

  return result;
}

function sampleIndexData(
  data: KospiIndexItem[],
  period: Period
): KospiIndexItem[] {
  if (period === "daily") return data;

  const result: KospiIndexItem[] = [];

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
function CreditBalanceGuideModal({ onClose }: { onClose: () => void }) {
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

        <h2 className="mb-6 text-xl font-bold">
          신용융자잔고 보는 법
        </h2>

        {/* 1. 신용융자잔고가 뭔가요? */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">
            신용융자잔고가 뭔가요?
          </h3>
          <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            <li>
              개인투자자들이 증권사에서 돈을 빌려 주식을 매수한 금액의
              총합입니다.
            </li>
            <li>
              쉽게 말하면: &ldquo;지금 이 순간, 개인투자자들이 빚내서 주식에
              넣은 돈이 총 얼마인가?&rdquo;를 보여주는 숫자입니다.
            </li>
            <li>
              금융투자협회가 매일 집계하여 공개하며, 차트에서는 조원
              단위로 표시합니다 (예: 31.48조원).
            </li>
          </ul>
        </section>

        <hr className="my-5 border-border" />

        {/* 2. 2개의 선 */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">
            차트에 있는 2개의 선은 뭔가요?
          </h3>
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-green-500">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: LINE_COLORS.kospi }}
                />
                초록색 선 (신용융자잔고)
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                코스피 시장의 신용융자잔고입니다. 빚내서 주식을 산 금액의
                총합으로, 왼쪽 Y축(조원)에 표시됩니다.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-purple-400">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: LINE_COLORS.kospiIndex }}
                />
                보라색 선 (KOSPI 지수)
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                코스피 지수의 흐름입니다. 오른쪽 Y축(포인트)에 표시되며,
                융자잔고와 지수의 방향이 다르면(다이버전스) 주의 신호일 수
                있습니다.
              </p>
            </div>
          </div>
        </section>

        <hr className="my-5 border-border" />

        {/* 3. 뭘 봐야 하나요? */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">
            이 차트에서 뭘 봐야 하나요?
          </h3>
          <div className="mb-4">
            <p className="mb-2 text-sm font-medium text-foreground">
              추세를 보세요
            </p>
            <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
              <li>
                선이 <strong className="text-foreground">우상향</strong>:
                빚내서 투자하는 사람이 늘고 있다 &rarr; 시장에 낙관론이 퍼지고
                있다
              </li>
              <li>
                선이 <strong className="text-foreground">우하향</strong>:
                빚을 갚고 있다 &rarr; 투자자들이 조심스러워지고 있다
              </li>
              <li>
                선이 <strong className="text-foreground">급격히 상승</strong>:
                과열 주의! 단기간에 빚투가 급증하면 위험 신호입니다
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">
              KOSPI와 KOSDAQ을 비교해보세요
            </p>
            <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
              <li>
                코스닥 빚투가 유독 빠르게 늘면: 개인투자자들이 중소형주에
                공격적으로 빚투 중입니다. 코스닥은 변동성이 크기 때문에
                반대매매 위험이 더 높습니다.
              </li>
              <li>
                코스피 빚투가 늘면: 대형주 중심으로 빚투가 늘고 있습니다.
                상대적으로 안정적이지만, 과도하면 역시 위험합니다.
              </li>
            </ul>
          </div>
        </section>

        <hr className="my-5 border-border" />

        {/* 4. 반대매매란? */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">반대매매란?</h3>
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
              <li>
                빚으로 주식을 사면 증권사에 담보(보통 산 주식 자체)를
                맡깁니다.
              </li>
              <li>
                담보유지비율이라는 게 있는데, 보통 140%입니다.
              </li>
              <li>
                예시: 100만원 빌려서 주식을 샀는데, 주가가 떨어져서 담보
                가치가 140만원 아래로 내려가면 증권사가 &ldquo;돈 더 넣거나,
                강제로 판다&rdquo;고 통보합니다.
              </li>
              <li>
                추가 입금을 못 하면 다음 날 아침 시장가로
                <strong className="text-foreground"> 강제 매도</strong>됩니다.
                보통 가장 나쁜 가격에 팔리게 됩니다.
              </li>
            </ul>
          </div>
        </section>

        <hr className="my-5 border-border" />

        {/* 5. 높으면 왜 위험? */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">
            신용융자잔고가 높으면 왜 위험한가요?
          </h3>
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
            <p className="mb-2">
              빚투자가 많다 &rarr; 주가 하락 시 반대매매 물량이 쏟아진다
              &rarr; 주가가 더 떨어진다 &rarr; 또 다른 사람이 반대매매 당한다
            </p>
            <p className="mb-2 font-medium text-foreground">
              이 악순환을 &ldquo;신용 연쇄 청산&rdquo;이라고 합니다.
            </p>
            <p>
              코로나19 폭락(2020년 3월), 블랙먼데이(2024년 8월) 때 이런
              연쇄가 실제로 발생했습니다.
            </p>
          </div>
        </section>

        <hr className="my-5 border-border" />

        {/* 6. 숫자 읽는 법 */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">
            숫자는 어떻게 읽나요?
          </h3>
          <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            <li>
              예시: KOSPI 20.10조원 + KOSDAQ 10.37조원 = 전체 약
              30.47조원
            </li>
            <li>
              최근 한국 시장의 신용융자잔고는 대략 25~35조원 범위에서 움직이고
              있습니다.
            </li>
            <li>
              이 금액이 많은지 적은지는 시가총액과 비교해야 의미가 있습니다
              &rarr; 아래 &ldquo;빚투 과열지수&rdquo;를 함께 보세요.
            </li>
          </ul>
        </section>

        <hr className="my-5 border-border" />

        {/* 7. 함께 보기 */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">
            이 차트만으로 투자 판단을 하면 안 됩니다
          </h3>
          <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            <li>
              신용융자잔고는 &ldquo;빚투의 절대 금액&rdquo;만 보여줍니다.
            </li>
            <li>
              시장이 커지면 빚투도 자연스럽게 늘어날 수 있습니다 (시장 성장에
              따른 정상적 증가).
            </li>
            <li>
              그래서 아래에 있는 &ldquo;TockTock 빚투 과열지수&rdquo;와 함께
              봐야 합니다. 과열지수는 시장 규모 대비 비율을 보여주기 때문에,
              진짜 과열인지 더 정확하게 판단할 수 있습니다.
            </li>
          </ul>
        </section>

        <hr className="my-5 border-border" />

        {/* 8. 실전 활용 */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">
            실전에서 활용하는 법
          </h3>
          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              <strong className="text-yellow-500">융자 증가 + 과열지수
              상승</strong> &rarr; 진짜 과열, 조심하세요
            </p>
            <p>
              <strong className="text-green-500">융자 증가 + 과열지수
              안정</strong> &rarr; 시장도 함께 성장 중, 상대적으로 안전
            </p>
            <p>
              <strong className="text-red-500">융자 감소 + 주가 하락</strong>
              {" "}&rarr; 이미 반대매매가 진행 중일 수 있음
            </p>
            <p>
              <strong className="text-blue-500">융자 급감</strong> &rarr; 공포
              구간일 수 있음. 역으로 바닥 신호일 수도 있습니다
            </p>
          </div>
        </section>

        <hr className="my-5 border-border" />

        {/* 9. 데이터 출처 */}
        <section>
          <h3 className="mb-2 text-base font-semibold">
            데이터 출처 및 업데이트
          </h3>
          <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            <li>출처: 금융투자협회 (FreeSIS 1998~2021 + 공공데이터포털 API 2021~현재)</li>
            <li>업데이트: 매 영업일 1회 자동 갱신</li>
            <li>범위: 1998년 7월 ~ 현재 (전체 기간)</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────
   메인 차트 컴포넌트
   ──────────────────────────────────────────── */
export function CreditBalanceChart() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [data, setData] = useState<CreditBalanceItem[] | null>(null);
  const [kospiIndex, setKospiIndex] = useState<KospiIndexItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [period, setPeriod] = useState<Period>("monthly");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 데이터 fetch
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/credit-balance");
        if (!res.ok) throw new Error("Failed to fetch");
        const json = await res.json();
        setData(json.data);
        setKospiIndex(json.kospiIndex ?? null);
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
    () => (data ? sampleData(data, period) : null),
    [data, period]
  );

  const indexData = useMemo(
    () => (kospiIndex ? sampleIndexData(kospiIndex, period) : null),
    [kospiIndex, period]
  );

  // 차트 높이
  const chartHeight = isFullscreen ? window.innerHeight - 72 : 400;

  // 차트 생성 / 업데이트
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el || !chartData || chartData.length === 0) return;

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
      leftPriceScale: {
        borderColor: "#3f3f46",
        visible: true,
      },
      rightPriceScale: {
        borderColor: "#3f3f46",
        visible: true,
      },
    });

    chartRef.current = chart;

    // KOSPI 융자 (왼쪽 Y축)
    const kospiSeries = chart.addSeries(LineSeries, {
      color: LINE_COLORS.kospi,
      lineWidth: 2,
      title: "",
      priceScaleId: "left",
      priceFormat: { type: "custom", formatter: (price: number) => price.toFixed(2) },
    });
    kospiSeries.setData(
      chartData.map((d) => ({
        time: d.date as Time,
        value: Math.round(d.kospiLoan / 100) / 100,
      }))
    );

    // KOSPI 지수 (오른쪽 Y축)
    if (indexData && indexData.length > 0) {
      const indexSeries = chart.addSeries(LineSeries, {
        color: LINE_COLORS.kospiIndex,
        lineWidth: 1,
        title: "",
        priceScaleId: "right",
        priceFormat: { type: "custom", formatter: (price: number) => Math.round(price).toLocaleString() },
      });
      indexSeries.setData(
        indexData.map((d) => ({
          time: d.date as Time,
          value: d.close,
        }))
      );
    }

    chart.timeScale().fitContent();

    const onResize = () => {
      const h = document.fullscreenElement ? window.innerHeight - 72 : 400;
      chart.applyOptions({ width: el.clientWidth, height: h });
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [chartData, indexData, chartHeight]);

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center rounded-xl border border-border bg-card text-muted-foreground">
        데이터 로딩 중...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[400px] items-center justify-center rounded-xl border border-border bg-card text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className={
        isFullscreen
          ? "flex h-screen w-screen flex-col bg-[#0a0a0a] p-4"
          : "rounded-xl border border-border bg-card p-6"
      }
    >
      {guideOpen && (
        <CreditBalanceGuideModal onClose={() => setGuideOpen(false)} />
      )}

      <div className={`mb-4 flex flex-wrap items-center gap-3 text-sm ${isFullscreen ? "text-zinc-300" : ""}`}>
        {/* 차트 제목 */}
        <span className="font-semibold">코스피 빚투 지표</span>

        {/* 범례 */}
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: LINE_COLORS.kospi }}
          />
          신용융자잔고
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: LINE_COLORS.kospiIndex }}
          />
          KOSPI 지수
        </span>

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

        {/* 오른쪽: 단위 + 가이드 */}
        <span className="ml-auto flex items-center gap-2 text-muted-foreground">
          좌: 조원 / 우: 포인트
          <button
            onClick={() => setGuideOpen(true)}
            className="guide-btn inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-all"
          >
            <HelpCircle size={13} />
            신용융자잔고 보는 법
          </button>
        </span>
      </div>
      <div className="relative">
        <div
          ref={chartContainerRef}
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
    </div>
  );
}
