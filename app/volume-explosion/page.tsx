"use client";

import { useState, useEffect, useMemo } from "react";
import { HelpCircle, X } from "lucide-react";

interface VolumeEntry {
  date: string;
  close: number;
  volume: number;
  tradingValue: number;
}

interface StockVolumeData {
  name: string;
  ticker: string;
  market: "kospi" | "kosdaq";
  latestDate: string;
  latestTradingValue: number;
  avgTradingValue20: number;
  explosionRatio: number;
  latestClose: number;
  latestChange: number;
  latestChangeRate: number;
  sparkline: number[];
  history: VolumeEntry[];
}

type Market = "all" | "kospi" | "kosdaq";

// --- Formatting ---
function formatOk(won: number): string {
  const ok = won / 1_0000_0000; // 억 단위
  if (ok >= 10000) {
    return `${(ok / 10000).toFixed(1)}조`;
  }
  return `${Math.round(ok).toLocaleString()}억`;
}

function getRatioColor(ratio: number) {
  if (ratio >= 5) return { text: "text-red-500", border: "border-red-500/30", spark: "#ef4444" };
  if (ratio >= 3) return { text: "text-orange-500", border: "border-orange-500/30", spark: "#f97316" };
  if (ratio >= 2) return { text: "text-yellow-500", border: "border-yellow-500/30", spark: "#eab308" };
  return { text: "text-muted-foreground", border: "border-border", spark: "#6b7280" };
}

