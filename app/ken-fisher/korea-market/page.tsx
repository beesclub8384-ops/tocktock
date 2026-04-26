"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { HelpCircle, X, ArrowRight, AlertTriangle, ExternalLink } from "lucide-react";
import { useDraggable } from "@/hooks/useDraggable";
import { useResizable } from "@/hooks/useResizable";
import type {
  MarketAttractiveness,
  StockAnalysis,
  ScreeningResult,
  Verdict,
} from "@/lib/korea-market-engine";

// ── 샘플 종목 빠른 선택 ──
const SAMPLES = [
  { q: "005930", display: "005930 삼성전자" },
  { q: "000660", display: "000660 SK하이닉스" },
  { q: "035420", display: "035420 NAVER" },
  { q: "042660", display: "042660 한화오션" },
  { q: "086520", display: "086520 에코프로" },
  { q: "247540", display: "247540 에코프로비엠" },
];

const VERDICT_META: Record<Verdict, { color: string; bg: string; label: string; emoji: string }> = {
  attractive:   { color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", label: "매력적",  emoji: "🟢" },
  neutral:      { color: "text-amber-700",   bg: "bg-amber-50 border-amber-200",     label: "중립",    emoji: "🟡" },
  unattractive: { color: "text-rose-700",    bg: "bg-rose-50 border-rose-200",       label: "비매력",  emoji: "🔴" },
};

function fmtPct(v: number | null | undefined, d = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(d)}%`;
}
function fmtSpread(v: number | null | undefined, d = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(d)}%p`;
}
function fmtKRW(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}조원`;
  if (abs >= 1e8) return `${sign}${Math.round(abs / 1e8).toLocaleString()}억원`;
  return `${sign}${Math.round(abs).toLocaleString()}원`;
}
function fmtPrice(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${Math.round(v).toLocaleString()}원`;
}

export default function KoreaMarketPage() {
  const [showGuide, setShowGuide] = useState(false);
  const [market, setMarket] = useState<MarketAttractiveness | null>(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState<string | null>(null);

  // 시장 매력도 자동 로드
  useEffect(() => {
    fetch("/api/korea-market?type=market")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setMarketError(d.error);
        else setMarket(d as MarketAttractiveness);
      })
      .catch((e) => setMarketError(String(e?.message ?? e)))
      .finally(() => setMarketLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      {/* HEADER */}
      <header className="mb-8">
        <p className="text-xs font-medium text-muted-foreground tracking-wider uppercase mb-2">
          Ken Fisher · 한국 시장 도구
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          한국 시장 매력도 <span className="text-base font-normal text-muted-foreground">(참고용)</span>
        </h1>
        <p className="mt-2 text-lg sm:text-xl text-muted-foreground font-medium">
          이익수익률 vs 한국 10년물 국채
        </p>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          켄 피셔의 &ldquo;주식 vs 채권&rdquo; 분석법을 한국 시장에 자동 적용합니다.
          <strong className="text-foreground"> 이익수익률(1/PER)</strong>이 국채 금리보다 충분히 높으면 주식이 매력적,
          비슷하거나 낮으면 주식의 상대 매력이 떨어집니다.
          <span className="ml-2 inline-block">
            <button
              onClick={() => setShowGuide(true)}
              className="guide-btn inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-all"
            >
              <HelpCircle size={13} />
              한국 시장 매력도 보는 법
            </button>
          </span>
        </p>
      </header>

      {/* 1. 시장 매력도 */}
      <section className="mb-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-bold">시장 매력도</h2>
          {market && (
            <span className="text-xs text-muted-foreground">
              한국 10년물 {market.bond.yieldPct.toFixed(2)}% (FRED, {market.bond.asOfDate})
            </span>
          )}
        </div>
        {marketLoading && (
          <div className="rounded-lg border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            시장 평균 PER 계산 중...
          </div>
        )}
        {marketError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            ⚠️ 시장 데이터 로드 실패: {marketError}
          </div>
        )}
        {market && (
          <div className="grid gap-4 md:grid-cols-2">
            <MarketCard
              title="코스피"
              avg={market.kospi.weightedEarningsYieldPct}
              pe={market.kospi.weightedPE}
              bond={market.bond.yieldPct}
              spread={market.kospi.spreadVsBondPct}
              verdict={market.kospi.verdict}
              sampleSize={market.kospi.sampleSize}
            />
            <MarketCard
              title="코스닥"
              avg={market.kosdaq.weightedEarningsYieldPct}
              pe={market.kosdaq.weightedPE}
              bond={market.bond.yieldPct}
              spread={market.kosdaq.spreadVsBondPct}
              verdict={market.kosdaq.verdict}
              sampleSize={market.kosdaq.sampleSize}
            />
          </div>
        )}
      </section>

      {/* 2. 개별 종목 분석 */}
      <StockAnalysisSection />

      {/* 3. 자동 스크리닝 */}
      <ScreeningSection />

      {/* 면책 (강조) */}
      <section className="mt-8 rounded-lg border border-zinc-300 bg-zinc-50 p-5">
        <div className="mb-2 font-semibold text-zinc-900">⚠️ 이 도구는 참고용입니다</div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700">
          <li>이 페이지의 모든 결과는 매수/매도 추천이 아닙니다.</li>
          <li>이익수익률(1/PER) 한 가지 지표만으로 투자 결정을 내려서는 안 됩니다.</li>
          <li>한국 시장 평균 PER은 시가총액 상위 30개 종목의 가중평균이며, 전체 시장과 차이가 있을 수 있습니다.</li>
          <li>한국 10년물 국채 금리는 FRED(월별)이라 실시간 시세와 약간의 시차가 있습니다.</li>
          <li>각 종목별로 <Link href="/ken-fisher/dcf-calculator" className="underline hover:text-foreground">DCF 계산기</Link> + 개별 산업/재무 분석 병행 필수.</li>
          <li>모든 투자 판단의 책임은 투자자 본인에게 있습니다.</li>
        </ul>
      </section>

      {/* 보는 법 모달 */}
      {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}
    </div>
  );
}

