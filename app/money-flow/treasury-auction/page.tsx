"use client";

import { useEffect, useState, useCallback } from "react";
import { HelpCircle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

// ─── 타입 ────────────────────────────────────────────────────────────────────
interface AuctionItem {
  cusip: string; securityType: string; term: string; auctionDate: string;
  maturityDate: string; offeringAmount: string; highYield: string;
  highDiscountRate: string; highInvestmentRate: string; bidToCoverRatio: string;
  totalTendered: string; totalAccepted: string; indirectBidderAccepted: string;
  interestRate: string; tips: string; floatingRate: string;
}
interface AuctionData { upcoming: AuctionItem[]; results: AuctionItem[]; updatedAt: string; }
interface HistoryPoint { date: string; rate: number | null; bidToCover: number | null; }
interface MarketReaction {
  date: string;
  indicators: Record<string, { name: string; d1: number | null; d3: number | null; d5: number | null }>;
}
type Tab = "results" | "upcoming";
type Filter = "전체" | "Bill" | "Note" | "Bond";
type SecurityCategory = "Bill" | "Note" | "Bond";
type Period = "1y" | "3y" | "5y" | "all";

// ─── 상수 ────────────────────────────────────────────────────────────────────
const FILTERS: Filter[] = ["전체", "Bill", "Note", "Bond"];
const TERM_MAP: Record<SecurityCategory, string[]> = {
  Bill: ["4-Week", "8-Week", "13-Week", "17-Week", "26-Week", "52-Week"],
  Note: ["2-Year", "3-Year", "5-Year", "7-Year", "10-Year"],
  Bond: ["20-Year", "30-Year"],
};
const PERIOD_LABELS: { key: Period; label: string }[] = [
  { key: "1y", label: "1년" }, { key: "3y", label: "3년" },
  { key: "5y", label: "5년" }, { key: "all", label: "전체" },
];

// ─── 유틸 함수 ───────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function fmtBillions(val: string) {
  if (!val) return "-";
  const n = Number(val);
  return isNaN(n) ? "-" : `$${Math.round(n/1e8).toLocaleString()}억`;
}
function fmtRate(item: AuctionItem) {
  if (item.securityType === "Bill") return item.highDiscountRate ? `${Number(item.highDiscountRate).toFixed(3)}%` : "-";
  return item.highYield ? `${Number(item.highYield).toFixed(3)}%` : "-";
}
function fmtBtc(val: string) { const n = Number(val); return (!val || isNaN(n)) ? "-" : n.toFixed(2); }
function fmtForeignPct(item: AuctionItem) {
  const a = Number(item.totalAccepted), i = Number(item.indirectBidderAccepted);
  return (!a || isNaN(i)) ? "-" : `${((i/a)*100).toFixed(1)}%`;
}
function foreignPctNum(item: AuctionItem): number | null {
  const a = Number(item.totalAccepted), i = Number(item.indirectBidderAccepted);
  return (!a || isNaN(i)) ? null : (i/a)*100;
}
function termLabel(item: AuctionItem) {
  const p = item.securityType === "Bill" ? "📄" : item.securityType === "Bond" ? "📕" : "📘";
  let s = ""; if (item.tips === "Yes") s = " (TIPS)"; else if (item.floatingRate === "Yes") s = " (FRN)";
  return `${p} ${item.term}${s}`;
}
function btcDot(val: string) {
  const n = Number(val);
  if (isNaN(n)||!val) return "bg-zinc-400";
  if (n >= 2.5) return "bg-emerald-500";
  if (n >= 2.0) return "bg-yellow-500";
  return "bg-red-500";
}
function btcText(val: string) {
  const n = Number(val);
  if (isNaN(n)||!val) return { label: "-", cls: "text-muted-foreground" };
  if (n >= 2.5) return { label: "강함", cls: "text-emerald-500" };
  if (n >= 2.0) return { label: "보통", cls: "text-yellow-500" };
  return { label: "약함", cls: "text-red-500" };
}
function foreignDot(item: AuctionItem) {
  const p = foreignPctNum(item);
  if (p === null) return "bg-zinc-400";
  if (p >= 65) return "bg-emerald-500";
  if (p >= 55) return "bg-yellow-500";
  return "bg-red-500";
}
function findByTermSorted(results: AuctionItem[], type: string, termInc: string) {
  return results.filter(r => r.securityType === type && r.term.includes(termInc))
    .sort((a,b) => new Date(b.auctionDate).getTime() - new Date(a.auctionDate).getTime());
}
function rateNum(item: AuctionItem): number {
  return Number(item.highYield || item.highDiscountRate || 0);
}
function fmtKST(iso: string) {
  if (!iso) return ""; return new Date(iso).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"});
}

