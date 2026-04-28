"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { HelpCircle, X } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { useDraggable } from "@/hooks/useDraggable";
import { useResizable } from "@/hooks/useResizable";
import type {
  CumulativeTotals,
  DailyTrend,
  InvestorFlowApiResponse,
  NormalizedTrend,
  ProviderCapabilities,
} from "@/lib/types/investor-flow";

/* ──────────────────────────────────────────────────────────
 *  포맷 유틸
 * ────────────────────────────────────────────────────────── */

function formatShares(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v < 0 ? "-" : v > 0 ? "+" : "";
  const abs = Math.abs(v);
  return `${sign}${abs.toLocaleString("ko-KR")}주`;
}

function formatValueKRW(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v < 0 ? "-" : v > 0 ? "+" : "";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}조원`;
  if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(0)}억원`;
  if (abs >= 1e4) return `${sign}${(abs / 1e4).toFixed(0)}만원`;
  return `${sign}${Math.round(abs).toLocaleString("ko-KR")}원`;
}

function formatPriceKRW(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${Math.round(v).toLocaleString("ko-KR")}원`;
}

function ymdToday(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function ymdNDaysAgo(n: number): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  kst.setUTCDate(kst.getUTCDate() - n);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* ──────────────────────────────────────────────────────────
 *  보는 법 모달
 * ────────────────────────────────────────────────────────── */

function GuideModal({ onClose }: { onClose: () => void }) {
  const { position, handleMouseDown } = useDraggable();
  const { size, handleResizeMouseDown } = useResizable();

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
      <div
        data-draggable-modal
        className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
          ...(size.width
            ? { width: size.width, height: size.height }
            : { width: "100%", maxWidth: "44rem" }),
        }}
      >
        <div
          className="overflow-y-auto p-6 sm:p-8"
          style={{ maxHeight: size.height ? size.height - 2 : "85vh" }}
        >
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-10 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="닫기"
          >
            <X size={20} />
          </button>

          <h2
            className="mb-6 text-xl font-bold cursor-move select-none"
            onMouseDown={handleMouseDown}
          >
            투자자 동향 추적, 이렇게 읽으세요
          </h2>

          <section className="mb-6">
            <h3 className="mb-2 text-base font-semibold">이 도구가 뭐예요?</h3>
            <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
              <li>
                종목 코드와 시작일을 넣으면, 그 시점부터 어제까지 누가 얼마나 사고 팔았는지를
                보여줘요.
              </li>
              <li>
                <strong className="text-foreground">외국인·기관·개인</strong> 세 주체의 일별 매매와
                누적 합계를 한눈에 볼 수 있어요.
              </li>
              <li className="text-amber-700">
                ⚠️ 이 도구는 <strong>참고용</strong>이에요. 매수/매도 결정의 근거로만 삼지
                마세요.
              </li>
            </ul>
          </section>

          <hr className="my-5 border-border" />

          <section className="mb-6">
            <h3 className="mb-2 text-base font-semibold">왜 보면 좋아요?</h3>
            <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
              <li>
                개인은 뉴스에 반응해서 사고 팔지만, 외국인·기관은 실적·환율·글로벌 흐름을 보고
                움직여요.
              </li>
              <li>
                그래서 <strong className="text-foreground">외국인이 꾸준히 사고 있다</strong>면 &ldquo;
                똑똑한 돈이 들어온다&rdquo;는 신호일 수 있어요.
              </li>
              <li>
                반대로 <strong className="text-foreground">개인은 사는데 외국인·기관이 판다</strong>
                면 주의해야 할 신호일 수 있어요.
              </li>
            </ul>
          </section>

          <hr className="my-5 border-border" />

          <section className="mb-6">
            <h3 className="mb-2 text-base font-semibold">핵심 용어</h3>
            <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <strong className="text-foreground">순매수</strong> — 그날 산 양에서 판 양을 뺀 값.
                양수면 매수가 많았다는 뜻, 음수면 매도가 많았다는 뜻.
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <strong className="text-foreground">누적 순매수</strong> — 입력한 시작일부터 어제까지
                순매수를 다 더한 값. 큰 흐름을 볼 때 가장 중요해요.
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <strong className="text-foreground">기관</strong> — 연기금, 보험사, 자산운용사 등
                국내 기관투자자.
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <strong className="text-foreground">외국인</strong> — 글로벌 펀드, 해외 연기금 등.
                보통 가장 정보력이 좋다고 평가돼요.
              </div>
            </div>
          </section>

          <hr className="my-5 border-border" />

          <section className="mb-6">
            <h3 className="mb-2 text-base font-semibold">데이터 한계 (꼭 읽어주세요)</h3>
            <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
              <li>
                <strong className="text-foreground">최근 30거래일</strong>: 한국투자증권(KIS)
                API로 외국인·기관·개인 + 거래대금까지 모두 표시.
              </li>
              <li>
                <strong className="text-foreground">30거래일 이전 (추적 종목)</strong>: 매일
                새벽 자동으로 누적 저장한 데이터로 외국인·기관·개인·거래대금 모두 표시.
              </li>
              <li>
                <strong className="text-foreground">30거래일 이전 (비추적 종목)</strong>: 네이버
                금융 데이터로 외국인·기관 매매 수량만 표시. 개인·거래대금은 표시되지 않아요.
              </li>
              <li>
                일별 표의 &ldquo;출처&rdquo; 컬럼으로 어느 소스에서 왔는지 확인할 수 있어요
                (KIS / 누적 / 네이버).
              </li>
              <li className="text-emerald-700">
                ✅ 시간이 지날수록 누적 데이터가 쌓여 1년치, 3년치 풀데이터가 자동으로 만들어져요.
              </li>
            </ul>
          </section>

          <hr className="my-5 border-border" />

          <section className="mb-6">
            <h3 className="mb-2 text-base font-semibold">자동 추적 시스템이란?</h3>
            <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
              <li>
                세력이 갖고 놀기 좋은 중소형주 약 800개를 자동 선정 (시총 1,000억~1조,
                일평균 거래대금 10억 이상, 30일 변동성 5% 이상, 보통주만).
              </li>
              <li>
                매일 새벽 6:30 KIS 데이터를 받아 Redis에 영구 저장. 종목 리스트는 매주
                일요일 새벽에 자동 갱신.
              </li>
              <li>
                추적 대상이면 검색 결과 위쪽에 <strong className="text-emerald-700">&ldquo;
                자동 추적 중&rdquo;</strong> 배지가 뜨고, 시간이 갈수록 30일+ 과거에서도 4주체
                풀데이터가 표시돼요.
              </li>
            </ul>
          </section>

          <hr className="my-5 border-border" />

          <section className="mb-6">
            <h3 className="mb-2 text-base font-semibold">세력 매집 신호 — 이렇게 읽으세요</h3>
            <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="mb-1">
                  <strong className="text-foreground">상황 1.</strong> 외국인 누적 순매수가 꾸준히
                  + 방향
                </p>
                <p>→ 글로벌 자금이 이 종목을 사들이고 있다는 신호.</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="mb-1">
                  <strong className="text-foreground">상황 2.</strong> 개인은 매수, 외국인·기관은
                  매도
                </p>
                <p>→ 개미가 떠받치는 구조. 모멘텀이 약해질 수 있어요.</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="mb-1">
                  <strong className="text-foreground">상황 3.</strong> 개인은 매도, 외국인·기관이
                  꾸준히 매수
                </p>
                <p>→ &ldquo;매집&rdquo;으로 해석되는 패턴. 기관이 싸게 거두는 단계일 수 있어요.</p>
              </div>
            </div>
          </section>

          <hr className="my-5 border-border" />

          <section className="mb-6">
            <h3 className="mb-2 text-base font-semibold">⛔ 절대 하지 말아야 할 것</h3>
            <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
              <li>❌ 며칠치만 보고 결론 내리기 (최소 1~3개월 흐름)</li>
              <li>❌ 외국인 매수 = 무조건 오른다고 단정</li>
              <li>❌ 한 종목만 보고 시장 전체 신호로 확장</li>
              <li>❌ 거래량 적은 종목의 매매 동향을 신뢰하기 (변동성 큼)</li>
            </ul>
          </section>
        </div>
        <div
          onMouseDown={handleResizeMouseDown}
          className="absolute bottom-0 right-0 cursor-se-resize px-2 py-1 text-xs text-muted-foreground hover:text-foreground select-none"
        >
          ↔ 크기조절
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
 *  결과 카드들
 * ────────────────────────────────────────────────────────── */

function CumulativeCard({
  label,
  totals,
  available,
  partialNote,
}: {
  label: string;
  totals: CumulativeTotals | null;
  available: boolean;
  partialNote?: string;
}) {
  if (!available || !totals) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4">
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
        <div className="text-sm text-muted-foreground">현재 데이터 소스에서 미제공</div>
      </div>
    );
  }
  const sharesPositive = (totals.shares ?? 0) >= 0;
  const valuePositive = (totals.value ?? 0) >= 0;
  return (
    <div
      className={`rounded-xl border p-4 ${
        sharesPositive
          ? "border-emerald-200 bg-emerald-50"
          : "border-rose-200 bg-rose-50"
      }`}
    >
      <div className="text-xs text-muted-foreground mb-1">{label} 누적 순매수</div>
      <div
        className={`text-2xl font-bold tabular-nums ${
          sharesPositive ? "text-emerald-700" : "text-rose-700"
        }`}
      >
        {formatShares(totals.shares)}
      </div>
      {totals.value != null && (
        <div
          className={`text-sm mt-1 tabular-nums ${
            valuePositive ? "text-emerald-700" : "text-rose-700"
          }`}
        >
          {formatValueKRW(totals.value)}
        </div>
      )}
      {partialNote && <div className="text-xs text-muted-foreground mt-2">{partialNote}</div>}
    </div>
  );
}

/* 누적 추이 차트 */
function CumulativeChart({
  daily,
  capabilities,
}: {
  daily: DailyTrend[];
  capabilities: ProviderCapabilities;
}) {
  const data = useMemo(() => {
    const result: {
      date: string;
      foreign: number;
      institution: number;
      individual: number | null;
    }[] = [];
    let foreign = 0;
    let institution = 0;
    let individual = 0;
    for (const d of daily) {
      foreign += d.foreign.shares ?? 0;
      institution += d.institution.shares ?? 0;
      const ind = d.individual?.shares;
      const individualHere = ind != null;
      if (individualHere) individual += ind;
      result.push({
        date: d.date,
        foreign,
        institution,
        individual: individualHere ? individual : null,
      });
    }
    return result;
  }, [daily]);

  if (data.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold mb-3">누적 순매수 추이 (단위: 주)</h3>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,120,120,0.2)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(5)}
            minTickGap={32}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => {
              const abs = Math.abs(v);
              if (abs >= 1e8) return `${(v / 1e8).toFixed(1)}억`;
              if (abs >= 1e4) return `${(v / 1e4).toFixed(0)}만`;
              return v.toLocaleString("ko-KR");
            }}
          />
          <Tooltip
            formatter={(value) => {
              const v = Number(value);
              if (!Number.isFinite(v)) return ["—"];
              return [`${v >= 0 ? "+" : ""}${v.toLocaleString("ko-KR")}주`];
            }}
            contentStyle={{ fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine y={0} stroke="rgba(120,120,120,0.4)" />
          <Line
            type="monotone"
            dataKey="foreign"
            name="외국인"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="institution"
            name="기관"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
          />
          {capabilities.hasIndividual && (
            <Line
              type="monotone"
              dataKey="individual"
              name="개인 (KIS 구간)"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* 일별 표 */
function DailyTable({
  daily,
  capabilities,
}: {
  daily: DailyTrend[];
  capabilities: ProviderCapabilities;
}) {
  if (daily.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        해당 기간에 거래일이 없습니다.
      </div>
    );
  }

  const reversed = [...daily].reverse(); // 최신이 위

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">날짜</th>
              <th className="px-3 py-2 text-right font-semibold">종가</th>
              <th className="px-3 py-2 text-right font-semibold">외국인</th>
              <th className="px-3 py-2 text-right font-semibold">기관</th>
              {capabilities.hasIndividual && (
                <th className="px-3 py-2 text-right font-semibold">개인</th>
              )}
              <th className="px-3 py-2 text-center font-semibold">출처</th>
            </tr>
          </thead>
          <tbody>
            {reversed.map((row) => (
              <tr key={row.date} className="border-t border-border">
                <td className="px-3 py-1.5 text-left font-medium">{row.date}</td>
                <td className="px-3 py-1.5 text-right">{formatPriceKRW(row.close)}</td>
                <td
                  className={`px-3 py-1.5 text-right ${
                    (row.foreign.shares ?? 0) > 0
                      ? "text-emerald-700"
                      : (row.foreign.shares ?? 0) < 0
                        ? "text-rose-700"
                        : ""
                  }`}
                >
                  {formatShares(row.foreign.shares)}
                </td>
                <td
                  className={`px-3 py-1.5 text-right ${
                    (row.institution.shares ?? 0) > 0
                      ? "text-emerald-700"
                      : (row.institution.shares ?? 0) < 0
                        ? "text-rose-700"
                        : ""
                  }`}
                >
                  {formatShares(row.institution.shares)}
                </td>
                {capabilities.hasIndividual && (
                  <td
                    className={`px-3 py-1.5 text-right ${
                      (row.individual?.shares ?? 0) > 0
                        ? "text-emerald-700"
                        : (row.individual?.shares ?? 0) < 0
                          ? "text-rose-700"
                          : "text-muted-foreground"
                    }`}
                  >
                    {row.individual?.shares != null
                      ? formatShares(row.individual.shares)
                      : "—"}
                  </td>
                )}
                <td className="px-3 py-1.5 text-center text-xs">
                  {row.source === "kis" ? (
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700">KIS</span>
                  ) : row.source === "archive" ? (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700">
                      누적
                    </span>
                  ) : row.source === "naver" ? (
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-700">네이버</span>
                  ) : (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700">
                      KRX
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
 *  메인 페이지
 * ────────────────────────────────────────────────────────── */

const DEFAULT_START = ymdNDaysAgo(60);
const TODAY = ymdToday();

export default function InvestorFlowPage() {
  const [symbol, setSymbol] = useState("005930");
  const [startDate, setStartDate] = useState(DEFAULT_START);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trend, setTrend] = useState<NormalizedTrend | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const runQuery = useCallback(async (sym: string, start: string) => {
    if (!/^\d{6}$/.test(sym)) {
      setError("종목 코드는 6자리 숫자여야 합니다");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/investor-flow?symbol=${encodeURIComponent(sym)}&start=${encodeURIComponent(start)}`
      );
      const j = (await res.json()) as InvestorFlowApiResponse;
      if (!res.ok || !j.data) {
        setError(j.error ?? `요청 실패 (HTTP ${res.status})`);
        setTrend(null);
        return;
      }
      setTrend(j.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "예상치 못한 오류");
      setTrend(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runQuery(symbol.trim(), startDate);
  };

  const cumulative = trend?.cumulative;
  const capabilities = trend?.capabilities;

  // 개인 데이터: 시작일이 30거래일 이내일 때만 의미 있음 — UI에서 안내
  const individualPartialNote = useMemo(() => {
    if (!trend || !capabilities?.hasIndividual) return undefined;
    const hasIndividualRow = trend.daily.some((d) => d.individual != null);
    if (!hasIndividualRow) return "이 기간에는 개인 데이터가 없어요";
    const totalDays = trend.daily.length;
    const indDays = trend.daily.filter((d) => d.individual != null).length;
    if (indDays < totalDays) {
      return `최근 ${indDays}거래일만 합산 (KIS는 약 30거래일까지만 제공)`;
    }
    return undefined;
  }, [trend, capabilities]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">투자자 동향 추적</h1>
          <p className="text-muted-foreground text-sm">
            종목 코드와 시작일을 넣으면 외국인·기관·개인의 일별 매매와 누적 합계를 보여줍니다
            <span className="ml-2 inline-block">
              <button
                onClick={() => setShowGuide(true)}
                className="guide-btn inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-all"
              >
                <HelpCircle size={13} />
                투자자 동향 보는 법
              </button>
            </span>
          </p>
        </header>

        {/* 입력 영역 */}
        <form
          onSubmit={handleSubmit}
          className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="symbol" className="text-xs text-muted-foreground">
              종목 코드 (6자리)
            </label>
            <input
              id="symbol"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
              placeholder="005930"
              className="w-32 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="start" className="text-xs text-muted-foreground">
              시작일
            </label>
            <input
              id="start"
              type="date"
              value={startDate}
              max={TODAY}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "조회 중..." : "분석"}
          </button>
        </form>

        {error && (
          <div className="mb-6 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        {trend && capabilities && cumulative && (
          <>
            {/* 종목 정보 */}
            <div className="mb-4 flex flex-wrap items-baseline gap-3">
              <h2 className="text-2xl font-bold">
                {trend.name ?? trend.symbol}{" "}
                <span className="text-base font-normal text-muted-foreground">
                  ({trend.symbol})
                </span>
              </h2>
              <span className="text-sm text-muted-foreground">
                {trend.startDate} ~ {trend.endDate} · {trend.daily.length}거래일
              </span>
              {trend.tracking && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    trend.tracking.isTracked
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-zinc-100 text-zinc-600 border border-zinc-200"
                  }`}
                  title={
                    trend.tracking.isTracked
                      ? "추적 대상 — 매일 새벽 KIS 데이터를 누적 저장 중"
                      : "추적 대상 아님 — 30일+ 과거는 네이버 데이터로 표시"
                  }
                >
                  {trend.tracking.isTracked ? (
                    trend.tracking.daysTracked > 0 ? (
                      <>
                        ● 자동 추적 중 ·{" "}
                        <span className="tabular-nums">
                          {trend.tracking.daysTracked}거래일 누적
                        </span>
                      </>
                    ) : (
                      <>● 자동 추적 중 (누적 시작 전)</>
                    )
                  ) : (
                    "○ 추적 대상 아님"
                  )}
                </span>
              )}
            </div>

            {/* 누적 카드 */}
            <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <CumulativeCard label="외국인" totals={cumulative.foreign} available={true} />
              <CumulativeCard label="기관" totals={cumulative.institution} available={true} />
              <CumulativeCard
                label="개인"
                totals={cumulative.individual}
                available={capabilities.hasIndividual}
                partialNote={individualPartialNote}
              />
            </div>

            {/* 차트 */}
            <div className="mb-6">
              <CumulativeChart daily={trend.daily} capabilities={capabilities} />
            </div>

            {/* 일별 표 */}
            <div className="mb-6">
              <h3 className="mb-2 text-sm font-semibold">일별 매매</h3>
              <DailyTable daily={trend.daily} capabilities={capabilities} />
            </div>

            {/* 데이터 출처 + 한계 */}
            <div className="mt-8 rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
              <div className="mb-2 font-semibold text-foreground">
                데이터 소스: {capabilities.providerName}
              </div>
              <ul className="space-y-1 list-disc list-inside">
                {capabilities.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
              <p className="mt-3 italic">
                ⚠️ 이 도구는 참고용입니다. 모든 투자 판단은 본인의 책임입니다.
              </p>
            </div>
          </>
        )}

        {!trend && !loading && !error && (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            종목 코드와 시작일을 입력하고 &ldquo;분석&rdquo; 버튼을 눌러주세요
          </div>
        )}
      </div>

      {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}
    </div>
  );
}
