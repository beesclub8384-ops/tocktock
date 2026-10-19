"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { SiteSourceNotice } from "@/components/site-source-notice";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

/* ── 타입 ── */

interface BacktestPoint {
  date: string;
  score: number;
  /** API 가 주는 국면 (국면 정확도의 우연 검정에 쓴다, 미션 10) */
  regime: RegimeType;
  qqq1m: number | null;
  qqq2m: number | null;
  qqq3m: number | null;
  qqq4m: number | null;
  qqq5m: number | null;
  qqq6m: number | null;
}

interface BucketStats {
  label: string;
  color: string;
  count: number;
  avg1m: number;
  avg2m: number;
  avg3m: number;
  avg4m: number;
  avg5m: number;
  avg6m: number;
}

type RegimeType = "RECOVERY" | "EXPANSION" | "SLOWDOWN" | "CONTRACTION";

interface RegimeStat {
  count: number;
  avg1m: number;
  avg2m: number;
  avg3m: number;
  avg4m: number;
  avg5m: number;
  avg6m: number;
  winRate6m: number;
}

type AccuracyObj = {
  overall: number;
  month1: number;
  month2: number;
  month3: number;
  month4: number;
  month5: number;
  month6: number;
};

/** 백테스트 구성 요소 이름 (API 의 excludedCounts 키) */
const BT_COMPONENT_NAMES: Record<string, string> = {
  nl: "연준 순유동성",
  mg: "M2 통화량 증가율",
  t10: "장단기 금리차",
  cuAu: "구리/금 비율",
  ted: "테드 스프레드",
  nf: "NFCI",
};

interface BacktestData {
  points: BacktestPoint[];
  buckets: BucketStats[];
  accuracy: AccuracyObj;
  regimeStats: Record<RegimeType, RegimeStat>;
  regimeAccuracy: AccuracyObj;
  periodStart: string;
  periodEnd: string;
  totalMonths: number;
  /** 낡은 입력 규칙 (미션 9) */
  monthsWithExcluded?: number;
  excludedCounts?: Record<string, number>;
  /** FRED 로 받는 시리즈와 출처 표기 (미션 8) */
  fredSeries?: string[];
  fredCitations?: string[];
  fetchedAt: string;
}

/* ── 포맷 ── */