// ─── 1섹션: 종합 신호판 ─────────────────────────────────────────────────────
interface Signal { emoji: string; text: string; type: "red" | "green"; }

function buildSignals(results: AuctionItem[]): Signal[] {
  const signals: Signal[] = [];
  const note10 = findByTermSorted(results, "Note", "10-Year");
  const note2 = findByTermSorted(results, "Note", "2-Year");
  const bond30 = findByTermSorted(results, "Bond", "30-Year");

  if (note10.length > 0) {
    const btc = Number(note10[0].bidToCoverRatio);
    const fp = foreignPctNum(note10[0]);
    if (!isNaN(btc) && btc < 2.0) signals.push({ emoji: "🔴", text: "10년물 수요 부진", type: "red" });
    if (!isNaN(btc) && btc >= 2.5) signals.push({ emoji: "🟢", text: "10년물 수요 강함", type: "green" });
    if (fp !== null && fp < 50) signals.push({ emoji: "🔴", text: "외국인 이탈", type: "red" });

    // 3회 연속 추세
    if (note10.length >= 3) {
      const b3 = note10.slice(0,3).map(r => Number(r.bidToCoverRatio));
      if (b3.every(v => !isNaN(v)) && b3[0] < b3[1] && b3[1] < b3[2])
        signals.push({ emoji: "🔴", text: "수요 약화 추세 (응찰배율 3회 연속↓)", type: "red" });

      const f3 = note10.slice(0,3).map(r => foreignPctNum(r));
      if (f3.every(v => v !== null) && (f3[0]!) < (f3[1]!) && (f3[1]!) < (f3[2]!))
        signals.push({ emoji: "🔴", text: "외국인 수요 약화 추세 (3회 연속↓)", type: "red" });
    }

    // 최악의 조합 / 강한 수요 확인
    if (note10.length >= 2) {
      const btcLow = !isNaN(btc) && btc < 2.0;
      const rateUp = rateNum(note10[0]) > rateNum(note10[1]);
      const btcHigh = !isNaN(btc) && btc >= 2.5;
      const rateDown = rateNum(note10[0]) < rateNum(note10[1]);
      if (btcLow && rateUp) signals.push({ emoji: "🔴", text: "최악의 조합: 수요↓ + 금리↑", type: "red" });
      if (btcHigh && rateDown) signals.push({ emoji: "🟢", text: "강한 수요 확인: 수요↑ + 금리↓", type: "green" });
    }
  }

  if (bond30.length > 0) {
    const btc = Number(bond30[0].bidToCoverRatio);
    if (!isNaN(btc) && btc < 2.0) signals.push({ emoji: "🔴", text: "30년물 수요 부진", type: "red" });
  }

  // 장단기 금리 역전
  if (note2.length > 0 && note10.length > 0) {
    if (rateNum(note2[0]) > rateNum(note10[0]))
      signals.push({ emoji: "🔴", text: "장단기 금리 역전 (2Y > 10Y)", type: "red" });
  }

  return signals;
}

