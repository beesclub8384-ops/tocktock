"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts";
import seriesData from "@/lib/data/ken-fisher-series.json";
import { NASDAQ100_PE_ANNUAL } from "@/lib/data/ken-fisher-nasdaq-pe";
import { KEN_FISHER_EVENTS } from "@/lib/data/ken-fisher-events";

interface SeriesData {
  generatedAt: string;
  sources: { sp500: string; nasdaq100: string };
  sp500Price: { date: string; price: number }[];
  sp500Pe: { date: string; value: number }[];
  nasdaq100Price: { date: string; price: number }[];
}

const data = seriesData as SeriesData;

const SP_COLOR = "#a855f7"; // purple
const NDX_COLOR = "#10b981"; // emerald

// 두 차트의 X 도메인·틱 동기화
const X_DOMAIN: [number, number] = [
  Date.UTC(1985, 0, 1),
  Date.UTC(2026, 3, 30),
];
const YEAR_TICKS = [1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025];
const YEAR_TICK_TS = YEAR_TICKS.map((y) => Date.UTC(y, 0, 1));

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

// 연말 NDX PE(예: 1999-12-31)를 월별 시계열에 붙이기 위해 YYYY-MM-01로 정규화
function normalizeToMonthStart(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

// 가격 포맷 (로그 틱용 간결 표기)
function formatPrice(v: number): string {
  if (v >= 1000) {
    const k = v / 1000;
    return k >= 10 ? `${Math.round(k)}k` : `${k.toFixed(1)}k`;
  }
  return Math.round(v).toString();
}

// 범례용 마커
function LegendMarker({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <svg width="18" height="6" className="shrink-0" aria-hidden="true">
      <line
        x1="0"
        y1="3"
        x2="18"
        y2="3"
        stroke={color}
        strokeWidth={dashed ? 1.5 : 2}
        strokeDasharray={dashed ? "3 2" : undefined}
      />
    </svg>
  );
}

function DualTooltip(props: {
  active?: boolean;
  payload?: Array<{
    dataKey: string;
    value: number | null;
    stroke: string;
    payload: { t: number };
  }>;
  color: string;
  priceLabel: string;
  peLabel: string;
}) {
  const { active, payload, color, priceLabel, peLabel } = props;
  if (!active || !payload?.length) return null;
  const price = payload.find((p) => p.dataKey === "price")?.value ?? null;
  const pe = payload.find((p) => p.dataKey === "pe")?.value ?? null;
  const t = payload[0]?.payload.t;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-xs space-y-1">
      <p className="font-medium tabular-nums">{tsToYearMonth(t)}</p>
      <div className="flex items-center gap-1.5 tabular-nums">
        <LegendMarker color={color} />
        <span className="text-muted-foreground">{priceLabel}</span>
        <span className="text-foreground font-medium ml-auto">
          {price != null ? formatPriceExact(price) : "—"}
        </span>
      </div>
      <div className="flex items-center gap-1.5 tabular-nums">
        <LegendMarker color={color} dashed />
        <span className="text-muted-foreground">{peLabel}</span>
        <span className="text-foreground font-medium ml-auto">
          {pe != null ? pe.toFixed(1) : "—"}
        </span>
      </div>
    </div>
  );
}

function formatPriceExact(v: number): string {
  return v >= 100
    ? v.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : v.toFixed(2);
}

