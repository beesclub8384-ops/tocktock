"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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

interface BacktestData {
  points: BacktestPoint[];
  buckets: BucketStats[];
  accuracy: AccuracyObj;
  regimeStats: Record<RegimeType, RegimeStat>;
  regimeAccuracy: AccuracyObj;
  periodStart: string;
  periodEnd: string;
  totalMonths: number;
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

function AccuracyCard({ accuracy }: { accuracy: AccuracyObj }) {
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
      <p className="text-sm text-muted-foreground mb-2">예측 정확도</p>
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
        <p className="font-semibold">유동성 구간별 QQQ 평균 수익률</p>
      </div>
      <div className="overflow-x-auto">
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
              <th className="px-4 py-3 text-right font-medium">6개월</th>
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
                <td className="px-4 py-3 text-right tabular-nums">
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
}: {
  regimeStats: Record<RegimeType, RegimeStat>;
  regimeAccuracy: AccuracyObj;
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
        <p className="font-semibold">국면별 QQQ 평균 수익률</p>
      </div>
      <div className="overflow-x-auto">
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
          나스닥 4~6개월 선행 지표 백테스트
        </h1>
        <p className="mt-2 text-muted-foreground">
          과거 10년간 유동성 점수와 나스닥(QQQ) 실제 수익률 검증
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
          <AccuracyCard accuracy={data.accuracy} />
          <BucketTable buckets={data.buckets} />
          <RegimeTable
            regimeStats={data.regimeStats}
            regimeAccuracy={data.regimeAccuracy}
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
              <li>본 분석은 참고용이며, 투자 조언이 아닙니다.</li>
            </ul>
          </section>

          <p className="mt-6 text-xs text-muted-foreground text-center">
            본 페이지의 모든 지표와 분석은 참고용이며, 투자 권유가 아닙니다.
          </p>
        </div>
      )}
    </main>
  );
}
