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

// recharts의 dot은 각 포인트의 index를 받는다.
// 현재(마지막, index 5) 포인트만 크게, 테두리도 두껍게.
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
      r={isCurrent ? 7 : 4}
      fill={stroke}
      stroke="#161922"
      strokeWidth={isCurrent ? 3 : 2}
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
    <div
      className="rounded-sm border px-3 py-2"
      style={{
        background: "#0f1115",
        borderColor: "#2a2e3a",
        fontFamily: "var(--font-ibm-plex), system-ui, sans-serif",
        fontSize: 12,
        color: "#e8e6e1",
      }}
    >
      <div className="mb-1 font-semibold">{label}</div>
      {payload.map((p) => (
        <div
          key={p.dataKey}
          style={{
            fontFamily: "var(--font-jetbrains), monospace",
            color: p.stroke,
          }}
        >
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
}

export default function KenFisherPage() {
  return (
    <div
      style={{
        background:
          "radial-gradient(ellipse at top left, rgba(212,165,116,0.08), transparent 50%), radial-gradient(ellipse at bottom right, rgba(107,163,214,0.06), transparent 50%), var(--kf-bg)",
        color: "var(--kf-ink)",
        fontFamily: "var(--font-ibm-plex), system-ui, sans-serif",
        fontWeight: 400,
        lineHeight: 1.5,
        minHeight: "calc(100vh - 88px)",
      }}
    >
      <main className="mx-auto max-w-[1100px] px-6 pt-12 pb-20">
        {/* HEADER */}
        <header
          className="mb-10 border-b pb-8"
          style={{ borderColor: "var(--kf-border)" }}
        >
          <div
            className="mb-4 inline-flex items-center gap-2 uppercase"
            style={{
              fontFamily: "var(--font-jetbrains), monospace",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.18em",
              color: "var(--kf-accent-dow)",
            }}
          >
            <span
              className="inline-block h-px w-6"
              style={{ background: "var(--kf-accent-dow)" }}
            />
            Ken Fisher · PER 관점
          </div>
          <h1
            className="mb-4"
            style={{
              fontFamily: "var(--font-fraunces), serif",
              fontWeight: 800,
              fontSize: "clamp(34px, 5vw, 56px)",
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
            }}
          >
            3대 지수{" "}
            <em
              style={{
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--kf-accent-dow)",
              }}
            >
              PER
            </em>
            <br />
            역사 vs 현재
          </h1>
          <p
            className="mb-5 max-w-[620px]"
            style={{ color: "var(--kf-ink-dim)", fontSize: 15 }}
          >
            켄 피셔의 『불변의 차트 90』이 제시한 PER 기준을 다우존스 · S&amp;P
            500 · 나스닥 100에 적용해 비교합니다.
          </p>
          <div
            className="flex flex-wrap gap-5"
            style={{
              fontFamily: "var(--font-jetbrains), monospace",
              fontSize: 12,
              color: "var(--kf-ink-dim)",
            }}
          >
            <span>
              기준일 ·{" "}
              <strong
                className="font-semibold"
                style={{ color: "var(--kf-ink)" }}
              >
                {PER_META.baseDate}
              </strong>
            </span>
            <span>
              출처 ·{" "}
              <strong
                className="font-semibold"
                style={{ color: "var(--kf-ink)" }}
              >
                {PER_META.sources}
              </strong>
            </span>
          </div>
        </header>

        {/* SNAPSHOT CARDS */}
        <section className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SnapshotCard
            badge="01 · DJIA"
            name="다우존스 산업평균지수"
            value="23.37"
            compareLabel="5년 평균"
            compareValue="22.56"
            diff="위 +3.6%"
            color="var(--kf-accent-dow)"
          />
          <SnapshotCard
            badge="02 · S&P 500"
            name="S&P 500 지수"
            value="27.73"
            compareLabel="역사 중앙값"
            compareValue="18.00"
            diff="위 +54%"
            color="var(--kf-accent-sp)"
          />
          <SnapshotCard
            badge="03 · NDX"
            name="나스닥 100 지수"
            value="35.15"
            compareLabel="역사 중앙값"
            compareValue="24.47"
            diff="위 +44%"
            color="var(--kf-accent-nas)"
          />
        </section>

        {/* CHART SECTION HEADER */}
        <div
          className="mb-5 flex items-baseline justify-between border-b pb-3"
          style={{ borderColor: "var(--kf-border)" }}
        >
          <h2
            style={{
              fontFamily: "var(--font-fraunces), serif",
              fontWeight: 600,
              fontSize: 24,
              letterSpacing: "-0.01em",
            }}
          >
            현재 PER vs 역사적 구간
          </h2>
          <span
            style={{
              fontFamily: "var(--font-jetbrains), monospace",
              fontSize: 11,
              color: "var(--kf-ink-dim)",
              letterSpacing: "0.05em",
            }}
          >
            — Fisher Zones 오버레이
          </span>
        </div>

        <div
          className="mb-10 rounded-sm border px-6 pt-8 pb-6"
          style={{
            background: "var(--kf-surface)",
            borderColor: "var(--kf-border)",
          }}
        >
          {/* Legend */}
          <div
            className="mb-5 flex flex-wrap gap-5 border-b pb-4"
            style={{ borderColor: "var(--kf-border)" }}
          >
            {SERIES.map((s) => (
              <div
                key={s.key}
                className="flex items-center gap-2"
                style={{ fontSize: 13 }}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ background: s.color }}
                />
                <span>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="relative h-[380px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
              >
                {/*
                  레이어 순서: JSX 순서대로 SVG에 렌더됨(뒤에 올수록 위).
                  grid → zones(배경) → boundary lines → axes → data lines
                */}
                <CartesianGrid
                  stroke="rgba(42, 46, 58, 0.5)"
                  strokeDasharray="0"
                  vertical={false}
                />
                {/* Fisher Zones — y1 < y2 순서 유지 */}
                <ReferenceArea
                  y1={5}
                  y2={10}
                  fill="#7fb685"
                  fillOpacity={0.06}
                  ifOverflow="visible"
                />
                <ReferenceArea
                  y1={10}
                  y2={13}
                  fill="#d4a574"
                  fillOpacity={0.06}
                  ifOverflow="visible"
                />
                <ReferenceArea
                  y1={13}
                  y2={20}
                  fill="#e06c5e"
                  fillOpacity={0.07}
                  ifOverflow="visible"
                />
                {/* Zone boundaries */}
                <ReferenceLine
                  y={10}
                  stroke="rgba(138, 143, 153, 0.35)"
                  strokeDasharray="3 4"
                />
                <ReferenceLine
                  y={13}
                  stroke="rgba(138, 143, 153, 0.35)"
                  strokeDasharray="3 4"
                />
                <ReferenceLine
                  y={20}
                  stroke="rgba(138, 143, 153, 0.35)"
                  strokeDasharray="3 4"
                />
                <XAxis
                  dataKey="label"
                  stroke="#8a8f99"
                  interval={0}
                  tick={{
                    fill: "#8a8f99",
                    fontFamily: "var(--font-ibm-plex), system-ui, sans-serif",
                    fontSize: 11,
                  }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[5, 42]}
                  stroke="#8a8f99"
                  tick={{
                    fill: "#8a8f99",
                    fontFamily: "var(--font-jetbrains), monospace",
                    fontSize: 11,
                  }}
                  tickFormatter={(v) => `PER ${v}`}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ stroke: "rgba(138,143,153,0.2)" }}
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
                    activeDot={{ r: 8 }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* FISHER ZONES SECTION HEADER */}
        <div
          className="mb-5 flex items-baseline justify-between border-b pb-3"
          style={{ borderColor: "var(--kf-border)" }}
        >
          <h2
            style={{
              fontFamily: "var(--font-fraunces), serif",
              fontWeight: 600,
              fontSize: 24,
              letterSpacing: "-0.01em",
            }}
          >
            Fisher의 PER 구간론
          </h2>
          <span
            style={{
              fontFamily: "var(--font-jetbrains), monospace",
              fontSize: 11,
              color: "var(--kf-ink-dim)",
              letterSpacing: "0.05em",
            }}
          >
            — 1987년 원본 기준
          </span>
        </div>

        <div
          className="mb-10 grid grid-cols-1 gap-px overflow-hidden rounded-sm border sm:grid-cols-3"
          style={{
            borderColor: "var(--kf-border)",
            background: "var(--kf-border)",
          }}
        >
          <FisherZoneCard
            range="PER < 10"
            title="매수 최적기"
            desc="역사적으로 이 구간에서 진입했을 때 수익률이 가장 좋았다."
            rangeColor="var(--kf-success)"
          />
          <FisherZoneCard
            range="PER 10 – 13"
            title="중립 구간"
            desc="특별히 유리하지도 불리하지도 않은 평균적 구간."
            rangeColor="var(--kf-accent-dow)"
          />
          <FisherZoneCard
            range="PER 13 – 20"
            title="실망 구간"
            desc="추가 상승이 이어지기 어렵고 조정 가능성이 높은 구간."
            rangeColor="var(--kf-danger)"
          />
        </div>

        {/* INTERPRETATION */}
        <div
          className="mb-8 border py-7 px-8"
          style={{
            background: "var(--kf-surface)",
            borderColor: "var(--kf-border)",
            borderLeftColor: "var(--kf-accent-dow)",
            borderLeftWidth: 2,
          }}
        >
          <div
            className="mb-3 uppercase"
            style={{
              fontFamily: "var(--font-jetbrains), monospace",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.2em",
              color: "var(--kf-accent-dow)",
            }}
          >
            오늘의 관전 포인트
          </div>
          <p
            style={{
              fontFamily: "var(--font-fraunces), serif",
              fontSize: 18,
              lineHeight: 1.6,
              fontWeight: 400,
              color: "var(--kf-ink)",
            }}
          >
            세 지수 모두 Fisher의{" "}
            <em
              style={{ fontStyle: "italic", color: "var(--kf-accent-dow)" }}
            >
              실망 구간(13–20)
            </em>
            을 이미 돌파했습니다. 다만 피셔 본인도 2007년 추가본에서{" "}
            <em
              style={{ fontStyle: "italic", color: "var(--kf-accent-dow)" }}
            >
              “PER은 시장 예측 도구가 아니다”
            </em>
            라고 입장을 바꿨습니다. 숫자보다 중요한 건,{" "}
            <em
              style={{ fontStyle: "italic", color: "var(--kf-accent-dow)" }}
            >
              그 숫자를 대중이 어떻게 받아들이는가
            </em>
            입니다.
          </p>
        </div>

        {/* FOOTNOTE */}
        <div
          className="mt-12 border-t pt-6"
          style={{
            borderColor: "var(--kf-border)",
            fontFamily: "var(--font-jetbrains), monospace",
            fontSize: 11,
            color: "var(--kf-ink-dim)",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "var(--kf-ink)", fontWeight: 600 }}>
            면책조항.
          </strong>{" "}
          본 페이지는 교육·참고 목적이며 투자 권유가 아닙니다. PER 수치는 데이터
          제공사마다 산정 방식이 달라 차이가 있을 수 있습니다. 최신 수치는 각
          출처에서 직접 확인하시기 바랍니다.
        </div>
      </main>
    </div>
  );
}