// --- Guide Modal ---
function GuideModal({ onClose }: { onClose: () => void }) {
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
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X size={20} />
        </button>

        <h2 className="mb-6 text-xl font-bold">
          거래대금 폭발, 이렇게 읽으세요
        </h2>

        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">거래대금이 뭔가요?</h3>
          <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            <li>하루 동안 그 종목이 사고 팔린 총 금액이에요.</li>
            <li>
              예를 들어 삼성전자가 하루에 1조원어치 거래됐다면, 그게 거래대금이에요.
            </li>
            <li>거래량(주식 수)과는 다르게, 금액 기준이라 더 직관적이에요.</li>
          </ul>
        </section>

        <hr className="my-5 border-border" />

        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">
            폭발 배율이 뭔가요?
          </h3>
          <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            <li>
              <strong>최근 20거래일 평균 거래대금</strong>과 비교해서 오늘이 몇
              배인지 보여줘요.
            </li>
            <li>
              평소 100억원어치 거래되던 종목이 오늘 500억원이면 &ldquo;5배&rdquo;예요.
            </li>
            <li>배율이 높을수록 평소와 다른 큰 움직임이 있다는 뜻이에요.</li>
          </ul>
        </section>

        <hr className="my-5 border-border" />

        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">왜 중요한가요?</h3>
          <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            <li>
              거래대금이 갑자기 늘어나면 시장의 관심이 집중됐다는 뜻이에요.
            </li>
            <li>
              호재 뉴스, 실적 발표, 큰 손의 매매 등 이유가 있을 수 있어요.
            </li>
            <li>
              반대로 악재로 인한 투매일 수도 있으니, 원인을 꼭 확인해야 해요.
            </li>
          </ul>
        </section>

        <hr className="my-5 border-border" />

        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">색깔로 읽기</h3>
          <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
              <span className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
              <span>
                <strong>5배 이상</strong> &rarr; 매우 이례적. 큰 이슈가 터졌을
                가능성이 높아요.
              </span>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
              <span className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-orange-500" />
              <span>
                <strong>3~5배</strong> &rarr; 주목할 만한 수준. 뉴스나 공시를
                확인해보세요.
              </span>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
              <span className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-yellow-500" />
              <span>
                <strong>2~3배</strong> &rarr; 평소보다 활발. 관심 종목이라면
                체크해볼 만해요.
              </span>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
              <span className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-gray-500" />
              <span>
                <strong>2배 미만</strong> &rarr; 정상 범위. 평소와 비슷한
                수준이에요.
              </span>
            </div>
          </div>
        </section>

        <hr className="my-5 border-border" />

        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">주의할 점</h3>
          <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            <li>거래대금이 늘었다고 무조건 좋은 건 아니에요.</li>
            <li>상승 + 거래대금 폭발은 긍정적 신호일 수 있어요.</li>
            <li>하락 + 거래대금 폭발은 투매 신호일 수 있어요.</li>
            <li>가격 방향과 함께 봐야 정확한 판단이 가능합니다.</li>
          </ul>
        </section>

        <hr className="my-5 border-border" />

        <section>
          <h3 className="mb-2 text-base font-semibold">
            데이터는 어디서 오나요?
          </h3>
          <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            <li>네이버 금융에서 제공하는 종목별 일별 시세 데이터를 가져와요.</li>
            <li>
              종가와 거래량을 곱해서 거래대금을 계산합니다.
            </li>
            <li>
              코스피·코스닥 시가총액 상위 종목을 대상으로 합니다.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

// --- Sparkline SVG ---
function Sparkline({
  data,
  width = 120,
  height = 32,
  color,
}: {
  data: number[];
  width?: number;
  height?: number;
  color: string;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="block">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// --- Detail Chart SVG ---
function DetailChart({
  data,
  avgLine,
}: {
  data: VolumeEntry[];
  avgLine: number;
}) {
  if (data.length === 0)
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        데이터가 없습니다
      </div>
    );

  const W = 560;
  const H = 240;
  const PL = 60;
  const PR = 20;
  const PT = 15;
  const PB = 40;
  const chartW = W - PL - PR;
  const chartH = H - PT - PB;

  const values = data.map((d) => d.tradingValue);
  const maxV = Math.max(...values);
  const yMax = maxV * 1.1;
  const barWidth = Math.max(1, (chartW / data.length) * 0.7);
  const barGap = chartW / data.length;

  // Y-axis labels
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const val = (yMax * i) / 4;
    const y = PT + chartH - (i / 4) * chartH;
    return { val, y };
  });

  // X-axis labels
  const step = Math.max(1, Math.floor(data.length / 5));
  const xTicks: { label: string; x: number }[] = [];
  for (let i = 0; i < data.length; i += step) {
    const x = PL + i * barGap + barGap / 2;
    xTicks.push({ label: data[i].date.slice(5), x });
  }

  // Average line Y position
  const avgY = PT + chartH - (avgLine / yMax) * chartH;

  // Stats
  const latest = data[data.length - 1];
  const maxEntry = data.reduce((a, b) =>
    a.tradingValue > b.tradingValue ? a : b
  );

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* Grid lines */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={PL}
              y1={t.y}
              x2={W - PR}
              y2={t.y}
              stroke="currentColor"
              strokeOpacity={0.1}
            />
            <text
              x={PL - 6}
              y={t.y + 4}
              textAnchor="end"
              fontSize={9}
              fill="currentColor"
              fillOpacity={0.5}
            >
              {formatOk(t.val)}
            </text>
          </g>
        ))}

        {/* X labels */}
        {xTicks.map((t, i) => (
          <text
            key={i}
            x={t.x}
            y={H - 8}
            textAnchor="middle"
            fontSize={9}
            fill="currentColor"
            fillOpacity={0.5}
          >
            {t.label}
          </text>
        ))}

        {/* Bars */}
        {data.map((d, i) => {
          const barH = (d.tradingValue / yMax) * chartH;
          const x = PL + i * barGap + (barGap - barWidth) / 2;
          const y = PT + chartH - barH;
          const isUp = i > 0 ? d.close >= data[i - 1].close : true;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barWidth}
              height={barH}
              fill={isUp ? "#22c55e" : "#ef4444"}
              fillOpacity={0.7}
              rx={0.5}
            />
          );
        })}

        {/* 20-day average line */}
        <line
          x1={PL}
          y1={avgY}
          x2={W - PR}
          y2={avgY}
          stroke="#f97316"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        <text
          x={W - PR + 2}
          y={avgY + 3}
          fontSize={8}
          fill="#f97316"
        >
          20일평균
        </text>
      </svg>

      <div className="flex gap-4 mt-3 text-xs text-muted-foreground justify-center flex-wrap">
        <span>
          최신:{" "}
          <strong className="text-foreground">
            {formatOk(latest.tradingValue)}
          </strong>{" "}
          ({latest.date})
        </span>
        <span>
          최고:{" "}
          <strong className="text-foreground">
            {formatOk(maxEntry.tradingValue)}
          </strong>{" "}
          ({maxEntry.date})
        </span>
        <span>
          20일 평균:{" "}
          <strong className="text-foreground">{formatOk(avgLine)}</strong>
        </span>
        <span>
          기간: {data[0].date} ~ {latest.date} ({data.length}일)
        </span>
      </div>
    </div>
  );
}

