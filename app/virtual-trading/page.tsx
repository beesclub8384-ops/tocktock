"use client";

import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  PieChart,
  Activity,
  RotateCcw,
  RefreshCw,
  Clock,
  Target,
  ShieldAlert,
  HelpCircle,
  X,
} from "lucide-react";

interface Position {
  code: string;
  name: string;
  market: string;
  buyPrice: number;
  buyDate: string;
  quantity: number;
  highestHigh: number;
  trailingStopPrice: number;
  absoluteStopPrice: number;
}

interface TradeRecord {
  date: string;
  code: string;
  name: string;
  type: "BUY" | "SELL";
  price: number;
  quantity: number;
  amount: number;
  pnl?: number;
  pnlRate?: number;
  reason?: string;
}

interface BuySignalCandidate {
  code: string;
  name: string;
  market: string;
  dDate: string;
  dTradingValue: number;
  dClosePrice: number;
  dChangeRate: number;
  dPlusOneTradingValue: number;
  dPlusOneClosePrice: number;
  stage: "D1_WAITING" | "D2_CHECKING" | "D3_BUY_READY";
  dPlusTwoClosePrice?: number;
  dPlusTwoTradingValue?: number;
}

interface EquityCurvePoint {
  date: string;
  totalAsset: number;
  returnRate: number;
}

interface Summary {
  totalAsset: number;
  cash: number;
  investedValue: number;
  returnRate: number;
  profitLossRatio: number;
  winRate: number;
  totalTrades: number;
  wins: number;
  losses: number;
}

interface TradingData {
  positions: Position[];
  trades: TradeRecord[];
  candidates: BuySignalCandidate[];
  equityCurve: EquityCurvePoint[];
  summary: Summary;
  updatedAt: string;
}