function CombinedChart({
  title,
  series,
  color,
  peMaxY,
  priceLegendLabel,
  peLegendLabel,
}: {
  title: string;
  series: { t: number; price: number | null; pe: number | null }[];
  color: string;
  peMaxY: number;
  priceLegendLabel: string;
  peLegendLabel: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-baseline justify-between mb-3 gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>

      {/* 커스텀 범례 */}
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
        <span className="flex items-center gap-1.5">
          <LegendMarker color={color} />
          <span>{priceLegendLabel}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <LegendMarker color={color} dashed />
          <span>{peLegendLabel}</span>
        </span>
      </div>

      <div className="h-[350px] sm:h-[450px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={series}
            margin={{ top: 8, right: 4, bottom: 4, left: 0 }}
          >
            <CartesianGrid
              stroke="hsl(var(--border))"
              strokeDasharray="3 3"
              vertical={false}
            />
            {/* Fisher Zones — PE 축 기준 */}
            <ReferenceArea
              yAxisId="pe"
              y1={0}
              y2={10}
              fill="#22c55e"
              fillOpacity={0.05}
              ifOverflow="visible"
            />
            <ReferenceArea
              yAxisId="pe"
              y1={10}
              y2={13}
              fill="#eab308"
              fillOpacity={0.05}
              ifOverflow="visible"
            />
            <ReferenceArea
              yAxisId="pe"
              y1={13}
              y2={20}
              fill="#f97316"
              fillOpacity={0.05}
              ifOverflow="visible"
            />
            <ReferenceArea
              yAxisId="pe"
              y1={20}
              y2={peMaxY}
              fill="#ef4444"
              fillOpacity={0.05}
              ifOverflow="visible"
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
              allowDataOverflow={false}
            />
            <YAxis
              yAxisId="price"
              orientation="left"
              scale="log"
              domain={["auto", "auto"]}
              tickFormatter={formatPrice}
              tick={{
                fontSize: 10,
                fill: "hsl(var(--muted-foreground))",
              }}
              tickLine={false}
              axisLine={false}
              width={42}
            />
            <YAxis
              yAxisId="pe"
              orientation="right"
              domain={[0, peMaxY]}
              tickFormatter={(v: number) => v.toString()}
              tick={{
                fontSize: 10,
                fill: "hsl(var(--muted-foreground))",
              }}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <Tooltip
              content={
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ((props: any) => (
                  <DualTooltip
                    {...props}
                    color={color}
                    priceLabel={priceLegendLabel.replace(/\s*\(.*\)\s*/, "")}
                    peLabel={peLegendLabel.replace(/\s*\(.*\)\s*/, "")}
                  />
                )) as unknown as React.ReactElement
              }
              cursor={{
                stroke: "hsl(var(--muted-foreground))",
                strokeOpacity: 0.25,
              }}
            />
            {/* 가격 (실선) */}
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="price"
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              connectNulls
            />
            {/* PER (점선) */}
            <Line
              yAxisId="pe"
              type="monotone"
              dataKey="pe"
              stroke={color}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function KenFisherPage() {
  const sp500Combined = useMemo(() => {
    const byDate = new Map<string, { t: number; price: number | null; pe: number | null }>();
    for (const r of data.sp500Price) {
      byDate.set(r.date, { t: dateToTs(r.date), price: r.price, pe: null });
    }
    for (const r of data.sp500Pe) {
      const e = byDate.get(r.date);
      if (e) e.pe = r.value;
      else byDate.set(r.date, { t: dateToTs(r.date), price: null, pe: r.value });
    }
    return Array.from(byDate.values()).sort((a, b) => a.t - b.t);
  }, []);

  const nasdaqCombined = useMemo(() => {
    const byDate = new Map<string, { t: number; price: number | null; pe: number | null }>();
    for (const r of data.nasdaq100Price) {
      byDate.set(r.date, { t: dateToTs(r.date), price: r.price, pe: null });
    }
    for (const p of NASDAQ100_PE_ANNUAL) {
      const key = normalizeToMonthStart(p.date);
      const existing = byDate.get(key);
      if (existing) {
        existing.pe = p.value;
      } else {
        byDate.set(key, { t: dateToTs(key), price: null, pe: p.value });
      }
    }
    return Array.from(byDate.values()).sort((a, b) => a.t - b.t);
  }, []);

  const spPriceRange = `${data.sp500Price[0].date.slice(0, 7)} – ${data.sp500Price[data.sp500Price.length - 1].date.slice(0, 7)}`;
  const spPeRange = `${data.sp500Pe[0].date.slice(0, 7)} – ${data.sp500Pe[data.sp500Pe.length - 1].date.slice(0, 7)}`;
  const ndxPriceRange = `${data.nasdaq100Price[0].date.slice(0, 7)} – ${data.nasdaq100Price[data.nasdaq100Price.length - 1].date.slice(0, 7)}`;
  const ndxPeRange = `${NASDAQ100_PE_ANNUAL[0].date.slice(0, 4)} – ${NASDAQ100_PE_ANNUAL[NASDAQ100_PE_ANNUAL.length - 1].date.slice(0, 4)}`;

  return (
    <main className="max-w-5xl mx-auto px-4 py-12 sm:px-8 sm:py-20">
      {/* HEADER */}
      <header className="mb-8">
        <p className="text-xs font-medium text-muted-foreground tracking-wider uppercase mb-2">
          Ken Fisher · 장기 시계열
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          S&amp;P 500 × Nasdaq 100
        </h1>
        <p className="mt-1 text-lg sm:text-xl text-muted-foreground font-medium">
          가격 vs 밸류에이션
        </p>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          각 지수의 가격(실선)과 PER(점선)을 같은 차트에 겹쳐,
          &ldquo;가격이 오를 때 PER은 어떻게 움직였는지&rdquo; 한눈에
          비교합니다. 가격은 왼쪽 축(로그 스케일), PER은 오른쪽 축(선형)이며
          PER 축에는 Fisher Zones(&lt;10 / 10–13 / 13–20 / 20+)가 배경으로
          깔립니다.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            S&amp;P 500 가격{" "}
            <span className="text-foreground font-medium tabular-nums">
              {spPriceRange}
            </span>
          </span>
          <span>
            S&amp;P 500 PER{" "}
            <span className="text-foreground font-medium tabular-nums">
              {spPeRange}
            </span>
          </span>
          <span>
            Nasdaq 100 가격{" "}
            <span className="text-foreground font-medium tabular-nums">
              {ndxPriceRange}
            </span>
          </span>
          <span>
            Nasdaq 100 PER{" "}
            <span className="text-foreground font-medium tabular-nums">
              {ndxPeRange}
            </span>{" "}
            (연말)
          </span>
        </div>
      </header>

      <div className="space-y-6">
        {/* 차트 1: S&P 500 */}
        <CombinedChart
          title="S&P 500: 가격 × PER"
          series={sp500Combined}
          color={SP_COLOR}
          peMaxY={50}
          priceLegendLabel="S&P 500 지수 (왼쪽 축, 로그)"
          peLegendLabel="S&P 500 PER (오른쪽 축)"
        />

        {/* 차트 2: Nasdaq 100 */}
        <CombinedChart
          title="Nasdaq 100: 가격 × PER"
          series={nasdaqCombined}
          color={NDX_COLOR}
          peMaxY={100}
          priceLegendLabel="Nasdaq 100 지수 (왼쪽 축, 로그)"
          peLegendLabel="Nasdaq 100 PER (오른쪽 축, 연말)"
        />

        {/* 해설: 주요 시장 사건 */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-bold">주요 사건에서 지수 × PER의 움직임</h2>
            <span className="text-xs text-muted-foreground">
              두 차트를 같이 보는 관점
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {KEN_FISHER_EVENTS.map((e) => (
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

        {/* Fisher Zones 카드 3개 (기존 유지) */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-bold">Fisher의 PER 구간론</h2>
            <span className="text-xs text-muted-foreground">
              1987년 원본 기준
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-card p-5">
              <p className="text-xs font-semibold tracking-wider text-emerald-600 dark:text-emerald-400">
                PER &lt; 10
              </p>
              <p className="mt-2 text-base font-semibold">매수 최적기</p>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                역사적으로 이 구간에서 진입했을 때 수익률이 가장 좋았다.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-5">
              <p className="text-xs font-semibold tracking-wider text-yellow-600 dark:text-yellow-400">
                PER 10 – 13
              </p>
              <p className="mt-2 text-base font-semibold">중립 구간</p>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                특별히 유리하지도 불리하지도 않은 평균적 구간.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-5">
              <p className="text-xs font-semibold tracking-wider text-red-600 dark:text-red-400">
                PER 13 – 20
              </p>
              <p className="mt-2 text-base font-semibold">실망 구간</p>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                추가 상승이 이어지기 어렵고 조정 가능성이 높은 구간.
              </p>
            </div>
          </div>
        </section>

        {/* INTERPRETATION */}
        <section className="rounded-lg border border-border border-l-2 border-l-blue-500 bg-muted/30 p-6">
          <p className="text-xs font-semibold text-muted-foreground tracking-wider uppercase mb-2">
            오늘의 관전 포인트
          </p>
          <p className="text-sm sm:text-base leading-relaxed">
            S&amp;P 500 PER은 1985년 이후 10 이하로 떨어진 적이 없고, 2020년 이후 30
            전후에서 장기 정착했습니다. 나스닥 100은 2000년 닷컴 고점 PER
            80을 빼면 20–35 영역을 오가고 있습니다. 피셔 본인도 2007년 추가본에서{" "}
            <strong className="text-foreground">
              &ldquo;PER은 시장 예측 도구가 아니다&rdquo;
            </strong>
            라고 입장을 바꿨습니다. 숫자는 체온계일 뿐,{" "}
            <strong className="text-foreground">
              그 온도를 대중이 어떻게 해석하는지
            </strong>
            가 진짜 시장을 움직입니다.
          </p>
        </section>

        {/* FOOTNOTE */}
        <div className="mt-6 pt-6 border-t border-border text-xs text-muted-foreground leading-relaxed space-y-2">
          <p>
            <strong className="text-foreground">데이터 출처.</strong> S&amp;P 500
            가격·PER은 Robert J. Shiller의{" "}
            <a
              href="https://shillerdata.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              shillerdata.com
            </a>
            (ie_data.xls)을 사용하며, 최신 구간(2024-10 이후)의 가격은 Yahoo
            Finance ^GSPC로 보강했습니다. Nasdaq 100 가격은 Yahoo Finance
            ^NDX입니다. Nasdaq 100 PER은 무료 월별 장기 시계열을 구할 수 없어
            공개 자료 기반 연말 추정치를 사용합니다(제공사별 ±2p 편차 가능).
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
            교육·참고 목적이며 투자 권유가 아닙니다. PER은 산정 방식과 데이터
            제공사에 따라 차이가 있을 수 있으며, 특히 닷컴 시기 Nasdaq 100 PER은
            출처마다 편차가 큽니다.
          </p>
        </div>
      </div>
    </main>
  );
}
