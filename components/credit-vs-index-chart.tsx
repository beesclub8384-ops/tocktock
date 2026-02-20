"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  ColorType,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type SeriesType,
} from "lightweight-charts";
import type { CreditVsIndexItem } from "@/app/api/credit-vs-index/route";

const COLORS = {
  kospi: "#3b82f6",   // blue
  kosdaq: "#22c55e",  // green
  loan: "#ef4444",    // red
} as const;

function pctChange(base: number, current: number): number {
  if (base === 0) return 0;
  return ((current - base) / base) * 100;
}

interface TooltipData {
  date: string;
  kospiClose: number;
  kospiPct: number;
  kosdaqClose: number;
  kosdaqPct: number;
  totalLoan: number;
  loanPct: number;
}

export function CreditVsIndexChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesMapRef = useRef<Map<ISeriesApi<SeriesType>, string>>(new Map());
  const rawDataRef = useRef<Map<string, CreditVsIndexItem>>(new Map());
  const baseRef = useRef<{ kospi: number; kosdaq: number; loan: number }>({
    kospi: 0,
    kosdaq: 0,
    loan: 0,
  });

  const [data, setData] = useState<CreditVsIndexItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/credit-vs-index");
        if (!res.ok) throw new Error("Failed to fetch");
        const json = await res.json();
        setData(json.data);
      } catch {
        setError("데이터를 불러오는데 실패했습니다.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const buildChart = useCallback(() => {
    const el = containerRef.current;
    if (!el || !data || data.length === 0) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    // 기준값 (시작일)
    const first = data[0];
    baseRef.current = {
      kospi: first.kospiClose,
      kosdaq: first.kosdaqClose,
      loan: first.totalLoan,
    };

    // raw 데이터 맵
    const rawMap = new Map<string, CreditVsIndexItem>();
    for (const d of data) {
      rawMap.set(d.date, d);
    }
    rawDataRef.current = rawMap;

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
      height: 400,
      timeScale: { borderColor: "#3f3f46", timeVisible: false },
      rightPriceScale: { borderColor: "#3f3f46" },
      crosshair: {
        vertLine: { labelVisible: true },
        horzLine: { labelVisible: true },
      },
      localization: {
        priceFormatter: (price: number) => price.toFixed(2) + "%",
      },
    });

    chartRef.current = chart;
    const newSeriesMap = new Map<ISeriesApi<SeriesType>, string>();

    const pctFormat = {
      type: "custom" as const,
      formatter: (price: number) => price.toFixed(2) + "%",
    };

    // 코스피 지수 변화율
    const kospiSeries = chart.addSeries(LineSeries, {
      color: COLORS.kospi,
      lineWidth: 2,
      title: "",
      priceFormat: pctFormat,
    });
    kospiSeries.setData(
      data.map((d) => ({
        time: d.date as Time,
        value: pctChange(first.kospiClose, d.kospiClose),
      }))
    );
    newSeriesMap.set(kospiSeries as ISeriesApi<SeriesType>, "kospi");

    // 코스닥 지수 변화율
    const kosdaqSeries = chart.addSeries(LineSeries, {
      color: COLORS.kosdaq,
      lineWidth: 2,
      title: "",
      priceFormat: pctFormat,
    });
    kosdaqSeries.setData(
      data.map((d) => ({
        time: d.date as Time,
        value: pctChange(first.kosdaqClose, d.kosdaqClose),
      }))
    );
    newSeriesMap.set(kosdaqSeries as ISeriesApi<SeriesType>, "kosdaq");

    // 전체 신용융자잔고 변화율
    const loanSeries = chart.addSeries(LineSeries, {
      color: COLORS.loan,
      lineWidth: 2,
      title: "",
      priceFormat: pctFormat,
    });
    loanSeries.setData(
      data.map((d) => ({
        time: d.date as Time,
        value: pctChange(first.totalLoan, d.totalLoan),
      }))
    );
    newSeriesMap.set(loanSeries as ISeriesApi<SeriesType>, "loan");

    seriesMapRef.current = newSeriesMap;

    // 0% 기준선
    kospiSeries.createPriceLine({
      price: 0,
      color: "#52525b",
      lineWidth: 1,
      lineStyle: 1,
      axisLabelVisible: false,
      title: "",
    });

    // 커스텀 툴팁
    chart.subscribeCrosshairMove((param) => {
      const tooltip = tooltipRef.current;
      if (!tooltip || !el) return;

      if (
        !param.time ||
        param.point === undefined ||
        param.point.x < 0 ||
        param.point.y < 0
      ) {
        tooltip.style.display = "none";
        return;
      }

      const dateStr = param.time as string;
      const raw = rawDataRef.current.get(dateStr);
      if (!raw) {
        tooltip.style.display = "none";
        return;
      }

      const base = baseRef.current;
      const info: TooltipData = {
        date: dateStr,
        kospiClose: raw.kospiClose,
        kospiPct: pctChange(base.kospi, raw.kospiClose),
        kosdaqClose: raw.kosdaqClose,
        kosdaqPct: pctChange(base.kosdaq, raw.kosdaqClose),
        totalLoan: raw.totalLoan,
        loanPct: pctChange(base.loan, raw.totalLoan),
      };

      const fmtPct = (v: number) =>
        (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
      const pctColor = (v: number) =>
        v > 0 ? "#ef4444" : v < 0 ? "#3b82f6" : "#a1a1aa";

      tooltip.innerHTML = `
        <div style="font-size:11px;color:#a1a1aa;margin-bottom:4px">${info.date}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${COLORS.kospi}"></span>
          <span style="color:#e4e4e7">코스피</span>
          <span style="color:#e4e4e7;margin-left:auto">${info.kospiClose.toFixed(2)}</span>
          <span style="color:${pctColor(info.kospiPct)};min-width:60px;text-align:right">${fmtPct(info.kospiPct)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${COLORS.kosdaq}"></span>
          <span style="color:#e4e4e7">코스닥</span>
          <span style="color:#e4e4e7;margin-left:auto">${info.kosdaqClose.toFixed(2)}</span>
          <span style="color:${pctColor(info.kosdaqPct)};min-width:60px;text-align:right">${fmtPct(info.kosdaqPct)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${COLORS.loan}"></span>
          <span style="color:#e4e4e7">신용융자</span>
          <span style="color:#e4e4e7;margin-left:auto">${info.totalLoan.toLocaleString()}억</span>
          <span style="color:${pctColor(info.loanPct)};min-width:60px;text-align:right">${fmtPct(info.loanPct)}</span>
        </div>
      `;

      tooltip.style.display = "block";

      const chartRect = el.getBoundingClientRect();
      const tooltipWidth = tooltip.offsetWidth;
      const tooltipHeight = tooltip.offsetHeight;

      let left = param.point.x + 16;
      if (left + tooltipWidth > chartRect.width) {
        left = param.point.x - tooltipWidth - 16;
      }
      let top = param.point.y - tooltipHeight / 2;
      if (top < 0) top = 0;
      if (top + tooltipHeight > chartRect.height) {
        top = chartRect.height - tooltipHeight;
      }

      tooltip.style.left = left + "px";
      tooltip.style.top = top + "px";
    });

    chart.timeScale().fitContent();

    const onResize = () => chart.applyOptions({ width: el.clientWidth });
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [data]);

  useEffect(() => {
    const cleanup = buildChart();
    return cleanup;
  }, [buildChart]);

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
    <div className="rounded-xl border border-border bg-card p-6">
      {/* 범례 */}
      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: COLORS.kospi }}
          />
          코스피 지수
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: COLORS.kosdaq }}
          />
          코스닥 지수
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: COLORS.loan }}
          />
          전체 신용융자잔고
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          기간 시작일 대비 변화율 (%)
        </span>
      </div>

      {/* 차트 + 툴팁 */}
      <div className="relative w-full overflow-hidden rounded-lg">
        <div ref={containerRef} className="w-full" />
        <div
          ref={tooltipRef}
          className="pointer-events-none absolute z-10 hidden rounded-lg border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur-sm"
          style={{ fontSize: "12px", lineHeight: "1.5", minWidth: "220px" }}
        />
      </div>
    </div>
  );
}