function formatDate(yyyymmdd: string): string {
  if (!yyyymmdd || yyyymmdd.length < 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function formatMoney(value: number): string {
  if (Math.abs(value) >= 100_000_000) {
    return (value / 100_000_000).toFixed(2) + "억";
  }
  return value.toLocaleString() + "원";
}

function formatBillion(value: number): string {
  const eok = Math.round(value / 100_000_000);
  return eok.toLocaleString() + "억";
}

const stageLabels: Record<string, { text: string; color: string }> = {
  D1_WAITING: { text: "D+1 대기", color: "bg-yellow-500/20 text-yellow-400" },
  D2_CHECKING: { text: "D+2 확인중", color: "bg-blue-500/20 text-blue-400" },
  D3_BUY_READY: { text: "매수 대기", color: "bg-green-500/20 text-green-400" },
};

function GuideModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="relative max-h-[85vh] overflow-y-auto p-6 sm:p-8">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X size={20} />
          </button>

          <h2 className="mb-6 text-xl font-bold">자동매매 시뮬레이터 안내</h2>

          <section className="mb-5">
            <h3 className="mb-2 text-base font-semibold">이게 뭔가요?</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              가상 자금 1,000만원으로 시작하는{" "}
              <strong className="text-foreground">완전 자동 매매 시뮬레이터</strong>
              입니다. 실제 돈이 들어가지 않으며, 매일 장 마감 후 자동으로 종목을
              스캔하고, 조건에 맞으면 다음 날 시가에 자동 매수합니다.
            </p>
          </section>

          <hr className="my-4 border-border" />

          <section className="mb-5">
            <h3 className="mb-2 text-base font-semibold">매수 조건</h3>
            <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
              <li>
                <strong className="text-foreground">D-1일:</strong> 거래대금 300억 이하 (조용한 종목)
              </li>
              <li>
                <strong className="text-foreground">D일:</strong> 거래대금 950억~5,000억으로 폭발, 등락률 10~20%, 양봉
              </li>
              <li>
                <strong className="text-foreground">D+1일:</strong> 거래대금이 D일의 1/3 이하로 급감
              </li>
              <li>
                <strong className="text-foreground">D+2일:</strong> 종가가 D+1일보다 높고, 거래대금 300억 이상
              </li>
              <li>
                <strong className="text-foreground">D+3일:</strong> 시가에 매수
              </li>
            </ul>
          </section>

          <hr className="my-4 border-border" />

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <section>
              <h3 className="mb-2 text-base font-semibold">자금 관리</h3>
              <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
                <li>한 종목당 전체 자금의 <strong className="text-foreground">10%</strong></li>
                <li>동시 보유 최대 <strong className="text-foreground">5종목</strong></li>
                <li>현금 <strong className="text-foreground">50% 이상</strong> 항상 유지</li>
                <li>현금 100만원 미만이면 매수 중단</li>
              </ul>
            </section>

            <section>
              <h3 className="mb-2 text-base font-semibold">매도 조건</h3>
              <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
                <li>
                  <strong className="text-foreground">트레일링 스탑:</strong> 보유 중 최고가 대비 -3%
                </li>
                <li>
                  <strong className="text-foreground">절대 손절:</strong> 매수가 대비 -7%
                </li>
                <li>둘 중 먼저 충족되는 조건으로 매도</li>
              </ul>
            </section>
          </div>

          <hr className="my-4 border-border" />

          <section>
            <h3 className="mb-2 text-base font-semibold">주의사항</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              이 시뮬레이터는{" "}
              <strong className="text-foreground">교육 및 참고 목적</strong>
              입니다. 실제 투자는 본인 판단과 책임 하에 진행하세요. 과거 시뮬레이션 결과가
              미래 수익을 보장하지 않습니다.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function EquityChart({ data }: { data: EquityCurvePoint[] }) {
  if (data.length < 2) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        데이터가 쌓이면 누적 수익률 차트가 표시됩니다
      </div>
    );
  }

  const rates = data.map((d) => d.returnRate);
  const minR = Math.min(0, ...rates);
  const maxR = Math.max(0, ...rates);
  const range = maxR - minR || 1;
  const h = 200;
  const w = 600;
  const padY = 20;
  const padX = 50;

  const chartW = w - padX;
  const chartH = h - padY * 2;

  const points = data.map((d, i) => {
    const x = padX + (i / (data.length - 1)) * chartW;
    const y = padY + chartH - ((d.returnRate - minR) / range) * chartH;
    return `${x},${y}`;
  });

  const zeroY = padY + chartH - ((0 - minR) / range) * chartH;

  // fill area
  const fillPoints = [
    `${padX},${zeroY}`,
    ...points,
    `${padX + chartW},${zeroY}`,
  ].join(" ");

  const lastRate = rates[rates.length - 1];
  const color = lastRate >= 0 ? "#ef4444" : "#3b82f6";
  const fillColor = lastRate >= 0 ? "rgba(239,68,68,0.1)" : "rgba(59,130,246,0.1)";

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* zero line */}
      <line
        x1={padX}
        y1={zeroY}
        x2={w}
        y2={zeroY}
        stroke="currentColor"
        strokeOpacity={0.15}
        strokeDasharray="4"
      />
      <text
        x={padX - 4}
        y={zeroY + 4}
        textAnchor="end"
        className="fill-muted-foreground"
        fontSize={10}
      >
        0%
      </text>

      {/* max/min labels */}
      {maxR > 0 && (
        <text
          x={padX - 4}
          y={padY + 4}
          textAnchor="end"
          className="fill-muted-foreground"
          fontSize={10}
        >
          {maxR.toFixed(1)}%
        </text>
      )}
      {minR < 0 && (
        <text
          x={padX - 4}
          y={h - padY + 4}
          textAnchor="end"
          className="fill-muted-foreground"
          fontSize={10}
        >
          {minR.toFixed(1)}%
        </text>
      )}

      {/* fill */}
      <polygon points={fillPoints} fill={fillColor} />

      {/* line */}
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={2}
      />

      {/* last point */}
      {data.length > 0 && (
        <>
          <circle
            cx={parseFloat(points[points.length - 1].split(",")[0])}
            cy={parseFloat(points[points.length - 1].split(",")[1])}
            r={4}
            fill={color}
          />
          <text
            x={parseFloat(points[points.length - 1].split(",")[0]) - 4}
            y={parseFloat(points[points.length - 1].split(",")[1]) - 10}
            className="fill-foreground font-bold"
            fontSize={11}
          >
            {lastRate >= 0 ? "+" : ""}
            {lastRate.toFixed(2)}%
          </text>
        </>
      )}

      {/* date labels */}
      {data.length > 1 && (
        <>
          <text
            x={padX}
            y={h - 2}
            className="fill-muted-foreground"
            fontSize={9}
          >
            {formatDate(data[0].date)}
          </text>
          <text
            x={w}
            y={h - 2}
            textAnchor="end"
            className="fill-muted-foreground"
            fontSize={9}
          >
            {formatDate(data[data.length - 1].date)}
          </text>
        </>
      )}
    </svg>
  );
}