function formatKST(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function formatYM(ym: string) {
  const [y, m] = ym.split("-");
  return `${y}.${m}`;
}

/* ── 컴포넌트 ── */

/* ── 우연과 구분되는지 (미션 10, 독립 검증 지적 1로 고침) ──
 * 기간(1~6개월)마다 "점수가 높은 달(또는 상승 국면)"과 "낮은 달(하락 국면)"의 QQQ 상승 비율이 다른지를 Fisher 정확검정
 * (양쪽)으로 본다. 맞힌 비율을 50% 와 비교하면 안 된다 — QQQ 가 대부분 올라서(6개월 뒤 약 83%) 예측력이 없어도 50% 와
 * 달라 보일 수 있기 때문. 매달 1~6개월 뒤 수익률을 써서 기간이 겹치므로 실제 독립 표본은 더 적다(p-값도 낙관적인 쪽). */
function logFact(m: number): number {
  let x = 0;
  for (let i = 2; i <= m; i++) x += Math.log(i);
  return x;
}

/** 2×2 표 [a b; c d] 의 양쪽 Fisher 정확검정 p-값 */
function fisherTwoSided(a: number, b: number, c: number, d: number): number {
  const r1 = a + b;
  const c1 = a + c;
  const n = a + b + c + d;
  const hyp = (x: number) =>
    Math.exp(logFact(c1) - logFact(x) - logFact(c1 - x) + logFact(n - c1) - logFact(r1 - x) - logFact(n - c1 - r1 + x) - (logFact(n) - logFact(r1) - logFact(n - r1)));
  const p0 = hyp(a);
  let p = 0;
  for (let x = Math.max(0, r1 - (n - c1)); x <= Math.min(r1, c1); x++) if (hyp(x) <= p0 * (1 + 1e-9)) p += hyp(x);
  return Math.min(1, p);
}

function chanceSummary(points: BacktestPoint[], isHigh: (p: BacktestPoint) => boolean) {
  const keys = ["qqq1m", "qqq2m", "qqq3m", "qqq4m", "qqq5m", "qqq6m"] as const;
  const rows = keys.map((k) => {
    const valid = points.filter((p) => p[k] != null);
    const hi = valid.filter(isHigh);
    const lo = valid.filter((p) => !isHigh(p));
    const hiUp = hi.filter((p) => p[k]! > 0).length;
    const loUp = lo.filter((p) => p[k]! > 0).length;
    return { n: valid.length, p: fisherTwoSided(hiUp, hi.length - hiUp, loUp, lo.length - loUp) };
  });
  return {
    nMin: Math.min(...rows.map((r) => r.n)),
    nMax: Math.max(...rows.map((r) => r.n)),
    pMin: Math.min(...rows.map((r) => r.p)),
  };
}

/** "이상"이라고 쓰므로 내림 (0.2276 → 0.22) */
const floor2 = (v: number) => (Math.floor(v * 100) / 100).toFixed(2);

function ChanceNote({ points, isHigh, groups }: { points: BacktestPoint[]; isHigh: (p: BacktestPoint) => boolean; groups: string }) {
  const c = chanceSummary(points, isHigh);
  return c.pMin >= 0.05 ? (
    <>
      {groups}의 1~6개월 뒤 QQQ 상승 비율 차이를 정확검정(Fisher)으로 보면, 우연으로도 나올 수 있는 수준입니다(기간별 표본{" "}
      {c.nMin}~{c.nMax}개월, p-값 {floor2(c.pMin)} 이상 — p-값이 0.05보다 크면 보통 우연과 구분되지 않는다고 봅니다).
    </>
  ) : (
    <>
      {groups}의 1~6개월 뒤 QQQ 상승 비율 차이를 정확검정(Fisher)으로 보면 일부 기간은 우연으로 보기 어렵습니다(가장 작은
      p-값 {c.pMin.toFixed(3)}, 표본 {c.nMin}~{c.nMax}개월). 다만 기간이 겹쳐 실제 독립 표본은 더 적습니다.
    </>
  );
}

function AccuracyCard({ accuracy, points }: { accuracy: AccuracyObj; points: BacktestPoint[] }) {
  const getColor = (v: number) =>
    v >= 60 ? "#16a34a" : v >= 50 ? "#ca8a04" : "#dc2626";

  const months = [
    { label: "1개월", value: accuracy.month1 },
    { label: "2개월", value: accuracy.month2 },
    { label: "3개월", value: accuracy.month3 },
    { label: "4개월", value: accuracy.month4 },
    { label: "5개월", value: accuracy.month5 },
    { label: "6개월", value: accuracy.month6 },
  ];

  return (
    <div className="rounded-xl border bg-card p-6 sm:p-8">
      <p className="text-sm text-muted-foreground mb-2">방향 일치율 (참고용)</p>
      <div className="flex items-baseline gap-3 mb-6">
        <span
          className="text-5xl font-bold tabular-nums"
          style={{ color: getColor(accuracy.overall) }}
        >
          {accuracy.overall}%
        </span>
        <span className="text-sm text-muted-foreground">전체 평균</span>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {months.map((item) => (
          <div
            key={item.label}
            className="rounded-lg bg-muted/50 p-3 text-center"
          >
            <p className="text-xs text-muted-foreground mb-1">
              {item.label}
            </p>
            <p
              className="text-lg font-bold tabular-nums"
              style={{ color: getColor(item.value) }}
            >
              {item.value}%
            </p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        점수 50점 이상일 때 QQQ 상승 + 점수 50점 미만일 때 QQQ 하락 비율의
        평균
      </p>
      {/* 미션 10: 예전 문구 "방향 일치율은 52% 수준으로 통계적 의미가 낮습니다. 이 지표의 핵심은 아래 구간별 수익률 차이입니다."는
          숫자(실제 54.7%)가 틀렸고, 구간별 차이도 검정에서 우연과 구분되지 않아 고쳤다 (결정 로그 22-4) */}
      <p className="mt-2 text-xs text-amber-400/80">
        <ChanceNote points={points} isHigh={(p) => p.score >= 50} groups="점수 50 이상인 달과 미만인 달" /> 아래
        구간별 수익률 차이도 구간마다 표본이 적어 우연과 구분하기 어렵습니다.
      </p>
    </div>
  );
}

function BucketTable({ buckets }: { buckets: BucketStats[] }) {
  const fmtReturn = (v: number) => (
    <span style={{ color: v >= 0 ? "#16a34a" : "#dc2626" }}>
      {v >= 0 ? "+" : ""}
      {v}%
    </span>
  );

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b">
        <p className="font-semibold">유동성 구간별 나스닥 평균 수익률</p>
      </div>
      {/* contain:inline-size — 표의 최소 폭이 페이지 전체를 넓히지 않고 이 영역 안에서만 가로로 스크롤되게 (미션 9, 모바일 390px) */}
      <div className="overflow-x-auto [contain:inline-size]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="px-4 py-3 text-left font-medium">
                유동성 구간
              </th>
              <th className="px-4 py-3 text-center font-medium">월 수</th>
              <th className="px-4 py-3 text-right font-medium">1개월</th>
              <th className="px-4 py-3 text-right font-medium">2개월</th>
              <th className="px-4 py-3 text-right font-medium">3개월</th>
              <th className="px-4 py-3 text-right font-medium">4개월</th>
              <th className="px-4 py-3 text-right font-medium">5개월</th>
              <th className="px-4 py-3 text-right font-bold bg-blue-500/10">6개월</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.label} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: b.color }}
                    />
                    {b.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-center tabular-nums">
                  {b.count}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {fmtReturn(b.avg1m)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {fmtReturn(b.avg2m)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {fmtReturn(b.avg3m)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {fmtReturn(b.avg4m)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {fmtReturn(b.avg5m)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-bold bg-blue-500/10">
                  {fmtReturn(b.avg6m)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const REGIME_META: { type: RegimeType; label: string; color: string }[] = [
  { type: "RECOVERY", label: "바닥 탈출", color: "#3b82f6" },
  { type: "EXPANSION", label: "상승 지속", color: "#16a34a" },
  { type: "SLOWDOWN", label: "고점 경고", color: "#ea580c" },
  { type: "CONTRACTION", label: "하락 지속", color: "#dc2626" },
];

function RegimeTable({
  regimeStats,
  regimeAccuracy,
  points,
}: {
  regimeStats: Record<RegimeType, RegimeStat>;
  regimeAccuracy: AccuracyObj;
  points: BacktestPoint[];
}) {
  const fmtReturn = (v: number) => (
    <span style={{ color: v >= 0 ? "#16a34a" : "#dc2626" }}>
      {v >= 0 ? "+" : ""}
      {v}%
    </span>
  );

  const getColor = (v: number) =>
    v >= 60 ? "#16a34a" : v >= 50 ? "#ca8a04" : "#dc2626";

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b">
        <p className="font-semibold">국면별 나스닥 평균 수익률</p>
      </div>
      {/* contain:inline-size — 표의 최소 폭이 페이지 전체를 넓히지 않고 이 영역 안에서만 가로로 스크롤되게 (미션 9, 모바일 390px) */}
      <div className="overflow-x-auto [contain:inline-size]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="px-4 py-3 text-left font-medium">국면</th>
              <th className="px-4 py-3 text-center font-medium">월 수</th>
              <th className="px-4 py-3 text-right font-medium">1개월</th>
              <th className="px-4 py-3 text-right font-medium">2개월</th>
              <th className="px-4 py-3 text-right font-medium">3개월</th>
              <th className="px-4 py-3 text-right font-medium">4개월</th>
              <th className="px-4 py-3 text-right font-medium">5개월</th>
              <th className="px-4 py-3 text-right font-medium">6개월</th>
              <th className="px-4 py-3 text-right font-medium">6개월 승률</th>
            </tr>
          </thead>
          <tbody>
            {REGIME_META.map(({ type, label, color }) => {
              const s = regimeStats[type];
              if (!s) return null;
              return (
                <tr key={type} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      {label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums">
                    {s.count}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmtReturn(s.avg1m)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmtReturn(s.avg2m)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmtReturn(s.avg3m)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmtReturn(s.avg4m)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmtReturn(s.avg5m)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmtReturn(s.avg6m)}
                  </td>
                  <td
                    className="px-4 py-3 text-right tabular-nums font-semibold"
                    style={{ color: getColor(s.winRate6m) }}
                  >
                    {s.winRate6m}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-6 py-3 border-t bg-muted/30">
        <p className="text-xs text-muted-foreground">
          국면 예측 정확도: 전체{" "}
          <span
            className="font-semibold"
            style={{ color: getColor(regimeAccuracy.overall) }}
          >
            {regimeAccuracy.overall}%
          </span>{" "}
          (4개월 {regimeAccuracy.month4}% · 5개월{" "}
          {regimeAccuracy.month5}% · 6개월 {regimeAccuracy.month6}%)
        </p>
        <p className="mt-1 text-xs text-amber-400/80">
          <ChanceNote
            points={points}
            isHigh={(p) => p.regime === "RECOVERY" || p.regime === "EXPANSION"}
            groups="상승 국면(바닥 탈출·상승 지속)과 하락 국면(고점 경고·하락 지속)"
          />
        </p>
      </div>
    </div>
  );
}

function BacktestChart({ points }: { points: BacktestPoint[] }) {
  const chartData = points.map((p) => ({
    date: formatYM(p.date),
    score: p.score,
    qqq6m: p.qqq6m,
  }));

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-6">
      <p className="font-semibold mb-4">
        유동성 점수 vs QQQ 6개월 수익률
      </p>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.08)"
          />
          <XAxis
            dataKey="date"
            stroke="#666"
            tick={{ fill: "#888", fontSize: 11 }}
            interval={11}
          />
          <YAxis
            yAxisId="left"
            domain={[0, 100]}
            stroke="#666"
            tick={{ fill: "#888", fontSize: 11 }}
            label={{
              value: "점수",
              angle: -90,
              position: "insideLeft",
              fill: "#888",
              fontSize: 12,
            }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="#666"
            tick={{ fill: "#888", fontSize: 11 }}
            label={{
              value: "수익률 (%)",
              angle: 90,
              position: "insideRight",
              fill: "#888",
              fontSize: 12,
            }}
          />
          <ReferenceLine
            yAxisId="left"
            y={50}
            stroke="rgba(255,255,255,0.2)"
            strokeDasharray="5 5"
          />
          <ReferenceLine
            yAxisId="right"
            y={0}
            stroke="rgba(255,255,255,0.2)"
            strokeDasharray="5 5"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1f2937",
              border: "1px solid #374151",
              borderRadius: 8,
              fontSize: 13,
            }}
            labelStyle={{ color: "#9ca3af" }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="score"
            name="유동성 점수"
            stroke="#3b82f6"
            dot={false}
            strokeWidth={2}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="qqq6m"
            name="QQQ 6개월 수익률"
            stroke="#f59e0b"
            dot={false}
            strokeWidth={1.5}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── 메인 페이지 ── */

export default function BacktestPage() {
  const [data, setData] = useState<BacktestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/liquidity/us/backtest")
      .then((r) => {
        if (!r.ok) throw new Error("API 오류");
        return r.json();
      })
      .then((d: BacktestData) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="max-w-5xl mx-auto px-4 py-12 sm:px-8 sm:py-20">
      <header className="mb-10">
        <Link
          href="/liquidity/us"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← 미국 유동성 지표
        </Link>
        <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">
          미국 유동성 지표 백테스트
        </h1>
        <p className="mt-2 text-muted-foreground">
          {/* 미션 10: 예전 "(2015~2025)"는 실제 분석 기간(아래 줄, API 값)과 달라 고쳤다 */}
          유동성 점수 구간별 나스닥 실제 수익률 검증 (최근 10년)
        </p>
        {data && (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              분석 기간: {formatYM(data.periodStart)} ~{" "}
              {formatYM(data.periodEnd)} (총 {data.totalMonths}개월)
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              마지막 업데이트: {formatKST(data.fetchedAt)}
            </p>
            {/* 낡은 입력 안내 (미션 9) — 각 달 말일 시점에서 낡은 구성 요소는 그 달 점수에서 뺐습니다 */}
            {data.monthsWithExcluded != null && data.monthsWithExcluded > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                각 달 말일 시점에서 마지막 관측일이 갱신 주기의 3배보다 오래된 지표는 그 달 점수에서 빼고 남은 지표로
                계산했습니다(6개 중 일부를 뺀 달 {data.monthsWithExcluded}개월:{" "}
                {Object.entries(data.excludedCounts ?? {})
                  .map(([k, n]) => `${BT_COMPONENT_NAMES[k] ?? k} ${n}개월`)
                  .join(", ")}
                ).
              </p>
            )}
          </>
        )}
      </header>

      {/* 로딩 */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          백테스트 데이터를 계산하는 중... (최초 로딩 시 시간이 걸릴 수
          있습니다)
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
        <div className="flex flex-col gap-6">
          <AccuracyCard accuracy={data.accuracy} points={data.points} />
          <BucketTable buckets={data.buckets} />
          <RegimeTable
            regimeStats={data.regimeStats}
            regimeAccuracy={data.regimeAccuracy}
            points={data.points}
          />
          <BacktestChart points={data.points} />

          {/* 한계 안내 */}
          <section className="rounded-xl border-l-4 border-amber-500 bg-amber-500/10 px-5 py-4">
            <p className="text-sm font-semibold text-amber-400 mb-2">
              이 백테스트의 한계
            </p>
            <ul className="text-sm text-muted-foreground space-y-1.5 list-disc list-inside">
              <li>과거 성과는 미래 수익을 보장하지 않습니다.</li>
              <li>
                유동성 지표 외에도 시장에 영향을 미치는 요인은 다양합니다.
              </li>
              <li>
                매달의 1~6개월 뒤 수익률을 쓰므로 기간이 겹칩니다. 실제로 서로 독립인 표본은 개월 수보다 적습니다.
              </li>
              <li>본 분석은 참고용이며, 투자 조언이 아닙니다.</li>
            </ul>
          </section>

          <p className="mt-6 text-xs text-muted-foreground text-center">
            본 페이지의 모든 지표와 분석은 참고용이며, 투자 권유가 아닙니다.
          </p>

          {/* 출처 표기 — 원출처로 받는 시리즈와 아직 FRED 로 받는 시리즈(NFCI·TED 스프레드) (미션 8) */}
          <SiteSourceNotice
            className="mt-4"
            origin={
              data.fredSeries?.includes("WALCL")
                ? undefined
                : "연준 이사회 H.4.1(대차대조표·재무부 계좌)·H.6(M2)·H.15(장단기 금리차는 10년물−2년물로 계산), 뉴욕 연방준비은행(역레포), 구리·금·QQQ 가격은 Yahoo Finance"
            }
            nyFed={!data.fredSeries?.includes("RRPONTSYD")}
            fredCitations={data.fredCitations ?? []}
          />
        </div>
      )}
    </main>
  );
}
