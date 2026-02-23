"use client";

import { useState, useEffect, useMemo } from "react";

interface ForeignEntry {
  date: string;
  quantity: number;
  ratio: number;
}

interface StockData {
  name: string;
  ticker: string;
  data: ForeignEntry[];
}

type Period = "1m" | "3m" | "6m";
type Market = "kospi" | "kosdaq";

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
function DetailChart({ data }: { data: ForeignEntry[] }) {
  if (data.length === 0)
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        데이터가 없습니다
      </div>
    );

  const W = 560;
  const H = 220;
  const PL = 50;
  const PR = 20;
  const PT = 15;
  const PB = 40;
  const chartW = W - PL - PR;
  const chartH = H - PT - PB;

  const ratios = data.map((d) => d.ratio);
  const minR = Math.min(...ratios);
  const maxR = Math.max(...ratios);
  const range = maxR - minR || 1;
  const pad = range * 0.1;
  const yMin = minR - pad;
  const yMax = maxR + pad;
  const yRange = yMax - yMin;

  const points = data
    .map((d, i) => {
      const x = PL + (i / (data.length - 1)) * chartW;
      const y = PT + chartH - ((d.ratio - yMin) / yRange) * chartH;
      return `${x},${y}`;
    })
    .join(" ");

  // Y-axis labels (5 ticks)
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const val = yMin + (yRange * i) / 4;
    const y = PT + chartH - (i / 4) * chartH;
    return { val, y };
  });

  // X-axis labels (5 ticks)
  const step = Math.max(1, Math.floor(data.length / 4));
  const xTicks: { label: string; x: number }[] = [];
  for (let i = 0; i < data.length; i += step) {
    const x = PL + (i / (data.length - 1)) * chartW;
    xTicks.push({ label: data[i].date.slice(5), x });
  }
  // always include last
  if (xTicks.length > 0) {
    const lastX = PL + chartW;
    xTicks.push({ label: data[data.length - 1].date.slice(5), x: lastX });
  }

  const latest = data[data.length - 1];
  const highest = data.reduce((a, b) => (a.ratio > b.ratio ? a : b));
  const lowest = data.reduce((a, b) => (a.ratio < b.ratio ? a : b));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* grid lines */}
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
              fontSize={10}
              fill="currentColor"
              fillOpacity={0.5}
            >
              {t.val.toFixed(1)}%
            </text>
          </g>
        ))}
        {/* x labels */}
        {xTicks.map((t, i) => (
          <text
            key={i}
            x={t.x}
            y={H - 8}
            textAnchor="middle"
            fontSize={10}
            fill="currentColor"
            fillOpacity={0.5}
          >
            {t.label}
          </text>
        ))}
        {/* line */}
        <polyline
          points={points}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex gap-4 mt-3 text-xs text-muted-foreground justify-center">
        <span>
          현재:{" "}
          <strong className="text-foreground">{latest.ratio.toFixed(2)}%</strong>
        </span>
        <span>
          최고:{" "}
          <strong className="text-foreground">
            {highest.ratio.toFixed(2)}%
          </strong>{" "}
          ({highest.date.slice(5)})
        </span>
        <span>
          최저:{" "}
          <strong className="text-foreground">
            {lowest.ratio.toFixed(2)}%
          </strong>{" "}
          ({lowest.date.slice(5)})
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
  stock: StockData;
  onClose: () => void;
}) {
  const [period, setPeriod] = useState<Period>("1m");
  const [allData, setAllData] = useState<ForeignEntry[]>(stock.data);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(
      `/api/foreign-ownership?ticker=${stock.ticker}&period=${period}`
    )
      .then((r) => r.json())
      .then((json) => {
        const s = json.stocks?.[0];
        if (s) setAllData(s.data);
      })
      .finally(() => setLoading(false));
  }, [stock.ticker, period]);

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
            className="text-muted-foreground hover:text-foreground text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          {(["1m", "3m", "6m"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-sm rounded-md border transition-colors ${
                period === p
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {p === "1m" ? "1개월" : p === "3m" ? "3개월" : "6개월"}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            로딩 중...
          </div>
        ) : (
          <DetailChart data={allData} />
        )}
      </div>
    </div>
  );
}

// --- Stock Card ---
function StockCard({
  stock,
  onClick,
}: {
  stock: StockData;
  onClick: () => void;
}) {
  const { data } = stock;
  const current = data.length > 0 ? data[data.length - 1].ratio : null;

  function getChange(daysAgo: number) {
    if (data.length < 2) return null;
    // find entry ~daysAgo trading days back
    const idx = Math.max(0, data.length - 1 - daysAgo);
    const old = data[idx].ratio;
    if (current === null) return null;
    return current - old;
  }

  const change1m = getChange(20);
  const change3m = getChange(60);
  const change6m = getChange(120);

  const sparkData = data.map((d) => d.ratio);
  const sparkColor =
    change1m !== null && change1m >= 0 ? "#22c55e" : "#ef4444";

  return (
    <div
      onClick={onClick}
      className="border border-border rounded-lg p-4 bg-card hover:bg-accent/50 transition-colors cursor-pointer"
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="font-semibold text-sm">{stock.name}</div>
          <div className="text-xs text-muted-foreground">{stock.ticker}</div>
        </div>
        {current !== null && (
          <div className="text-right">
            <div className="text-lg font-bold">{current.toFixed(2)}%</div>
          </div>
        )}
      </div>

      {data.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">
          데이터 수집 중입니다
        </div>
      ) : (
        <>
          <div className="flex gap-3 text-xs mb-2">
            <ChangeLabel label="1M" value={change1m} />
            <ChangeLabel label="3M" value={change3m} />
            <ChangeLabel label="6M" value={change6m} />
          </div>
          <Sparkline data={sparkData} color={sparkColor} />
        </>
      )}
    </div>
  );
}

function ChangeLabel({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  if (value === null) return null;
  const isUp = value >= 0;
  return (
    <span className={isUp ? "text-green-500" : "text-red-500"}>
      {label}{" "}
      <span className="font-medium">
        {isUp ? "+" : ""}
        {value.toFixed(2)}
      </span>
    </span>
  );
}

// --- Main Page ---
export default function ForeignOwnershipPage() {
  const [market, setMarket] = useState<Market>("kospi");
  const [stocks, setStocks] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedStock, setSelectedStock] = useState<StockData | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/foreign-ownership?market=${market}&period=6m`)
      .then((r) => r.json())
      .then((json) => setStocks(json.stocks || []))
      .finally(() => setLoading(false));
  }, [market]);

  const filtered = useMemo(() => {
    if (!search.trim()) return stocks;
    const q = search.trim().toLowerCase();
    return stocks.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || s.ticker.includes(q)
    );
  }, [stocks, search]);

  const noResults = search.trim() && filtered.length === 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            외국인 지분율 추적
          </h1>
          <p className="text-muted-foreground text-sm">
            코스피 · 코스닥 상위 종목의 외국인 보유 비율 변화를 추적합니다
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
          {(["kospi", "kosdaq"] as Market[]).map((m) => (
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
              {m === "kospi" ? "코스피" : "코스닥"}
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
            <p className="text-xs text-muted-foreground">
              고정 40개 종목 외의 종목은 추후 KRX 직접 조회를 지원할
              예정입니다
            </p>
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
    </div>
  );
}