function SignalPanel({ results }: { results: AuctionItem[] }) {
  const signals = buildSignals(results);
  const hasRed = signals.some(s => s.type === "red");
  const hasGreen = signals.some(s => s.type === "green");
  const status = hasRed ? { label: "경계", bg: "bg-red-500/10 border-red-500/30", text: "text-red-500" }
    : hasGreen ? { label: "양호", bg: "bg-emerald-500/10 border-emerald-500/30", text: "text-emerald-500" }
    : { label: "중립", bg: "bg-yellow-500/10 border-yellow-500/30", text: "text-yellow-500" };

  return (
    <div className={`rounded-lg border p-4 ${status.bg}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-sm font-bold ${status.text}`}>종합: {status.label}</span>
      </div>
      {signals.length === 0 ? (
        <p className="text-sm text-muted-foreground">🟡 현재 특이 신호 없음</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {signals.map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-card border border-border px-3 py-1 text-xs font-medium">
              {s.emoji} {s.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 2섹션: 최근 경매 요약 카드 ─────────────────────────────────────────────
function SummaryCard({ label, icon, items }: { label: string; icon: string; items: AuctionItem[] }) {
  if (items.length === 0) return null;
  const cur = items[0];
  const prev = items.length >= 2 ? items[1] : null;
  const rc = prev ? rateNum(cur) - rateNum(prev) : null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 min-w-[200px] flex-1">
      <div className="flex items-center gap-1.5 mb-3">
        <span>{icon}</span><span className="text-sm font-semibold truncate">{label}</span>
      </div>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">낙찰금리</span>
          <span className="font-medium tabular-nums">
            {fmtRate(cur)}
            {rc !== null && (
              <span className={`text-xs ml-1 ${rc > 0 ? "text-red-500" : rc < 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
                {rc > 0 ? "▲" : rc < 0 ? "▼" : "—"}{Math.abs(rc).toFixed(2)}
              </span>
            )}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">응찰배율</span>
          <span className="flex items-center gap-1 font-medium tabular-nums">
            {fmtBtc(cur.bidToCoverRatio)}
            <span className={`w-1.5 h-1.5 rounded-full ${btcDot(cur.bidToCoverRatio)}`} />
            <span className={`text-xs ${btcText(cur.bidToCoverRatio).cls}`}>{btcText(cur.bidToCoverRatio).label}</span>
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">외국인비중</span>
          <span className="flex items-center gap-1 font-medium tabular-nums">
            {fmtForeignPct(cur)}
            <span className={`w-1.5 h-1.5 rounded-full ${foreignDot(cur)}`} />
          </span>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground tabular-nums">{fmtDate(cur.auctionDate)}</p>
    </div>
  );
}

// ─── 3섹션: 시장 반응 패널 (행 펼침) ────────────────────────────────────────
function MarketReactionPanel({ auctionDate }: { auctionDate: string }) {
  const [data, setData] = useState<MarketReaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"d1"|"d3"|"d5">("d1");

  useEffect(() => {
    fetch(`/api/treasury-market-reaction?date=${auctionDate}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [auctionDate]);

  if (loading) return <div className="flex items-center justify-center py-4"><Loader2 size={16} className="animate-spin mr-2" /><span className="text-xs text-muted-foreground">시장 반응 조회 중...</span></div>;
  if (!data) return <p className="text-xs text-muted-foreground py-2">시장 반응 데이터를 불러오지 못했습니다.</p>;

  const tabLabels = { d1: "1일 후", d3: "3일 후", d5: "1주일 후" } as const;

  return (
    <div className="bg-muted/30 rounded-lg p-3 mt-2">
      <div className="flex gap-1 mb-3">
        {(["d1","d3","d5"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${tab === t ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
          >{tabLabels[t]}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {Object.values(data.indicators).map(ind => {
          const val = ind[tab];
          return (
            <div key={ind.name} className="text-xs">
              <span className="text-muted-foreground">{ind.name}</span>
              <span className={`ml-1.5 font-medium tabular-nums ${val === null ? "text-muted-foreground" : val > 0 ? "text-emerald-500" : val < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                {val === null ? "집계 중" : `${val > 0 ? "+" : ""}${val}%`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 4섹션: 시계열 차트 ─────────────────────────────────────────────────────
function AuctionHistoryChart() {
  const [category, setCategory] = useState<SecurityCategory>("Note");
  const [term, setTerm] = useState("10-Year");
  const [period, setPeriod] = useState<Period>("1y");
  const [data, setData] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ security_type: category, security_term: term, period });
      const res = await fetch(`/api/treasury-bill-history?${p}`);
      if (res.ok) { const j = await res.json(); setData(j.data || []); }
    } catch {} finally { setLoading(false); }
  }, [category, term, period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCat = (cat: SecurityCategory) => { setCategory(cat); setTerm(TERM_MAP[cat][0]); };
  const chartData = data.filter(d => d.rate !== null);

  // 평균 계산
  const avgRate = chartData.length > 0 ? chartData.reduce((s,d) => s + (d.rate ?? 0), 0) / chartData.length : null;
  const btcData = chartData.filter(d => d.bidToCover !== null);
  const avgBtc = btcData.length > 0 ? btcData.reduce((s,d) => s + (d.bidToCover ?? 0), 0) / btcData.length : null;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold mb-4">경매 낙찰금리 추이</h2>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {(Object.keys(TERM_MAP) as SecurityCategory[]).map(cat => (
          <button key={cat} onClick={() => handleCat(cat)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${category === cat ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-accent"}`}
          >{cat}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {TERM_MAP[category].map(t => (
          <button key={t} onClick={() => setTerm(t)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${term === t ? "bg-foreground/10 text-foreground border border-foreground/20" : "text-muted-foreground hover:text-foreground"}`}
          >{t}</button>
        ))}
      </div>
      <div className="flex gap-1.5 mb-4">
        {PERIOD_LABELS.map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${period === p.key ? "bg-foreground/10 text-foreground border border-foreground/20" : "text-muted-foreground hover:text-foreground"}`}
          >{p.label}</button>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 size={20} className="animate-spin mr-2" />데이터를 불러오는 중...</div>
        ) : chartData.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">해당 조건의 경매 데이터가 없습니다.</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 8, right: 48, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tickFormatter={d => d.slice(0,7).replace("-",".")} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" minTickGap={50} />
              <YAxis yAxisId="rate" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => `${v.toFixed(1)}%`} domain={["auto","auto"]} width={48} />
              <YAxis yAxisId="btc" orientation="right" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => v.toFixed(1)} domain={["auto","auto"]} width={40} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as HistoryPoint;
                return (<div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-xs">
                  <p className="font-medium">{p.date}</p>
                  <p className="text-muted-foreground">금리: <span className="text-foreground font-medium">{p.rate?.toFixed(3)}%</span></p>
                  <p className="text-muted-foreground">BtC: <span className="text-foreground font-medium">{p.bidToCover?.toFixed(2)}</span></p>
                </div>);
              }} />
              {avgRate !== null && <ReferenceLine yAxisId="rate" y={avgRate} stroke="#60a5fa" strokeDasharray="4 4" strokeOpacity={0.5} />}
              {avgBtc !== null && <ReferenceLine yAxisId="btc" y={avgBtc} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.5} />}
              <Line yAxisId="rate" type="monotone" dataKey="rate" stroke="#60a5fa" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
              <Line yAxisId="btc" type="monotone" dataKey="bidToCover" stroke="#f59e0b" strokeWidth={1} dot={false} activeDot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
        {chartData.length > 0 && (
          <div className="mt-2 flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-400 inline-block" /> 낙찰금리 {avgRate !== null && `(평균 ${avgRate.toFixed(2)}%)`}</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-500 inline-block" /> 응찰배율 {avgBtc !== null && `(평균 ${avgBtc.toFixed(2)})`}</span>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── 메인 페이지 ─────────────────────────────────────────────────────────────
export default function TreasuryAuctionPage() {
  const [data, setData] = useState<AuctionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("results");
  const [filter, setFilter] = useState<Filter>("전체");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/treasury-auction")
      .then(r => { if (!r.ok) throw new Error("API 오류"); return r.json(); })
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const sorted = data ? (tab === "results"
    ? [...data.results].sort((a,b) => new Date(b.auctionDate).getTime() - new Date(a.auctionDate).getTime())
    : [...data.upcoming].sort((a,b) => new Date(a.auctionDate).getTime() - new Date(b.auctionDate).getTime())
  ) : [];
  const filtered = filter === "전체" ? sorted : sorted.filter(i => i.securityType === filter);

  const toggleRow = (key: string) => setExpandedRow(prev => prev === key ? null : key);

  return (
    <main className="max-w-5xl mx-auto px-4 py-12 sm:px-8 sm:py-20">
      {/* 헤더 */}
      <header className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">미국채 경매</h1>
        <p className="mt-2 text-muted-foreground">미국 재무부 국채 경매 결과 및 시장 영향 분석</p>
        {data?.updatedAt && <p className="mt-1 text-xs text-muted-foreground">업데이트: {fmtKST(data.updatedAt)}</p>}
      </header>

      {/* 로딩 */}
      {loading && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border p-4 animate-pulse"><div className="h-4 w-32 bg-muted rounded mb-2" /><div className="h-3 w-full bg-muted rounded" /></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{[0,1,2].map(i => <div key={i} className="rounded-lg border border-border p-4 animate-pulse"><div className="h-4 w-20 bg-muted rounded mb-3" /><div className="space-y-2"><div className="h-3 w-full bg-muted rounded" /><div className="h-3 w-full bg-muted rounded" /></div></div>)}</div>
        </div>
      )}

      {error && <div className="py-20 text-center text-red-500">데이터를 불러오지 못했습니다: {error}</div>}

      {!loading && !error && data && (
        <>
          {/* 1섹션: 종합 신호판 */}
          <SignalPanel results={data.results} />

          {/* 2섹션: 최근 경매 요약 */}
          <div className="mt-6 flex gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible">
            {(() => {
              const note10Items = findByTermSorted(data.results, "Note", "10-Year");
              const note10Label = note10Items.length > 0 && note10Items[0].tips === "Yes" ? "10년물 TIPS" : "10년물";
              return <SummaryCard label={note10Label} icon="📘" items={note10Items} />;
            })()}
            <SummaryCard label="52-Week Bill" icon="📄" items={findByTermSorted(data.results, "Bill", "52-Week")} />
            <SummaryCard label="30-Year Bond" icon="📕" items={findByTermSorted(data.results, "Bond", "30-Year")} />
          </div>

          {/* 4섹션: 시계열 차트 */}
          <AuctionHistoryChart />

          {/* 3섹션: 경매 결과/예정 테이블 */}
          <section className="mt-8">
            <div className="flex gap-2 mb-4">
              {(["results","upcoming"] as Tab[]).map(t => (
                <button key={t} onClick={() => { setTab(t); setExpandedRow(null); }}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === t ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-accent"}`}
                >{t === "results" ? "경매 결과" : "예정 경매"}</button>
              ))}
            </div>
            <div className="flex gap-1.5 mb-4">
              {FILTERS.map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${filter === f ? "bg-foreground/10 text-foreground border border-foreground/20" : "text-muted-foreground hover:text-foreground"}`}
                >{f}</button>
              ))}
            </div>

            {filtered.length === 0 && <div className="py-16 text-center text-muted-foreground text-sm">해당 조건의 경매 데이터가 없습니다.</div>}

            {/* PC 테이블 */}
            {filtered.length > 0 && tab === "results" && (
              <div className="hidden sm:block rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium w-8"></th>
                    <th className="text-left px-4 py-3 font-medium">경매일</th>
                    <th className="text-left px-4 py-3 font-medium">종목</th>
                    <th className="text-right px-4 py-3 font-medium">낙찰금리</th>
                    <th className="text-right px-4 py-3 font-medium">응찰배율</th>
                    <th className="text-right px-4 py-3 font-medium">발행규모</th>
                    <th className="text-right px-4 py-3 font-medium">외국인비중</th>
                  </tr></thead>
                  <tbody>
                    {filtered.map(item => {
                      const key = item.cusip + item.auctionDate;
                      const isExpanded = expandedRow === key;
                      return (
                        <><tr key={key} onClick={() => toggleRow(key)} className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer">
                          <td className="px-4 py-3">{isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} className="text-muted-foreground" />}</td>
                          <td className="px-4 py-3 tabular-nums">{fmtDate(item.auctionDate)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{termLabel(item)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{fmtRate(item)}</td>
                          <td className="px-4 py-3 text-right tabular-nums"><span className="inline-flex items-center gap-1">{fmtBtc(item.bidToCoverRatio)}<span className={`w-1.5 h-1.5 rounded-full ${btcDot(item.bidToCoverRatio)}`} /></span></td>
                          <td className="px-4 py-3 text-right tabular-nums">{fmtBillions(item.offeringAmount)}</td>
                          <td className="px-4 py-3 text-right tabular-nums"><span className="inline-flex items-center gap-1">{fmtForeignPct(item)}<span className={`w-1.5 h-1.5 rounded-full ${foreignDot(item)}`} /></span></td>
                        </tr>
                        {isExpanded && <tr key={key+"-expand"}><td colSpan={7} className="px-4 py-2"><MarketReactionPanel auctionDate={item.auctionDate} /></td></tr>}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* 모바일 카드 */}
            {filtered.length > 0 && tab === "results" && (
              <div className="sm:hidden flex flex-col gap-3">
                {filtered.map(item => {
                  const key = item.cusip + item.auctionDate;
                  const isExpanded = expandedRow === key;
                  return (
                    <div key={key} className="rounded-lg border border-border bg-card">
                      <button onClick={() => toggleRow(key)} className="w-full text-left p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold">{termLabel(item)}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground tabular-nums">{fmtDate(item.auctionDate)}</span>
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} className="text-muted-foreground" />}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                          <div><p className="text-xs text-muted-foreground">낙찰금리</p><p className="text-sm font-medium tabular-nums">{fmtRate(item)}</p></div>
                          <div><p className="text-xs text-muted-foreground">응찰배율</p><p className="text-sm font-medium tabular-nums flex items-center gap-1">{fmtBtc(item.bidToCoverRatio)}<span className={`w-1.5 h-1.5 rounded-full ${btcDot(item.bidToCoverRatio)}`} /></p></div>
                          <div><p className="text-xs text-muted-foreground">발행규모</p><p className="text-sm font-medium tabular-nums">{fmtBillions(item.offeringAmount)}</p></div>
                          <div><p className="text-xs text-muted-foreground">외국인비중</p><p className="text-sm font-medium tabular-nums flex items-center gap-1">{fmtForeignPct(item)}<span className={`w-1.5 h-1.5 rounded-full ${foreignDot(item)}`} /></p></div>
                        </div>
                      </button>
                      {isExpanded && <div className="px-4 pb-4"><MarketReactionPanel auctionDate={item.auctionDate} /></div>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* 예정 PC */}
            {filtered.length > 0 && tab === "upcoming" && (
              <div className="hidden sm:block rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium">경매 예정일</th>
                    <th className="text-left px-4 py-3 font-medium">종목</th>
                    <th className="text-right px-4 py-3 font-medium">발행 예정 규모</th>
                  </tr></thead>
                  <tbody>
                    {filtered.map(item => (
                      <tr key={item.cusip+item.auctionDate} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="px-4 py-3 tabular-nums">{fmtDate(item.auctionDate)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{termLabel(item)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtBillions(item.offeringAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 예정 모바일 */}
            {filtered.length > 0 && tab === "upcoming" && (
              <div className="sm:hidden flex flex-col gap-3">
                {filtered.map(item => (
                  <div key={item.cusip+item.auctionDate} className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold">{termLabel(item)}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{fmtDate(item.auctionDate)}</span>
                    </div>
                    <div><p className="text-xs text-muted-foreground">발행 예정 규모</p><p className="text-sm font-medium tabular-nums">{fmtBillions(item.offeringAmount)}</p></div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 하단: 용어 설명 */}
          <section className="mt-12 rounded-lg border border-border bg-muted/30 p-6 space-y-4">
            <h2 className="text-sm font-semibold mb-3">용어 설명</h2>
            <dl className="space-y-3 text-sm text-muted-foreground">
              <div><dt className="font-medium text-foreground">응찰배율 (Bid-to-Cover Ratio)</dt><dd className="mt-0.5">총 응찰액 ÷ 발행 규모. <span className="text-emerald-500 font-medium">2.5 이상 양호</span>, <span className="text-red-500 font-medium">2.0 미만 부진</span>.</dd></div>
              <div><dt className="font-medium text-foreground">낙찰금리 (High Yield / Discount Rate)</dt><dd className="mt-0.5">경매에서 결정된 실제 금리. Note/Bond는 High Yield, Bill은 Discount Rate.</dd></div>
              <div><dt className="font-medium text-foreground">외국인비중 (Indirect Bidders)</dt><dd className="mt-0.5">간접입찰자 낙찰 비중. 외국 중앙은행·국부펀드 등 해외 기관 수요 지표.</dd></div>
              <div><dt className="font-medium text-foreground">장단기 금리 역전</dt><dd className="mt-0.5">2년물 금리가 10년물보다 높은 상태. 경기침체 선행 지표로 해석.</dd></div>
            </dl>
          </section>
        </>
      )}
    </main>
  );
}