// ── 시장 매력도 카드 ──
function MarketCard({
  title, avg, pe, bond, spread, verdict, sampleSize,
}: {
  title: string;
  avg: number;
  pe: number;
  bond: number;
  spread: number;
  verdict: Verdict;
  sampleSize: number;
}) {
  const meta = VERDICT_META[verdict];
  return (
    <div className={`rounded-lg border p-5 ${meta.bg}`}>
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-bold">{title}</h3>
        <span className={`text-sm font-semibold ${meta.color}`}>
          {meta.emoji} {meta.label}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">평균 이익수익률</div>
          <div className="text-xl font-bold tabular-nums">{fmtPct(avg)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">평균 PER</div>
          <div className="text-xl font-bold tabular-nums">{pe.toFixed(1)}배</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">국채 10년물</div>
          <div className="text-base font-medium tabular-nums">{fmtPct(bond)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">스프레드 (EY − 금리)</div>
          <div className={`text-base font-bold tabular-nums ${meta.color}`}>{fmtSpread(spread)}</div>
        </div>
      </div>
      <div className="mt-3 text-[11px] text-muted-foreground">
        시가총액 상위 {sampleSize}개 종목의 시총 가중평균 (적자/이상치 제외)
      </div>
    </div>
  );
}

// ── 개별 종목 분석 섹션 ──
function StockAnalysisSection() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StockAnalysis | null>(null);

  const run = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await fetch(`/api/korea-market?type=stock&symbol=${encodeURIComponent(q.trim())}`);
      const d = await r.json();
      if (!r.ok || d.error) setError(d.error ?? "조회 실패");
      else setResult(d as StockAnalysis);
    } catch (e) { setError(String((e as Error)?.message ?? e)); }
    finally { setLoading(false); }
  }, []);

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-bold">개별 종목 분석</h2>
      </div>
      <div className="rounded-lg border border-border bg-card p-5">
        <form
          onSubmit={(e) => { e.preventDefault(); run(input); }}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="6자리 종목 코드 (예: 005930)"
            className="flex-1 rounded-md border border-input bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
          >
            {loading ? "분석 중..." : "분석"}
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {SAMPLES.map((s) => (
            <button
              key={s.q}
              onClick={() => { setInput(s.q); run(s.q); }}
              disabled={loading}
              className="rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-accent disabled:opacity-50"
            >
              {s.display}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          ⚠️ {error}
        </div>
      )}

      {result && <StockResultCard result={result} />}
    </section>
  );
}