function SnapshotCard({
  badge,
  name,
  value,
  compareLabel,
  compareValue,
  diff,
  color,
}: {
  badge: string;
  name: string;
  value: string;
  compareLabel: string;
  compareValue: string;
  diff: string;
  color: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-sm border p-6"
      style={{
        background: "var(--kf-surface)",
        borderColor: "var(--kf-border)",
      }}
    >
      <span
        className="absolute left-0 top-0 h-0.5 w-full"
        style={{ background: color }}
      />
      <div
        className="mb-2 uppercase"
        style={{
          fontFamily: "var(--font-jetbrains), monospace",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.15em",
          color,
        }}
      >
        {badge}
      </div>
      <div
        className="mb-4"
        style={{
          fontFamily: "var(--font-ibm-plex), sans-serif",
          fontSize: 13,
          color: "var(--kf-ink-dim)",
        }}
      >
        {name}
      </div>
      <div
        className="mb-1.5"
        style={{
          fontFamily: "var(--font-fraunces), serif",
          fontSize: 44,
          fontWeight: 600,
          lineHeight: 1,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: "var(--font-jetbrains), monospace",
          fontSize: 11,
          color: "var(--kf-ink-dim)",
        }}
      >
        {compareLabel}{" "}
        <span style={{ fontWeight: 600, color: "var(--kf-danger)" }}>
          {compareValue}
        </span>{" "}
        · {diff}
      </div>
    </div>
  );
}

function FisherZoneCard({
  range,
  title,
  desc,
  rangeColor,
}: {
  range: string;
  title: string;
  desc: string;
  rangeColor: string;
}) {
  return (
    <div className="p-5" style={{ background: "var(--kf-surface)" }}>
      <div
        className="mb-1.5"
        style={{
          fontFamily: "var(--font-jetbrains), monospace",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.1em",
          color: rangeColor,
        }}
      >
        {range}
      </div>
      <div
        className="mb-2"
        style={{
          fontFamily: "var(--font-fraunces), serif",
          fontSize: 18,
          fontWeight: 600,
        }}
      >
        {title}
      </div>
      <div
        style={{ fontSize: 13, color: "var(--kf-ink-dim)", lineHeight: 1.5 }}
      >
        {desc}
      </div>
    </div>
  );
}
