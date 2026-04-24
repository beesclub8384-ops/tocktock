"use client";

import { useMemo } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import seriesData from "@/lib/data/ken-fisher-series.json";

interface SeriesData {
  generatedAt: string;
  sources: {
    sp500: string;
    nasdaq100: string;
    longTermRate: string;
  };
  sp500Price: { date: string; price: number }[];
  sp500Pe: { date: string; value: number }[];
  nasdaq100Price: { date: string; price: number }[];
  longTermRate: { date: string; rate: number }[];
}

const data = seriesData as SeriesData;

const EY_COLOR = "#a855f7"; // purple — 이익수익률
const RATE_COLOR = "#f97316"; // orange — 국채 금리

const X_DOMAIN: [number, number] = [
  Date.UTC(1985, 0, 1),
  Date.UTC(2026, 3, 30),
];
const YEAR_TICKS = [1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025];
const YEAR_TICK_TS = YEAR_TICKS.map((y) => Date.UTC(y, 0, 1));

// 역사적 주요 역전 시점 (EY < Rate, 즉 "죽음의 키스")
const INVERSION_EVENTS = [
  {
    date: "1987-08",
    label: "블랙먼데이 직전",
    detail:
      "1987년 여름 이익수익률 5.5% vs 10년물 9%로 3.5%p 역전. 두 달 뒤(10/19) 하루 -20.5% 폭락.",
  },
  {
    date: "2000-03",
    label: "닷컴버블 정점",
    detail:
      "2000년 3월 S&P 이익수익률 3.4% vs 10년물 6.3%로 2.9%p 역전. 이후 S&P 2.5년간 -49%, 나스닥 -78%.",
  },
  {
    date: "2007-07",
    label: "금융위기 직전",
    detail:
      "2007년 중반 이익수익률 5% vs 10년물 5%로 근접. 그해 10월 고점 후 2009년 3월까지 S&P -57% 조정.",
  },
  {
    date: "2022-10",
    label: "최근 금리 급등 국면",
    detail:
      "2022년 10월 이익수익률 4.8% vs 10년물 4%로 스프레드가 빠르게 축소. 같은 해 S&P -25% 조정.",
  },
];

function dateToTs(d: string): number {
  return new Date(d).getTime();
}

function tsToYear(ts: number): string {
  return new Date(ts).getUTCFullYear().toString();
}

