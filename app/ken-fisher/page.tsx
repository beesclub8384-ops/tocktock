"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import { PER_DATA, PER_LABELS, PER_META } from "@/lib/data/ken-fisher-per";

const chartData = PER_LABELS.map((label, i) => ({
  label,
  dow: PER_DATA.dow.values[i],
  sp: PER_DATA.sp.values[i],
  nas: PER_DATA.nas.values[i],
}));

const SERIES = [
  { key: "dow", label: PER_DATA.dow.label, color: PER_DATA.dow.color },
  { key: "sp", label: PER_DATA.sp.label, color: PER_DATA.sp.color },
  { key: "nas", label: PER_DATA.nas.label, color: PER_DATA.nas.color },
] as const;

const SNAPSHOTS = [
  {
    key: "dow",
    badge: "DJIA",
    name: "다우존스 산업평균지수",
    value: "23.37",
    compareLabel: "5년 평균",
    compareValue: "22.56",
    diff: "+3.6%",
    color: PER_DATA.dow.color,
  },
  {
    key: "sp",
    badge: "S&P 500",
    name: "S&P 500 지수",
    value: "27.73",
    compareLabel: "역사 중앙값",
    compareValue: "18.00",
    diff: "+54%",
    color: PER_DATA.sp.color,
  },
  {
    key: "nas",
    badge: "NDX",
    name: "나스닥 100 지수",
    value: "35.15",
    compareLabel: "역사 중앙값",
    compareValue: "24.47",
    diff: "+44%",
    color: PER_DATA.nas.color,
  },
];

const FISHER_ZONES = [
  {
    range: "PER < 10",
    title: "매수 최적기",
    desc: "역사적으로 이 구간에서 진입했을 때 수익률이 가장 좋았다.",
    color: "text-emerald-600 dark:text-emerald-400",
  },
  {
    range: "PER 10 – 13",
    title: "중립 구간",
    desc: "특별히 유리하지도 불리하지도 않은 평균적 구간.",
    color: "text-yellow-600 dark:text-yellow-400",
  },
  {
    range: "PER 13 – 20",
    title: "실망 구간",
    desc: "추가 상승이 이어지기 어렵고 조정 가능성이 높은 구간.",
    color: "text-red-600 dark:text-red-400",
  },
];