// --- Modal ---
function Modal({
  stock,
  onClose,
}: {
  stock: StockVolumeData;
  onClose: () => void;
}) {
  const [period, setPeriod] = useState<"1m" | "3m">("1m");

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

  const filteredHistory = useMemo(() => {
    const history = stock.history;
    if (period === "3m") return history;
    // 1m: last ~22 trading days
    return history.slice(-22);
  }, [stock.history, period]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-background border border-border rounded-xl max-w-2xl w-full p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">
            {stock.name}{" "}
            <span className="text-muted-foreground text-sm font-normal">
              {stock.ticker}
            </span>
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X size={20} />
          </button>
        </div>

        {/* Summary */}
        <div className="flex gap-4 mb-4 text-sm flex-wrap">
          <span>
            폭발 배율:{" "}
            <strong className={getRatioColor(stock.explosionRatio).text}>
              {stock.explosionRatio.toFixed(1)}배
            </strong>
          </span>
          <span>
            현재가:{" "}
            <strong className="text-foreground">
              {stock.latestClose.toLocaleString()}원
            </strong>
          </span>
          <span
            className={
              stock.latestChangeRate >= 0 ? "text-green-500" : "text-red-500"
            }
          >
            {stock.latestChangeRate >= 0 ? "+" : ""}
            {stock.latestChangeRate.toFixed(2)}%
          </span>
        </div>

        {/* Period tabs */}
        <div className="flex gap-2 mb-4">
          {(["1m", "3m"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-sm rounded-md border transition-colors ${
                period === p
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {p === "1m" ? "1개월" : "3개월"}
            </button>
          ))}
        </div>

        <DetailChart
          data={filteredHistory}
          avgLine={stock.avgTradingValue20}
        />
      </div>
    </div>
  );
}

// --- Stock Card ---
function StockCard({
  stock,
  onClick,
}: {
  stock: StockVolumeData;
  onClick: () => void;
}) {
  const colors = getRatioColor(stock.explosionRatio);

  return (
    <div
      onClick={onClick}
      className={`border rounded-lg p-4 bg-card hover:bg-accent/50 transition-colors cursor-pointer ${colors.border}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="font-semibold text-sm">{stock.name}</div>
          <div className="text-xs text-muted-foreground">
            {stock.ticker}{" "}
            <span className="ml-1 opacity-60">
              {stock.market === "kospi" ? "코스피" : "코스닥"}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-lg font-bold ${colors.text}`}>
            {stock.explosionRatio.toFixed(1)}배
          </div>
        </div>
      </div>

      <div className="text-xs text-muted-foreground mb-1">
        거래대금{" "}
        <strong className="text-foreground">
          {formatOk(stock.latestTradingValue)}
        </strong>
        <span className="mx-1.5 opacity-40">|</span>
        20일평균 {formatOk(stock.avgTradingValue20)}
      </div>

      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">
          {stock.latestClose.toLocaleString()}원
        </span>
        <span
          className={`text-xs font-medium ${
            stock.latestChangeRate >= 0 ? "text-green-500" : "text-red-500"
          }`}
        >
          {stock.latestChangeRate >= 0 ? "+" : ""}
          {stock.latestChangeRate.toFixed(2)}%
        </span>
      </div>

      <Sparkline data={stock.sparkline} color={colors.spark} />
    </div>
  );
}

// --- Main Page ---
export default function VolumeExplosionPage() {
  const [market, setMarket] = useState<Market>("all");
  const [stocks, setStocks] = useState<StockVolumeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedStock, setSelectedStock] = useState<StockVolumeData | null>(
    null
  );
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/volume-explosion?market=${market}`)
      .then((r) => r.json())
      .then((json) => setStocks(json.stocks || []))
      .finally(() => setLoading(false));
  }, [market]);

  const filtered = useMemo(() => {
    if (!search.trim()) return stocks;
    const q = search.trim().toLowerCase();
    return stocks.filter(
      (s) => s.name.toLowerCase().includes(q) || s.ticker.includes(q)
    );
  }, [stocks, search]);

  const noResults = search.trim() && filtered.length === 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            거래대금 폭발
          </h1>
          <p className="text-muted-foreground text-sm">
            평소 대비 거래대금이 급증한 종목을 추적합니다
            <span className="ml-2 inline-block">
              <button
                onClick={() => setShowGuide(true)}
                className="guide-btn inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-all"
              >
                <HelpCircle size={13} />
                거래대금 폭발 보는 법
              </button>
            </span>
          </p>
        </header>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="종목명 또는 티커 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-sm px-4 py-2 border border-border rounded-lg bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(["all", "kospi", "kosdaq"] as Market[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMarket(m);
                setSearch("");
              }}
              className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                market === m
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "all" ? "전체" : m === "kospi" ? "코스피" : "코스닥"}
            </button>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="text-center py-20 text-muted-foreground">
            데이터를 불러오는 중...
          </div>
        ) : noResults ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground mb-3">
              &quot;{search}&quot; 검색 결과가 없습니다
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            데이터가 없습니다
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((s) => (
              <StockCard
                key={s.ticker}
                stock={s}
                onClick={() => setSelectedStock(s)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {selectedStock && (
        <Modal
          stock={selectedStock}
          onClose={() => setSelectedStock(null)}
        />
      )}

      {/* Guide Modal */}
      {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}
    </div>
  );
}