function tsToYearMonth(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatPct(v: number): string {
  return `${v.toFixed(2)}%`;
}

// 범례 마커
function LegendMarker({
  color,
  dashed,
}: {
  color: string;
  dashed?: boolean;
}) {
  return (
    <svg width="18" height="6" className="shrink-0" aria-hidden="true">
      <line
        x1="0"
        y1="3"
        x2="18"
        y2="3"
        stroke={color}
        strokeWidth={2}
        strokeDasharray={dashed ? "3 2" : undefined}
      />
    </svg>
  );
}

function YieldTooltip(props: {
  active?: boolean;
  payload?: Array<{
    dataKey: string;
    value: number | number[] | null;
    stroke: string;
    payload: { t: number; ey: number | null; rate: number | null };
  }>;
}) {
  const { active, payload } = props;
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const ey = row.ey;
  const rate = row.rate;
  const spread = ey != null && rate != null ? ey - rate : null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-xs space-y-1 min-w-[200px]">
      <p className="font-medium tabular-nums">{tsToYearMonth(row.t)}</p>
      <div className="flex items-center gap-1.5 tabular-nums">
        <LegendMarker color={EY_COLOR} />
        <span className="text-muted-foreground">S&P 500 이익수익률</span>
        <span className="ml-auto text-foreground font-medium">
          {ey != null ? formatPct(ey) : "—"}
        </span>
      </div>
      <div className="flex items-center gap-1.5 tabular-nums">
        <LegendMarker color={RATE_COLOR} />
        <span className="text-muted-foreground">10년물 국채</span>
        <span className="ml-auto text-foreground font-medium">
          {rate != null ? formatPct(rate) : "—"}
        </span>
      </div>
      {spread != null && (
        <div className="flex items-center gap-1.5 tabular-nums pt-1 border-t border-border">
          <span className="text-muted-foreground">스프레드</span>
          <span
            className={`ml-auto font-medium ${
              spread >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {spread >= 0 ? "+" : ""}
            {spread.toFixed(2)}%p
          </span>
        </div>
      )}
    </div>
  );
}

export default function EarningsYieldVsBondPage() {
  // 병합된 시계열: 이익수익률(EY) + 10년물 금리
  const chartData = useMemo(() => {
    // EY 맵: date → earnings yield
    const eyMap = new Map<string, number>();
    for (const p of data.sp500Pe) {
      if (p.value > 0) eyMap.set(p.date, (1 / p.value) * 100);
    }
    // Rate 맵
    const rateMap = new Map<string, number>();
    for (const p of data.longTermRate) {
      rateMap.set(p.date, p.rate);
    }
    // 모든 날짜 유니언
    const dates = new Set<string>([...eyMap.keys(), ...rateMap.keys()]);
    const sorted = Array.from(dates).sort();
    return sorted.map((d) => {
      const ey = eyMap.get(d) ?? null;
      const rate = rateMap.get(d) ?? null;
      // Range Area용 대역: [lower, upper] 또는 null
      let greenBand: [number, number] | null = null;
      let redBand: [number, number] | null = null;
      if (ey != null && rate != null) {
        if (ey > rate) greenBand = [rate, ey];
        else if (ey < rate) redBand = [ey, rate];
      }
      return {
        t: dateToTs(d),
        ey: ey != null ? Math.round(ey * 100) / 100 : null,
        rate,
        greenBand,
        redBand,
      };
    });
  }, []);

  // 현재(최근 공통 시점) 스냅샷
  const latestCommon = useMemo(() => {
    const eyMap = new Map<string, number>();
    for (const p of data.sp500Pe) {
      if (p.value > 0) eyMap.set(p.date, (1 / p.value) * 100);
    }
    const rateMap = new Map<string, number>();
    for (const p of data.longTermRate) rateMap.set(p.date, p.rate);

    // 가장 최근 EY 데이터 시점에 해당하는 rate
    const lastEyDate = data.sp500Pe[data.sp500Pe.length - 1].date;
    const lastEy = eyMap.get(lastEyDate)!;
    const rateAtThen = rateMap.get(lastEyDate) ?? null;
    // 가장 최근 rate
    const lastRateDate = data.longTermRate[data.longTermRate.length - 1].date;
    const lastRate = rateMap.get(lastRateDate)!;
    return {
      lastEyDate,
      lastEy,
      rateAtThen,
      lastRateDate,
      lastRate,
      spreadAtThen:
        rateAtThen != null ? Math.round((lastEy - rateAtThen) * 100) / 100 : null,
    };
  }, []);

  const eyRange = `${data.sp500Pe[0].date.slice(0, 7)} – ${data.sp500Pe[data.sp500Pe.length - 1].date.slice(0, 7)}`;
  const rateRange = `${data.longTermRate[0].date.slice(0, 7)} – ${data.longTermRate[data.longTermRate.length - 1].date.slice(0, 7)}`;

  const spreadNow = latestCommon.spreadAtThen;

  return (
    <main className="max-w-5xl mx-auto px-4 py-12 sm:px-8 sm:py-20">
      {/* HEADER */}
      <header className="mb-8">
        <p className="text-xs font-medium text-muted-foreground tracking-wider uppercase mb-2">
          Ken Fisher · 주식 vs 채권
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          이익수익률 vs 10년물 국채 금리
        </h1>
        <p className="mt-1 text-lg sm:text-xl text-muted-foreground font-medium">
          주식이 채권보다 매력적인가
        </p>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          <strong className="text-foreground">이익수익률(1/PER)</strong>은 주식을
          샀을 때의 기대 수익률, <strong className="text-foreground">10년물 금리</strong>는
          장기 무위험 수익률입니다. 두 값이 비슷해지거나 역전되면 켄 피셔가 말한{" "}
          <strong className="text-foreground">&ldquo;죽음의 키스&rdquo;</strong> —
          주식의 상대적 매력이 사라지는 순간입니다. 녹색 영역은 주식 우위, 빨간
          영역은 채권 우위 구간입니다.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            S&amp;P 500 이익수익률{" "}
            <span className="text-foreground font-medium tabular-nums">
              {eyRange}
            </span>
          </span>
          <span>
            10년물 국채 금리{" "}
            <span className="text-foreground font-medium tabular-nums">
              {rateRange}
            </span>
          </span>
        </div>
      </header>

      <div className="space-y-6">
        {/* 메인 차트 */}
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-baseline justify-between mb-3 gap-2">
            <h3 className="text-sm font-semibold">
              이익수익률 vs 10년물 금리 (월별, %)
            </h3>
          </div>

          {/* 커스텀 범례 */}
          <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
            <span className="flex items-center gap-1.5">
              <LegendMarker color={EY_COLOR} />
              <span>S&P 500 이익수익률</span>
            </span>
            <span className="flex items-center gap-1.5">
              <LegendMarker color={RATE_COLOR} />
              <span>10년물 국채 금리</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500/20 border border-emerald-500/40" />
              <span>주식 우위</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-red-500/20 border border-red-500/40" />
              <span>채권 우위 (역전)</span>
            </span>
          </div>

          <div className="h-[400px] sm:h-[480px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
              >
                <CartesianGrid
                  stroke="hsl(var(--border))"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                {/* 두 선 사이 영역: 주식 우위(녹) / 채권 우위(빨) */}
                <Area
                  type="monotone"
                  dataKey="greenBand"
                  stroke="transparent"
                  fill="#22c55e"
                  fillOpacity={0.18}
                  isAnimationActive={false}
                  activeDot={false}
                  connectNulls={false}
                />
                <Area
                  type="monotone"
                  dataKey="redBand"
                  stroke="transparent"
                  fill="#ef4444"
                  fillOpacity={0.18}
                  isAnimationActive={false}
                  activeDot={false}
                  connectNulls={false}
                />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={X_DOMAIN}
                  ticks={YEAR_TICK_TS}
                  tickFormatter={tsToYear}
                  tick={{
                    fontSize: 10,
                    fill: "hsl(var(--muted-foreground))",
                  }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, 16]}
                  tickFormatter={(v: number) => `${v}%`}
                  tick={{
                    fontSize: 10,
                    fill: "hsl(var(--muted-foreground))",
                  }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  content={<YieldTooltip {...({} as any)} />}
                  cursor={{
                    stroke: "hsl(var(--muted-foreground))",
                    strokeOpacity: 0.25,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="ey"
                  stroke={EY_COLOR}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke={RATE_COLOR}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 현재 스냅샷 3개 카드 */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-bold">현재 스냅샷</h2>
            <span className="text-xs text-muted-foreground">
              가장 최근 공통 시점: {latestCommon.lastEyDate.slice(0, 7)}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative overflow-hidden rounded-lg border border-border bg-card p-5">
              <span
                className="absolute left-0 top-0 h-0.5 w-full"
                style={{ background: EY_COLOR }}
              />
              <p
                className="text-xs font-semibold tracking-wider"
                style={{ color: EY_COLOR }}
              >
                S&P 500 이익수익률
              </p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {latestCommon.lastEyDate.slice(0, 7)} 기준
              </p>
              <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight">
                {formatPct(latestCommon.lastEy)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                S&amp;P 500을 샀을 때 기대되는 연간 수익률(1/PER)
              </p>
            </div>

            <div className="relative overflow-hidden rounded-lg border border-border bg-card p-5">
              <span
                className="absolute left-0 top-0 h-0.5 w-full"
                style={{ background: RATE_COLOR }}
              />
              <p
                className="text-xs font-semibold tracking-wider"
                style={{ color: RATE_COLOR }}
              >
                10년물 국채 금리
              </p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {latestCommon.lastRateDate.slice(0, 7)} 기준 (최근치)
              </p>
              <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight">
                {formatPct(latestCommon.lastRate)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                무위험 장기 채권 수익률
              </p>
            </div>

            <div className="relative overflow-hidden rounded-lg border border-border bg-card p-5">
              <span
                className={`absolute left-0 top-0 h-0.5 w-full ${
                  spreadNow != null && spreadNow >= 0
                    ? "bg-emerald-500"
                    : "bg-red-500"
                }`}
              />
              <p
                className={`text-xs font-semibold tracking-wider ${
                  spreadNow != null && spreadNow >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                스프레드 (EY − 금리)
              </p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {latestCommon.lastEyDate.slice(0, 7)} 시점
              </p>
              <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight">
                {spreadNow != null
                  ? `${spreadNow >= 0 ? "+" : ""}${spreadNow.toFixed(2)}%p`
                  : "—"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {spreadNow != null && spreadNow >= 0
                  ? `주식이 채권보다 ${Math.abs(spreadNow).toFixed(2)}%p 더 매력적`
                  : spreadNow != null
                    ? `채권이 주식보다 ${Math.abs(spreadNow).toFixed(2)}%p 더 매력적`
                    : "비교 불가"}
              </p>
            </div>
          </div>
          {latestCommon.lastRateDate !== latestCommon.lastEyDate && (
            <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
              참고: Shiller S&amp;P 500 12개월 후행 EPS는{" "}
              <span className="tabular-nums">
                {latestCommon.lastEyDate.slice(0, 7)}
              </span>
              까지 제공되어 이익수익률이 그 시점까지만 계산됩니다. 10년물 금리는
              Yahoo ^TNX로{" "}
              <span className="tabular-nums">
                {latestCommon.lastRateDate.slice(0, 7)}
              </span>
              까지 보강되어 표시됩니다.
            </p>
          )}
        </section>

        {/* 주요 역전 시기 */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-bold">역사적 역전 시기</h2>
            <span className="text-xs text-muted-foreground">
              EY &lt; 금리 구간 = 채권 우위
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {INVERSION_EVENTS.map((e) => (
              <div
                key={e.date}
                className="rounded-lg border border-border bg-card p-4"
              >
                <p className="text-xs text-muted-foreground tabular-nums">
                  {e.date}
                </p>
                <p className="mt-1 text-sm font-semibold">{e.label}</p>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {e.detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* INTERPRETATION */}
        <section className="rounded-lg border border-border border-l-2 border-l-blue-500 bg-muted/30 p-6">
          <p className="text-xs font-semibold text-muted-foreground tracking-wider uppercase mb-2">
            오늘의 관전 포인트
          </p>
          <p className="text-sm sm:text-base leading-relaxed">
            1985년 이후 큰 시장 하락(1987, 2000, 2007)의 공통점은{" "}
            <strong className="text-foreground">
              이익수익률과 10년물 금리의 스프레드가 좁혀지거나 역전된 상태에서
              터졌다
            </strong>
            는 것입니다. 반대로 2009–2021처럼 스프레드가 넓게 벌어졌던 시기는
            주식이 장기 상승했습니다. 단, 켄 피셔 본인도 2007년에 이 지표만으로
            시장을 예측할 수는 없다고 입장을 정정했습니다.{" "}
            <strong className="text-foreground">
              이 차트는 &ldquo;주식과 채권의 상대 매력&rdquo;을 한 눈에 보는
              도구
            </strong>
            이지, 매수·매도 신호는 아닙니다.
          </p>
        </section>

        {/* FOOTNOTE */}
        <div className="mt-6 pt-6 border-t border-border text-xs text-muted-foreground leading-relaxed space-y-2">
          <p>
            <strong className="text-foreground">데이터 출처.</strong> S&amp;P 500
            이익수익률은 Robert J. Shiller{" "}
            <a
              href="https://shillerdata.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              shillerdata.com
            </a>{" "}
            ie_data.xls의 S&amp;P 500 P/E를 역수로 취한 값입니다(EY = 1/PER).
            10년물 국채 금리는 같은 파일의 GS10(월별)이며, 최신 구간은 Yahoo
            Finance ^TNX(일별→월 마지막 거래일 종가)로 보강했습니다.
          </p>
          <p>
            <strong className="text-foreground">업데이트.</strong>{" "}
            <code className="font-mono text-[11px] rounded bg-muted px-1.5 py-0.5">
              node scripts/fetch-ken-fisher-data.mjs
            </code>{" "}
            로 재생성합니다 (네트워크 필요).
          </p>
          <p>
            <strong className="text-foreground">면책조항.</strong> 본 페이지는
            교육·참고 목적이며 투자 권유가 아닙니다. 이익수익률은 후행 실적 기반
            이며 미래를 담지 않습니다. PER 산정 방식에 따라 값이 달라질 수
            있습니다.
          </p>
        </div>
      </div>
    </main>
  );
}