// 마지막 포인트(현재)만 큰 dot, 그 외는 작게
function renderDot(props: {
  cx?: number;
  cy?: number;
  index?: number;
  stroke?: string;
  key?: string | number;
}) {
  const { cx, cy, index, stroke, key } = props;
  if (typeof cx !== "number" || typeof cy !== "number") {
    return <g key={key} />;
  }
  const isCurrent = index === 5;
  return (
    <circle
      key={key}
      cx={cx}
      cy={cy}
      r={isCurrent ? 6 : 3}
      fill={stroke}
      stroke="hsl(var(--background))"
      strokeWidth={isCurrent ? 2 : 1.5}
    />
  );
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; name: string; value: number; stroke: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-xs">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="tabular-nums">
          <span style={{ color: p.stroke }}>■</span>{" "}
          <span className="text-muted-foreground">{p.name}:</span>{" "}
          <span className="text-foreground font-medium">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

export default function KenFisherPage() {
  return (
    <main className="max-w-5xl mx-auto px-4 py-12 sm:px-8 sm:py-20">
      {/* HEADER */}
      <header className="mb-8">
        <p className="text-xs font-medium text-muted-foreground tracking-wider uppercase mb-2">
          Ken Fisher · PER 관점
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          3대 지수 PER, 역사 vs 현재
        </h1>
        <p className="mt-2 text-muted-foreground">
          켄 피셔의 『불변의 차트 90』이 제시한 PER 기준을 다우존스 · S&amp;P 500
          · 나스닥 100에 적용해 비교합니다.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            기준일{" "}
            <span className="text-foreground font-medium tabular-nums">
              {PER_META.baseDate}
            </span>
          </span>
          <span>
            출처{" "}
            <span className="text-foreground font-medium">
              {PER_META.sources}
            </span>
          </span>
        </div>
      </header>

      <div className="space-y-6">
        {/* SNAPSHOT CARDS */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {SNAPSHOTS.map((s) => (
            <div
              key={s.key}
              className="relative overflow-hidden rounded-lg border border-border bg-card p-5"
            >
              <span
                className="absolute left-0 top-0 h-0.5 w-full"
                style={{ background: s.color }}
              />
              <p
                className="text-xs font-semibold tracking-wider"
                style={{ color: s.color }}
              >
                {s.badge}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{s.name}</p>
              <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight">
                {s.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {s.compareLabel}{" "}
                <span className="text-foreground font-medium tabular-nums">
                  {s.compareValue}
                </span>{" "}
                · 위{" "}
                <span className="text-red-600 dark:text-red-400 font-medium tabular-nums">
                  {s.diff}
                </span>
              </p>
            </div>
          ))}
        </section>

        {/* CHART */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-bold">현재 PER vs 역사적 구간</h2>
            <span className="text-xs text-muted-foreground">
              Fisher Zones 오버레이
            </span>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
            {/* 범례 */}
            <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-xs">
              {SERIES.map((s) => (
                <span key={s.key} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ background: s.color }}
                  />
                  <span className="text-foreground">{s.label}</span>
                </span>
              ))}
            </div>

            <div className="h-[340px] sm:h-[380px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
                >
                  {/* 레이어 순서: grid → zones → boundary → axes → lines */}
                  <CartesianGrid
                    stroke="hsl(var(--border))"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  {/* Fisher Zones — y1 < y2 */}
                  <ReferenceArea
                    y1={5}
                    y2={10}
                    fill="#22c55e"
                    fillOpacity={0.07}
                    ifOverflow="visible"
                  />
                  <ReferenceArea
                    y1={10}
                    y2={13}
                    fill="#eab308"
                    fillOpacity={0.07}
                    ifOverflow="visible"
                  />
                  <ReferenceArea
                    y1={13}
                    y2={20}
                    fill="#ef4444"
                    fillOpacity={0.07}
                    ifOverflow="visible"
                  />
                  <ReferenceLine
                    y={10}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="3 4"
                    strokeOpacity={0.4}
                  />
                  <ReferenceLine
                    y={13}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="3 4"
                    strokeOpacity={0.4}
                  />
                  <ReferenceLine
                    y={20}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="3 4"
                    strokeOpacity={0.4}
                  />
                  <XAxis
                    dataKey="label"
                    interval={0}
                    tick={{
                      fontSize: 10,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    domain={[5, 42]}
                    tick={{
                      fontSize: 10,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                    tickFormatter={(v: number) => `${v}`}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                  />
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ stroke: "hsl(var(--muted-foreground))", strokeOpacity: 0.2 }}
                  />
                  {SERIES.map((s) => (
                    <Line
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={s.label}
                      stroke={s.color}
                      strokeWidth={2}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      dot={renderDot as any}
                      activeDot={{ r: 6 }}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* FISHER ZONES 카드 */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-bold">Fisher의 PER 구간론</h2>
            <span className="text-xs text-muted-foreground">
              1987년 원본 기준
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {FISHER_ZONES.map((z) => (
              <div
                key={z.range}
                className="rounded-lg border border-border bg-card p-5"
              >
                <p
                  className={`text-xs font-semibold tracking-wider ${z.color}`}
                >
                  {z.range}
                </p>
                <p className="mt-2 text-base font-semibold">{z.title}</p>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                  {z.desc}
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
            세 지수 모두 Fisher의{" "}
            <strong className="text-foreground">실망 구간(13–20)</strong>을 이미
            돌파했습니다. 다만 피셔 본인도 2007년 추가본에서{" "}
            <strong className="text-foreground">
              &ldquo;PER은 시장 예측 도구가 아니다&rdquo;
            </strong>
            라고 입장을 바꿨습니다. 숫자보다 중요한 건,{" "}
            <strong className="text-foreground">
              그 숫자를 대중이 어떻게 받아들이는가
            </strong>
            입니다.
          </p>
        </section>

        {/* FOOTNOTE */}
        <p className="mt-6 pt-6 border-t border-border text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">면책조항.</strong> 본 페이지는
          교육·참고 목적이며 투자 권유가 아닙니다. PER 수치는 데이터 제공사마다
          산정 방식이 달라 차이가 있을 수 있습니다. 최신 수치는 각 출처에서
          직접 확인하시기 바랍니다.
        </p>
      </div>
    </main>
  );
}