export default function VirtualTradingPage() {
  const [data, setData] = useState<TradingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [activeTab, setActiveTab] = useState<"positions" | "candidates" | "history">("positions");

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch("/api/virtual-trading")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setData(json);
      })
      .catch(() => setError("데이터를 불러올 수 없습니다."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleReset = async () => {
    if (!confirm("정말 초기화하시겠습니까? 모든 매매 기록이 삭제됩니다."))
      return;
    setResetting(true);
    try {
      await fetch("/api/virtual-trading", { method: "DELETE" });
      fetchData();
    } catch {
      alert("초기화 실패");
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground/30 border-t-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">
            시뮬레이터 데이터를 불러오는 중...
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="mb-4 text-red-400">
            {error || "데이터를 불러올 수 없습니다."}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-accent"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  const { summary, positions, trades, candidates, equityCurve } = data;
  const isProfit = summary.returnRate >= 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-12">
        {/* 헤더 */}
        <header className="mb-8">
          <h1 className="mb-2 text-3xl font-bold tracking-tight">
            자동매매 시뮬레이터
          </h1>
          <p className="text-sm text-muted-foreground">
            가상 자금 1,000만원으로 세력진입 패턴 기반 자동매매를 시뮬레이션합니다
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => setShowGuide(true)}
              className="guide-btn inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-all"
            >
              <HelpCircle size={13} />
              전략 안내
            </button>
            <button
              onClick={fetchData}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-all hover:bg-accent"
            >
              <RefreshCw size={13} />
              새로고침
            </button>
            <button
              onClick={handleReset}
              disabled={resetting}
              className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/5 px-2.5 py-1 text-xs text-red-400 transition-all hover:bg-red-500/10"
            >
              <RotateCcw size={13} />
              {resetting ? "초기화 중..." : "초기화"}
            </button>
          </div>
        </header>

        {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}

        {/* 상단 요약 카드 */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryCard
            icon={<Wallet size={16} />}
            label="총 자산"
            value={formatMoney(summary.totalAsset)}
            sub={`초기 ${formatMoney(10_000_000)}`}
          />
          <SummaryCard
            icon={<PieChart size={16} />}
            label="현금"
            value={formatMoney(summary.cash)}
            sub={`${((summary.cash / summary.totalAsset) * 100).toFixed(0)}%`}
          />
          <SummaryCard
            icon={<Activity size={16} />}
            label="투자금"
            value={formatMoney(summary.investedValue)}
            sub={`${positions.length}종목 보유`}
          />
          <SummaryCard
            icon={isProfit ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            label="수익률"
            value={`${isProfit ? "+" : ""}${summary.returnRate}%`}
            valueColor={isProfit ? "text-red-400" : "text-blue-400"}
            sub={`${formatMoney(summary.totalAsset - 10_000_000)}`}
          />
          <SummaryCard
            icon={<Target size={16} />}
            label="손익비"
            value={
              summary.profitLossRatio === Infinity
                ? "-"
                : `${summary.profitLossRatio}`
            }
            sub={`승률 ${summary.winRate}%`}
          />
          <SummaryCard
            icon={<ShieldAlert size={16} />}
            label="매매 횟수"
            value={`${summary.totalTrades}회`}
            sub={`${summary.wins}승 ${summary.losses}패`}
          />
        </div>

        {/* 누적 수익률 차트 */}
        <div className="mb-6 rounded-xl border border-border p-5">
          <h2 className="mb-3 text-base font-bold">누적 수익률</h2>
          <EquityChart data={equityCurve} />
        </div>

        {/* 탭 */}
        <div className="mb-4 flex gap-1 rounded-lg border border-border p-1">
          <TabButton
            active={activeTab === "positions"}
            onClick={() => setActiveTab("positions")}
          >
            보유 종목 ({positions.length})
          </TabButton>
          <TabButton
            active={activeTab === "candidates"}
            onClick={() => setActiveTab("candidates")}
          >
            매수 대기 ({candidates.length})
          </TabButton>
          <TabButton
            active={activeTab === "history"}
            onClick={() => setActiveTab("history")}
          >
            매매 히스토리 ({trades.length})
          </TabButton>
        </div>

        {/* 보유 종목 */}
        {activeTab === "positions" && (
          <div className="space-y-3">
            {positions.length === 0 ? (
              <EmptyState message="현재 보유 중인 종목이 없습니다" />
            ) : (
              positions.map((p) => {
                const pnlRate =
                  ((p.highestHigh - p.buyPrice) / p.buyPrice) * 100;
                return (
                  <div
                    key={p.code}
                    className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/30"
                  >
                    <div className="mb-3 flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-bold">{p.name}</span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                            {p.market}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          <span style={{ fontFamily: "'DM Mono', monospace" }}>
                            {p.code}
                          </span>
                          <span className="ml-2">
                            매수일 {formatDate(p.buyDate)}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className="text-lg font-bold"
                          style={{ fontFamily: "'DM Mono', monospace" }}
                        >
                          {p.buyPrice.toLocaleString()}원
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {p.quantity}주
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <span className="text-xs text-muted-foreground">
                          최고가
                        </span>
                        <div
                          className="font-medium text-red-400"
                          style={{ fontFamily: "'DM Mono', monospace" }}
                        >
                          {p.highestHigh.toLocaleString()}원
                          <span className="ml-1 text-xs">
                            (+{pnlRate.toFixed(1)}%)
                          </span>
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">
                          트레일링 매도선
                        </span>
                        <div
                          className="font-medium text-amber-400"
                          style={{ fontFamily: "'DM Mono', monospace" }}
                        >
                          {p.trailingStopPrice.toLocaleString()}원
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">
                          절대 손절선
                        </span>
                        <div
                          className="font-medium text-blue-400"
                          style={{ fontFamily: "'DM Mono', monospace" }}
                        >
                          {p.absoluteStopPrice.toLocaleString()}원
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* 매수 대기 종목 */}
        {activeTab === "candidates" && (
          <div className="space-y-3">
            {candidates.length === 0 ? (
              <EmptyState message="현재 매수 대기 중인 종목이 없습니다" />
            ) : (
              candidates.map((c) => {
                const sl = stageLabels[c.stage];
                return (
                  <div
                    key={c.code + c.dDate}
                    className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/30"
                  >
                    <div className="mb-2 flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-bold">{c.name}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${sl.color}`}
                          >
                            {sl.text}
                          </span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                            {c.market}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span style={{ fontFamily: "'DM Mono', monospace" }}>
                            {c.code}
                          </span>
                          <Clock size={11} />
                          <span>D일: {formatDate(c.dDate)}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className="text-base font-bold"
                          style={{ fontFamily: "'DM Mono', monospace" }}
                        >
                          {c.dClosePrice.toLocaleString()}원
                        </div>
                        <div className="text-sm font-medium text-red-400">
                          +{c.dChangeRate.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        D 거래대금{" "}
                        <strong className="text-amber-400">
                          {formatBillion(c.dTradingValue)}
                        </strong>
                      </span>
                      {c.dPlusOneTradingValue > 0 && (
                        <span>
                          D+1 거래대금{" "}
                          <strong className="text-foreground">
                            {formatBillion(c.dPlusOneTradingValue)}
                          </strong>
                        </span>
                      )}
                      {c.dPlusTwoTradingValue && c.dPlusTwoTradingValue > 0 && (
                        <span>
                          D+2 거래대금{" "}
                          <strong className="text-foreground">
                            {formatBillion(c.dPlusTwoTradingValue)}
                          </strong>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* 매매 히스토리 */}
        {activeTab === "history" && (
          <div className="space-y-2">
            {trades.length === 0 ? (
              <EmptyState message="아직 매매 기록이 없습니다" />
            ) : (
              [...trades].reverse().map((t, i) => (
                <div
                  key={`${t.date}-${t.code}-${t.type}-${i}`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm"
                >
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-bold ${
                      t.type === "BUY"
                        ? "bg-red-500/20 text-red-400"
                        : "bg-blue-500/20 text-blue-400"
                    }`}
                  >
                    {t.type === "BUY" ? "매수" : "매도"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(t.date)}
                  </span>
                  <span className="font-medium">{t.name}</span>
                  <span
                    className="text-muted-foreground"
                    style={{ fontFamily: "'DM Mono', monospace" }}
                  >
                    {t.price.toLocaleString()}원
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t.quantity}주
                  </span>
                  {t.type === "SELL" && t.pnlRate !== undefined && (
                    <span
                      className={`ml-auto font-bold ${
                        (t.pnl || 0) >= 0 ? "text-red-400" : "text-blue-400"
                      }`}
                      style={{ fontFamily: "'DM Mono', monospace" }}
                    >
                      {(t.pnl || 0) >= 0 ? "+" : ""}
                      {t.pnlRate.toFixed(2)}%
                    </span>
                  )}
                  {t.reason && (
                    <span className="text-xs text-muted-foreground/60">
                      {t.reason}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* 업데이트 시각 */}
        <p className="mt-6 text-right text-xs text-muted-foreground/50">
          마지막 업데이트:{" "}
          {new Date(data.updatedAt).toLocaleString("ko-KR", {
            timeZone: "Asia/Seoul",
          })}
        </p>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
  valueColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  valueColor?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={`text-lg font-bold ${valueColor || ""}`}
        style={{ fontFamily: "'DM Mono', monospace" }}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground/60">{sub}</div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-xl border border-border bg-card">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