function StockResultCard({ result }: { result: StockAnalysis }) {
  const { snapshot: s, bond, marketAvg, spreadVsBondPct, spreadVsMarketPct, verdictVsBond, verdictVsMarket, notes } = result;
  const finalVerdict = verdictVsBond ?? "neutral";
  const meta = VERDICT_META[finalVerdict];

  return (
    <div className="mt-4 rounded-lg border border-border bg-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{s.resolvedSymbol}</div>
          <div className="text-xl font-bold">{s.name ?? s.resolvedSymbol}</div>
          {s.industry && <div className="text-xs text-muted-foreground">{s.industry}</div>}
          {s.cyclicalLabel && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              <AlertTriangle size={11} />
              {s.cyclicalLabel} (사이클 산업)
            </span>
          )}
        </div>
        {s.eps != null && s.eps > 0 ? (
          <div className={`shrink-0 rounded-lg border px-4 py-3 ${meta.bg}`}>
            <div className="text-xs text-muted-foreground">vs 국채 판정</div>
            <div className={`text-base font-bold ${meta.color}`}>
              {meta.emoji} {meta.label}
            </div>
          </div>
        ) : (
          <div className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
            <div className="text-xs text-rose-700">⚠️ 적자 회사</div>
            <div className="text-xs text-rose-700">이익수익률 비교 불가</div>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <KV label="현재가" value={fmtPrice(s.price)} />
        <KV label="시가총액" value={fmtKRW(s.marketCap)} />
        <KV label="EPS" value={s.eps != null ? `${Math.round(s.eps).toLocaleString()}원` : "—"} />
        <KV label="PER" value={s.pe != null ? `${s.pe.toFixed(2)}배` : "—"} />
        <KV label="이익수익률" value={fmtPct(s.earningsYieldPct)} highlight />
        <KV label="PBR" value={s.pbr != null ? `${s.pbr.toFixed(2)}배` : "—"} />
      </div>

      {s.eps != null && s.eps > 0 && (
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div className={`rounded-md border p-3 ${VERDICT_META[verdictVsBond ?? "neutral"].bg}`}>
            <div className="text-xs text-muted-foreground">vs 한국 10년물 ({bond.yieldPct.toFixed(2)}%)</div>
            <div className={`text-lg font-bold tabular-nums ${VERDICT_META[verdictVsBond ?? "neutral"].color}`}>
              {fmtSpread(spreadVsBondPct)}
            </div>
          </div>
          <div className={`rounded-md border p-3 ${VERDICT_META[verdictVsMarket ?? "neutral"].bg}`}>
            <div className="text-xs text-muted-foreground">
              vs {s.market === "kospi" ? "코스피 평균" : s.market === "kosdaq" ? "코스닥 평균" : "시장 평균"}
              {marketAvg && ` (${marketAvg.weightedEarningsYieldPct.toFixed(2)}%)`}
            </div>
            <div className={`text-lg font-bold tabular-nums ${VERDICT_META[verdictVsMarket ?? "neutral"].color}`}>
              {fmtSpread(spreadVsMarketPct)}
            </div>
          </div>
        </div>
      )}

      {notes.length > 0 && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <ul className="list-disc space-y-1 pl-5">
            {notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <Link
          href={`/ken-fisher/dcf-calculator`}
          className="inline-flex items-center gap-1 text-sm text-blue-600 underline hover:text-blue-700"
        >
          이 종목의 DCF 가치 평가 보기 <ExternalLink size={12} />
        </Link>
        <span className="ml-2 text-xs text-muted-foreground">
          (DCF 페이지에서 {s.resolvedSymbol.replace(/\.[A-Z]{2,3}$/, "")} 입력)
        </span>
      </div>
    </div>
  );
}

function KV({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-semibold tabular-nums ${highlight ? "text-base" : "text-sm"}`}>{value}</div>
    </div>
  );
}

// ── 자동 스크리닝 섹션 ──
function ScreeningSection() {
  const [tab, setTab] = useState<"kospi" | "kosdaq">("kospi");
  const [data, setData] = useState<Record<string, ScreeningResult>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (m: "kospi" | "kosdaq") => {
    if (data[m]) return;
    setLoading((p) => ({ ...p, [m]: true }));
    setError(null);
    try {
      const r = await fetch(`/api/korea-market?type=screening&market=${m}&top=10`);
      const d = await r.json();
      if (!r.ok || d.error) setError(d.error ?? "스크리닝 실패");
      else setData((p) => ({ ...p, [m]: d as ScreeningResult }));
    } catch (e) { setError(String((e as Error)?.message ?? e)); }
    finally { setLoading((p) => ({ ...p, [m]: false })); }
  }, [data]);

  useEffect(() => { load(tab); }, [tab, load]);

  const current = data[tab];

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-bold">자동 스크리닝 — 이익수익률 TOP 10</h2>
        {current && (
          <span className="text-xs text-muted-foreground">
            {current.market === "kospi" ? "코스피" : "코스닥"} 시총 상위 30개 중 안전 필터 통과
          </span>
        )}
      </div>

      {/* 강력한 경고 */}
      <div className="mb-4 rounded-lg border-2 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="mb-1 flex items-center gap-2 font-semibold">
          <AlertTriangle size={16} />
          이 리스트는 매수 추천이 아닙니다
        </div>
        <ul className="list-disc space-y-0.5 pl-7 text-xs">
          <li>이익수익률만 보고 매수 결정 금지 — 사이클 산업은 PER이 가장 낮을 때 가장 위험합니다.</li>
          <li>각 종목별로 DCF 계산기 + 개별 검토 필수.</li>
          <li>적자 / 시총 1,000억 미만 / PER 이상치는 자동 제외됨 — 그래도 안전 보증 안 됨.</li>
        </ul>
      </div>

      {/* 탭 */}
      <div className="mb-3 flex gap-2">
        {(["kospi", "kosdaq"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setTab(m)}
            className={`px-4 py-2 text-sm font-medium rounded-md border transition-colors ${
              tab === m
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background hover:bg-accent"
            }`}
          >
            {m === "kospi" ? "코스피 TOP 10" : "코스닥 TOP 10"}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">⚠️ {error}</div>
      )}

      {(loading[tab] && !current) && (
        <div className="rounded-lg border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
          첫 호출은 시총 상위 30개 종목의 PER을 모두 가져와 5초 정도 걸릴 수 있습니다...
        </div>
      )}

      {current && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">#</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">종목명</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">이익수익률</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">PER</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">vs 국채</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">vs 시장</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">표시</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">상세</th>
                </tr>
              </thead>
              <tbody>
                {current.rows.map((r) => {
                  const m = VERDICT_META[r.verdict];
                  return (
                    <tr key={r.symbol} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{r.rank}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.name}</div>
                        <div className="text-[11px] text-muted-foreground">{r.symbol}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.earningsYieldPct.toFixed(2)}%</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.pe.toFixed(1)}배</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-medium ${m.color}`}>
                        {fmtSpread(r.spreadVsBondPct, 1)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {fmtSpread(r.spreadVsMarketPct, 1)}
                      </td>
                      <td className="px-3 py-2">
                        {r.cyclicalLabel ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">
                            <AlertTriangle size={10} />
                            {r.cyclicalLabel}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Link
                          href={`/ken-fisher/dcf-calculator`}
                          className="inline-flex items-center gap-0.5 text-xs text-blue-600 hover:underline"
                          title="DCF 계산기로 이동"
                        >
                          DCF <ArrowRight size={10} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {current.rows.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              안전 필터를 통과한 종목이 없습니다 (필터 제외 {current.filteredOutCount}개)
            </div>
          )}
        </div>
      )}

      <div className="mt-3 text-xs text-muted-foreground">
        ※ 캐시 24시간. 시가총액 상위 30개 종목 중 적자/PER이상치/시총 1,000억 미만 제외 후 이익수익률 내림차순.
      </div>
    </section>
  );
}

// ── 보는 법 모달 ──
function GuideModal({ onClose }: { onClose: () => void }) {
  const { position, handleMouseDown } = useDraggable();
  const { size, handleResizeMouseDown } = useResizable();

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        data-draggable-modal
        className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
          ...(size.width ? { width: size.width, height: size.height } : { width: "100%", maxWidth: "44rem" }),
        }}
      >
        <div className="overflow-y-auto p-6 sm:p-8" style={{ maxHeight: size.height ? size.height - 2 : "85vh" }}>
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
            한국 시장 매력도, 이렇게 읽으세요
          </h2>

          <section className="mb-6">
            <h3 className="mb-2 text-base font-semibold">이 도구가 뭐예요?</h3>
            <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
              <li>켄 피셔의 <strong className="text-foreground">&ldquo;주식 vs 채권&rdquo;</strong> 분석법을 한국 시장에 자동으로 적용한 도구입니다.</li>
              <li><strong className="text-foreground">이익수익률(1/PER)</strong>은 주식을 샀을 때 기대되는 연간 수익률.</li>
              <li>이걸 <strong className="text-foreground">국채 금리</strong>와 비교해서 &ldquo;주식이 채권보다 더 매력적인가?&rdquo;를 봅니다.</li>
              <li className="text-amber-700">⚠️ 단, 참고용입니다. 매수/매도 신호가 아닙니다.</li>
            </ul>
          </section>

          <hr className="my-5 border-border" />

          <section className="mb-6">
            <h3 className="mb-2 text-base font-semibold">핵심 용어</h3>
            <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <strong className="text-foreground">이익수익률(Earnings Yield)</strong> = 1 ÷ PER × 100. PER 10배면 이익수익률 10%.
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <strong className="text-foreground">스프레드</strong> = 이익수익률 − 비교 대상. 양수 클수록 주식 매력 ↑.
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <strong className="text-foreground">시장 평균 PER</strong>: 코스피/코스닥 시가총액 상위 30개의 시총 가중평균. 적자·이상치 제외.
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <strong className="text-foreground">한국 10년물 국채</strong>: FRED의 IRLTLT01KRM156N (월별 갱신).
              </div>
            </div>
          </section>

          <hr className="my-5 border-border" />

          <section className="mb-6">
            <h3 className="mb-2 text-base font-semibold">판정 기준 (3단계)</h3>
            <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                🟢 <strong className="text-foreground">매력적</strong> — 스프레드 ≥ +5%p (주식이 채권보다 5%p 이상 더 벌어줌)
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                🟡 <strong className="text-foreground">중립</strong> — 스프레드 0 ~ +5%p (애매. 다른 지표 함께 봐야 함)
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                🔴 <strong className="text-foreground">비매력</strong> — 스프레드 &lt; 0 (채권이 더 매력적인 구간 = &ldquo;죽음의 키스&rdquo;)
              </div>
            </div>
          </section>

          <hr className="my-5 border-border" />

          <section className="mb-6">
            <h3 className="mb-2 text-base font-semibold">시장 매력도 보는 법</h3>
            <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
              <li>코스피와 코스닥을 따로 봅니다.</li>
              <li>둘 다 🟢이면 한국 주식 시장 전반이 채권보다 매력적인 구간.</li>
              <li>한쪽만 🟢이면 그쪽 시장이 더 매력적이라는 신호일 수 있음.</li>
              <li>둘 다 🔴이면 채권이 주식보다 매력적인 시기. 1987·2000·2007 같은 고점 직전 패턴.</li>
            </ul>
          </section>

          <hr className="my-5 border-border" />

          <section className="mb-6">
            <h3 className="mb-2 text-base font-semibold">개별 종목 분석 활용</h3>
            <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
              <li><strong className="text-foreground">vs 국채</strong>가 양수 클수록 종목 매력 ↑ (켄 피셔식 1차 필터).</li>
              <li><strong className="text-foreground">vs 시장 평균</strong>이 양수면 시장 대비 저평가, 음수면 시장 대비 고평가.</li>
              <li>적자 회사는 PER이 음수 → 비교 자체 불가. ⚠️ 표시.</li>
              <li>사이클 산업(조선/해운/건설/철강 등)은 별도 ⚠️ 배지. <strong>PER이 가장 낮을 때가 가장 위험한 시점</strong>일 수 있음.</li>
              <li>각 종목은 <Link href="/ken-fisher/dcf-calculator" className="underline" onClick={onClose}>DCF 계산기</Link>에서 더 깊게 평가.</li>
            </ul>
          </section>

          <hr className="my-5 border-border" />

          <section className="mb-6">
            <h3 className="mb-2 text-base font-semibold">스크리닝 주의사항</h3>
            <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
              <li>이 리스트는 <strong className="text-rose-700">절대 매수 추천이 아닙니다</strong>.</li>
              <li>이익수익률이 높은 종목 = 일반적으로 PER이 낮은 종목 = 시장이 미래 이익에 의문을 갖는 종목인 경우가 많습니다.</li>
              <li>특히 사이클 산업(조선·해운·건설)은 <strong>호황 정점에 PER이 가장 낮음</strong>. 이걸 &ldquo;싸다&rdquo;고 사면 사이클 하락의 시작에 매수하는 함정.</li>
              <li>각 종목별 산업/실적 흐름을 따로 검증한 뒤 판단하세요.</li>
            </ul>
          </section>

          <hr className="my-5 border-border" />

          <section className="mb-6">
            <h3 className="mb-2 text-base font-semibold">더 알고 싶다면</h3>
            <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
              <li>
                <Link href="/ken-fisher" className="underline" onClick={onClose}>S&amp;P × Nasdaq · 가격 vs PER</Link> — 미국 시장 밸류에이션
              </li>
              <li>
                <Link href="/ken-fisher/earnings-yield-vs-bond" className="underline" onClick={onClose}>이익수익률 vs 10년물</Link> — 미국 주식 vs 채권 (역사)
              </li>
              <li>
                <Link href="/ken-fisher/dcf-calculator" className="underline" onClick={onClose}>DCF 가치 계산기</Link> — 종목 단위 가치 평가
              </li>
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
