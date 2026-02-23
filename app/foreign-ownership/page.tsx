"use client";

import { useState, useEffect, useMemo } from "react";
import { HelpCircle, X } from "lucide-react";

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

type Period = "1m" | "3m" | "6m" | "1y" | "all";
type Market = "kospi" | "kosdaq";

const PERIOD_LABELS: Record<Period, string> = {
  "1m": "1개월",
  "3m": "3개월",
  "6m": "6개월",
  "1y": "1년",
  all: "전체",
};

function filterByPeriod(data: ForeignEntry[], period: Period): ForeignEntry[] {
  if (period === "all" || data.length === 0) return data;
  const now = new Date();
  const start = new Date(now);
  if (period === "1m") start.setMonth(start.getMonth() - 1);
  else if (period === "3m") start.setMonth(start.getMonth() - 3);
  else if (period === "6m") start.setMonth(start.getMonth() - 6);
  else if (period === "1y") start.setFullYear(start.getFullYear() - 1);
  const startStr = start.toISOString().split("T")[0];
  return data.filter((e) => e.date >= startStr);
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
          외국인 지분율, 이렇게 읽으세요
        </h2>

        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">
            외국인 지분율이 뭔가요?
          </h3>
          <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            <li>전체 주식 중 외국인이 갖고 있는 비율이에요.</li>
            <li>
              삼성전자 51%라면 주식의 절반 이상을 외국인이 갖고 있다는
              뜻이에요.
            </li>
          </ul>
        </section>

        <hr className="my-5 border-border" />

        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">왜 중요한가요?</h3>
          <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            <li>
              외국인은 대부분 글로벌 기관투자자(펀드, 연기금 등)예요.
            </li>
            <li>
              이들은 단순 뉴스가 아니라 기업의 실적, 글로벌 경기, 환율을
              종합적으로 보고 움직여요.
            </li>
            <li>
              그래서 외국인이 사면 &ldquo;똑똑한 돈이 들어온다&rdquo;,
              팔면 &ldquo;뭔가 불안하다&rdquo;는 신호로 읽혀요.
            </li>
          </ul>
        </section>

        <hr className="my-5 border-border" />

        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">
            단기 뉴스를 믿으면 안 되는 이유
          </h3>
          <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            <li>
              &ldquo;외국인 5일 연속 순매수!&rdquo;라는 뉴스가 있어도,
              그 전에 대량 매도가 있었다면 전체 흐름은 여전히 매도세일 수
              있어요.
            </li>
            <li>그래서 1개월, 3개월, 6개월 흐름을 봐야 해요.</li>
          </ul>
        </section>

        <hr className="my-5 border-border" />

        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">어떻게 읽나요?</h3>
          <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
              <span className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-green-500" />
              <span>
                지분율 꾸준히 상승 &rarr; 외국인이 이 종목을 계속 사고
                있다 &rarr; 긍정 신호
              </span>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
              <span className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
              <span>
                지분율 꾸준히 하락 &rarr; 외국인이 팔고 있다 &rarr; 주의
                신호
              </span>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
              <span className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-yellow-500" />
              <span>
                갑자기 급락 &rarr; 뭔가 큰 이슈가 있을 수 있다 &rarr;
                원인 확인 필요
              </span>
            </div>
          </div>
        </section>

        <hr className="my-5 border-border" />

        <section>
          <h3 className="mb-2 text-base font-semibold">주의할 점</h3>
          <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            <li>외국인이 산다고 무조건 오르는 건 아니에요.</li>
            <li>보조 지표로 활용하고, 기업 실적과 함께 봐야 해요.</li>
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

  // X-axis labels — show year for long ranges
  const firstDate = data[0].date;
  const lastDate = data[data.length - 1].date;
  const spanYears =
    Number(lastDate.slice(0, 4)) - Number(firstDate.slice(0, 4));
  const showYear = spanYears >= 1 || data.length > 250;

  const step = Math.max(1, Math.floor(data.length / 4));
  const xTicks: { label: string; x: number }[] = [];
  for (let i = 0; i < data.length; i += step) {
    const x = PL + (i / (data.length - 1)) * chartW;
    const d = data[i].date;
    xTicks.push({
      label: showYear ? d.slice(2, 7) : d.slice(5),
      x,
    });
  }
  // always include last
  if (xTicks.length > 0) {
    const lastX = PL + chartW;
    xTicks.push({
      label: showYear ? lastDate.slice(2, 7) : lastDate.slice(5),
      x: lastX,
    });
  }

  const latest = data[data.length - 1];
  const highest = data.reduce((a, b) => (a.ratio > b.ratio ? a : b));
  const lowest = data.reduce((a, b) => (a.ratio < b.ratio ? a : b));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
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
        <polyline
          points={points}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex gap-4 mt-3 text-xs text-muted-foreground justify-center flex-wrap">
        <span>
          현재:{" "}
          <strong className="text-foreground">
            {latest.ratio.toFixed(2)}%
          </strong>
        </span>
        <span>
          최고:{" "}
          <strong className="text-foreground">
            {highest.ratio.toFixed(2)}%
          </strong>{" "}
          ({highest.date})
        </span>
        <span>
          최저:{" "}
          <strong className="text-foreground">
            {lowest.ratio.toFixed(2)}%
          </strong>{" "}
          ({lowest.date})
        </span>
        <span>
          기간: {firstDate} ~ {lastDate} ({data.length}일)
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
  const [fullData, setFullData] = useState<ForeignEntry[]>(stock.data);
  const [loading, setLoading] = useState(false);

  // Fetch ALL data once on open
  useEffect(() => {
    setLoading(true);
    fetch(`/api/foreign-ownership?ticker=${stock.ticker}`)
      .then((r) => r.json())
      .then((json) => {
        const s = json.stocks?.[0];
        if (s && s.data.length > 0) setFullData(s.data);
      })
      .finally(() => setLoading(false));
  }, [stock.ticker]);

  // Client-side period filtering
  const visibleData = useMemo(
    () => filterByPeriod(fullData, period),
    [fullData, period]
  );

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

        <div className="flex gap-2 mb-4 flex-wrap">
          {(["1m", "3m", "6m", "1y", "all"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-sm rounded-md border transition-colors ${
                period === p
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            로딩 중...
          </div>
        ) : (
          <DetailChart data={visibleData} />
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
    const idx = Math.max(0, data.length - 1 - daysAgo);
    const old = data[idx].ratio;
    if (current === null) return null;
    return current - old;
  }

  const change1m = getChange(20);
  const change3m = getChange(60);
  const change6m = getChange(120);

  // Sparkline uses last 6 months of data
  const spark6m = filterByPeriod(data, "6m");
  const sparkData = spark6m.map((d) => d.ratio);
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
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/foreign-ownership?market=${market}`)
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
            외국인 지분율 추적
          </h1>
          <p className="text-muted-foreground text-sm">
            코스피 · 코스닥 상위 종목의 외국인 보유 비율 변화를 추적합니다
            <span className="ml-2 inline-block">
              <button
                onClick={() => setShowGuide(true)}
                className="guide-btn inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-all"
              >
                <HelpCircle size={13} />
                외국인 지분율 보는 법
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

      {/* Guide Modal */}
      {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}
    </div>
  );
}
