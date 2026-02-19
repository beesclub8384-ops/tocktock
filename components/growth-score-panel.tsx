"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Loader2, HelpCircle, X } from "lucide-react";
import type { GrowthScoreResult } from "@/lib/stock-score";

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-green-500";
  if (score >= 60) return "text-yellow-500";
  return "text-red-500";
}

function barColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-yellow-500";
  return "bg-red-500";
}

/* ────────────────────────────────────────────
   가이드 모달
   ──────────────────────────────────────────── */
function ScoreGuideModal({ onClose }: { onClose: () => void }) {
  // ESC 키로 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // 모달 열릴 때 배경 스크롤 방지
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
        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X size={20} />
        </button>

        <h2 className="mb-6 text-xl font-bold">종합 성장 점수 보는 법</h2>

        {/* 섹션1 */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">종합 성장 점수란?</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            기업이 &ldquo;얼마나 건강하게 성장하고 있는가&rdquo;를 100점 만점으로
            보여주는 지표입니다. 단순히 주가가 올랐는지가 아니라, 기업의 실제
            재무 데이터를 기반으로 &ldquo;이 회사가 진짜 성장하고
            있는가?&rdquo;를 판단합니다.
          </p>
        </section>

        <hr className="my-5 border-border" />

        {/* 섹션2 */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">
            어떤 데이터를 쓰나요?
          </h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Yahoo Finance에서 제공하는 해당 기업의 최근 2개년 연간
            재무제표(손익계산서, 대차대조표, 현금흐름표)를 사용합니다. 전년 대비
            올해가 어떻게 변했는지를 봅니다.
          </p>
        </section>

        <hr className="my-5 border-border" />

        {/* 섹션3 */}
        <section className="mb-6">
          <h3 className="mb-3 text-base font-semibold">
            5가지 지표 상세 설명
          </h3>

          <div className="space-y-5">
            {/* ① */}
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <h4 className="mb-1.5 text-sm font-semibold">
                ① 매출 성장률{" "}
                <span className="font-normal text-muted-foreground">
                  (가중치 30% — 가장 중요)
                </span>
              </h4>
              <ul className="space-y-1 text-sm leading-relaxed text-muted-foreground">
                <li>
                  <strong className="text-foreground">의미:</strong> 전년 대비
                  매출(총 매출액)이 몇 % 늘었는가
                </li>
                <li>
                  <strong className="text-foreground">왜 중요한가:</strong> 매출이
                  안 늘면 아무리 효율적이어도 기업은 커지지 않습니다. 투자자들이
                  가장 먼저 보는 숫자입니다.
                </li>
                <li>
                  <strong className="text-foreground">예시:</strong> 오라클 8.4%
                  &rarr; &ldquo;작년보다 8.4% 더 벌었다&rdquo;는 뜻. 테크
                  기업치고는 느린 편입니다.
                </li>
                <li>
                  <strong className="text-foreground">점수 기준:</strong> 0% 이하
                  &rarr; 0점, 30% 이상 &rarr; 100점, 그 사이는 비례 배분
                </li>
              </ul>
            </div>

            {/* ② */}
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <h4 className="mb-1.5 text-sm font-semibold">
                ② 영업이익률 변화{" "}
                <span className="font-normal text-muted-foreground">
                  (가중치 25%)
                </span>
              </h4>
              <ul className="space-y-1 text-sm leading-relaxed text-muted-foreground">
                <li>
                  <strong className="text-foreground">의미:</strong> 매출에서
                  원가와 운영비를 빼고 남는 비율이 전년 대비 얼마나
                  개선되었는가
                </li>
                <li>
                  <strong className="text-foreground">왜 중요한가:</strong> 매출이
                  늘어도 남는 게 없으면 의미가 없습니다. &ldquo;장사해서 남는
                  돈이 늘고 있는가?&rdquo;를 봅니다.
                </li>
                <li>
                  <strong className="text-foreground">예시:</strong> 오라클 30.3%
                  &rarr; 31.5% (1.1%p 개선) &rarr; &ldquo;100원 벌면 31.5원
                  남는다. 작년보다 1.1원 더 남게 됐다&rdquo;
                </li>
                <li>
                  <strong className="text-foreground">점수 기준:</strong> -5%p
                  이하 &rarr; 0점, +5%p 이상 &rarr; 100점
                </li>
              </ul>
            </div>

            {/* ③ */}
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <h4 className="mb-1.5 text-sm font-semibold">
                ③ R&D 집중도 변화{" "}
                <span className="font-normal text-muted-foreground">
                  (가중치 20%)
                </span>
              </h4>
              <ul className="space-y-1 text-sm leading-relaxed text-muted-foreground">
                <li>
                  <strong className="text-foreground">의미:</strong> 매출 중
                  연구개발(R&D)에 쓰는 비율이 전년 대비 늘었는가
                </li>
                <li>
                  <strong className="text-foreground">왜 중요한가:</strong>{" "}
                  오늘의 R&D가 내일의 매출입니다. R&D를 줄이면 단기 이익은
                  좋아지지만 미래 경쟁력을 잃습니다.
                </li>
                <li>
                  <strong className="text-foreground">예시:</strong> 오라클 16.8%
                  &rarr; 17.2% (0.3%p 증가) &rarr; &ldquo;미래 투자를 살짝
                  늘렸다&rdquo;
                </li>
                <li>
                  <strong className="text-foreground">점수 기준:</strong> -3%p
                  이하 &rarr; 0점, +3%p 이상 &rarr; 100점
                </li>
              </ul>
            </div>

            {/* ④ */}
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <h4 className="mb-1.5 text-sm font-semibold">
                ④ 인당 매출액 변화{" "}
                <span className="font-normal text-muted-foreground">
                  (가중치 15%)
                </span>
              </h4>
              <ul className="space-y-1 text-sm leading-relaxed text-muted-foreground">
                <li>
                  <strong className="text-foreground">의미:</strong> 직원 1명이
                  벌어오는 매출이 전년 대비 몇 % 늘었는가
                </li>
                <li>
                  <strong className="text-foreground">왜 중요한가:</strong> 직원을
                  2배로 늘려서 매출이 2배가 된 건 진짜 성장이 아닙니다. 같은
                  인원으로 더 많이 벌어야 효율적 성장입니다.
                </li>
                <li>
                  <strong className="text-foreground">예시:</strong> 오라클 8.4%
                  (직원 162,000명 기준) &rarr; &ldquo;직원 1인당 벌어오는 돈이
                  8.4% 늘었다&rdquo;
                </li>
                <li>
                  <strong className="text-foreground">점수 기준:</strong> -10%
                  이하 &rarr; 0점, +30% 이상 &rarr; 100점
                </li>
              </ul>
            </div>

            {/* ⑤ */}
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <h4 className="mb-1.5 text-sm font-semibold">
                ⑤ Capex 증가율{" "}
                <span className="font-normal text-muted-foreground">
                  (가중치 10% — 가장 낮음)
                </span>
              </h4>
              <ul className="space-y-1 text-sm leading-relaxed text-muted-foreground">
                <li>
                  <strong className="text-foreground">의미:</strong> 공장, 설비,
                  데이터센터 등에 대한 투자(자본지출)가 전년 대비 몇 %
                  늘었는가
                </li>
                <li>
                  <strong className="text-foreground">왜 중요한가:</strong> 미래를
                  위해 투자하고 있다는 신호이지만, 돈만 태우고 성과가 없을 수도
                  있어서 가중치가 낮습니다.
                </li>
                <li>
                  <strong className="text-foreground">예시:</strong> 오라클 209%
                  &rarr; &ldquo;설비 투자를 3배 이상 늘렸다&rdquo; (AI 데이터센터
                  투자)
                </li>
                <li>
                  <strong className="text-foreground">점수 기준:</strong> -20%
                  이하 &rarr; 0점, +50% 이상 &rarr; 100점
                </li>
              </ul>
            </div>
          </div>
        </section>

        <hr className="my-5 border-border" />

        {/* 섹션4 */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">
            가중치는 왜 이렇게 정한 건가요?
          </h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            프로 투자자들의 분석 방법론을 참고했습니다. Meritech Capital의
            연구에 따르면, 매출 성장률이 기업 밸류에이션에 수익성보다 약 3배 더
            큰 영향을 미칩니다. 즉, 시장은 &ldquo;얼마나 남기느냐&rdquo;보다
            &ldquo;얼마나 크고 있느냐&rdquo;에 더 큰 프리미엄을 줍니다. 이 연구
            결과를 반영해 매출 성장률에 가장 높은 가중치(30%)를 부여했습니다.
          </p>
        </section>

        <hr className="my-5 border-border" />

        {/* 섹션5 */}
        <section className="mb-6">
          <h3 className="mb-3 text-base font-semibold">점수 구간별 해석</h3>
          <div className="space-y-2 text-sm">
            <div className="flex gap-3">
              <span className="shrink-0 font-semibold text-green-500">
                80~100점
              </span>
              <span className="text-muted-foreground">
                매우 강한 성장. 매출도 빠르게 늘고, 이익 구조도 개선되는 기업.
                시장에서 높은 프리미엄을 받을 가능성이 큽니다.
              </span>
            </div>
            <div className="flex gap-3">
              <span className="shrink-0 font-semibold text-yellow-500">
                60~79점
              </span>
              <span className="text-muted-foreground">
                양호한 성장. 안정적으로 성장 중이며, 대부분의 지표가 개선되고
                있는 기업.
              </span>
            </div>
            <div className="flex gap-3">
              <span className="shrink-0 font-semibold text-orange-500">
                40~59점
              </span>
              <span className="text-muted-foreground">
                보통. 성장은 있지만 뚜렷하지 않거나, 일부 지표만 좋고 나머지는
                정체된 기업.
              </span>
            </div>
            <div className="flex gap-3">
              <span className="shrink-0 font-semibold text-red-500">
                0~39점
              </span>
              <span className="text-muted-foreground">
                부진. 성장이 정체되거나 후퇴 중인 기업. 구조적 문제가 있을 수
                있습니다.
              </span>
            </div>
          </div>
        </section>

        <hr className="my-5 border-border" />

        {/* 섹션6 */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">
            실제 예시: 오라클(ORCL) 55.9점
          </h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            오라클은 종합 55.9점으로 &ldquo;보통&rdquo; 구간입니다. Capex
            증가율이 209%로 100점 만점을 받았는데, 이는 AI 데이터센터에 대규모
            투자를 하고 있기 때문입니다. 그러나 나머지 4개 지표는 모두
            40~55점대로, 아직 그 투자가 매출 성장이나 이익 개선으로 충분히
            이어지지 않고 있습니다. 이런 패턴을 &ldquo;투자 선행, 성과
            후행&rdquo;이라고 합니다. 지금 돈을 쏟고 있으니 1~2년 뒤에 매출과
            이익이 따라올 수 있지만, 반대로 투자가 실패하면 점수가 더 떨어질
            수도 있습니다.
          </p>
        </section>

        <hr className="my-5 border-border" />

        {/* 섹션7 */}
        <section>
          <h3 className="mb-2 text-base font-semibold">주의사항</h3>
          <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>
              이 점수는 &ldquo;과거 재무 데이터 기반&rdquo;입니다. 미래 주가를
              예측하지 않습니다.
            </li>
            <li>
              업종마다 특성이 다릅니다. 테크 기업과 제조업의 Capex 의미는
              다릅니다.
            </li>
            <li>
              R&D나 직원 수 데이터가 없는 기업은 해당 지표가 제외되고 나머지로
              점수를 계산합니다.
            </li>
            <li>
              이 점수만으로 투자 판단을 하는 것은 권장하지 않습니다. 다른
              분석과 함께 보조 지표로 활용하세요.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────
   메인 패널
   ──────────────────────────────────────────── */
export function GrowthScorePanel() {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [searchLoading, setSearchLoading] = useState(false);

  const [scoreResult, setScoreResult] = useState<GrowthScoreResult | null>(
    null
  );
  const [scoreLoading, setScoreLoading] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const search = useCallback(async (q: string) => {
    if (q.length < 1) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(
        `/api/stock/search?q=${encodeURIComponent(q)}`
      );
      const json = await res.json();
      setSearchResults(json.results || []);
      setSelectedIdx(-1);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.length > 0) {
      debounceRef.current = setTimeout(() => search(query), 300);
    } else {
      setSearchResults([]);
    }
    return () => clearTimeout(debounceRef.current);
  }, [query, search]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchScore = async (symbol: string) => {
    setSelectedSymbol(symbol);
    setScoreLoading(true);
    setScoreResult(null);
    try {
      const res = await fetch(
        `/api/stock/${encodeURIComponent(symbol)}/growth-score`
      );
      const data: GrowthScoreResult = await res.json();
      setScoreResult(data);
    } catch {
      setScoreResult({
        symbol,
        totalScore: null,
        metrics: [],
        error: "데이터 부족으로 점수 산출 불가",
        dataYears: null,
      });
    } finally {
      setScoreLoading(false);
    }
  };

  const selectSymbol = (symbol: string) => {
    setIsOpen(false);
    setQuery("");
    fetchScore(symbol);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((prev) =>
        Math.min(prev + 1, searchResults.length - 1)
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIdx >= 0 && searchResults[selectedIdx]) {
        selectSymbol(searchResults[selectedIdx].symbol);
      } else if (query.trim()) {
        selectSymbol(query.trim().toUpperCase());
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const showDropdown = isOpen && query.length > 0;

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="mb-4 text-lg font-semibold">성장성 종합 점수</h2>

      {/* 검색창 */}
      <div ref={containerRef} className="relative mb-6">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <Search size={16} className="shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => {
              if (query.length > 0) setIsOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder="종목 검색 (예: AAPL, TSLA, 005930.KS)"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {showDropdown && (
          <div className="absolute top-full left-0 z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
            {searchLoading && searchResults.length === 0 && (
              <div className="px-3 py-3 text-xs text-muted-foreground">
                검색 중...
              </div>
            )}
            {!searchLoading && searchResults.length === 0 && (
              <div className="px-3 py-3 text-xs text-muted-foreground">
                결과 없음
              </div>
            )}
            {searchResults.map((r, i) => (
              <button
                key={r.symbol}
                onClick={() => selectSymbol(r.symbol)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                  i === selectedIdx ? "bg-accent" : "hover:bg-accent/60"
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="shrink-0 font-mono font-medium">
                    {r.symbol}
                  </span>
                  <span className="truncate text-muted-foreground">
                    {r.name}
                  </span>
                </div>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                  {r.exchange}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 로딩 */}
      {scoreLoading && (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm">
            {selectedSymbol} 성장 점수 계산 중...
          </span>
        </div>
      )}

      {/* 결과 */}
      {!scoreLoading && scoreResult && (
        <div>
          {/* 에러 또는 데이터 부족 */}
          {scoreResult.error ? (
            <div className="rounded-lg border border-border bg-muted/50 px-4 py-8 text-center">
              <p className="text-2xl font-bold text-muted-foreground">—</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {scoreResult.symbol}: {scoreResult.error}
              </p>
            </div>
          ) : (
            <>
              {/* 종합 점수 */}
              <div className="mb-6 text-center">
                <p className="mb-1 text-sm text-muted-foreground">
                  {scoreResult.symbol} 종합 성장 점수
                  {scoreResult.dataYears &&
                    ` (${scoreResult.dataYears.previous} → ${scoreResult.dataYears.latest})`}
                </p>
                <p
                  className={`text-6xl font-extrabold tabular-nums ${scoreColor(scoreResult.totalScore!)}`}
                >
                  {scoreResult.totalScore!.toFixed(1)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">/ 100</p>
                <button
                  onClick={() => setGuideOpen(true)}
                  className="mt-3 inline-flex items-center gap-1 rounded-md border border-blue-400/30 bg-blue-500/10 px-2.5 py-1 text-xs text-blue-400 transition-all hover:bg-blue-500/20 hover:text-blue-300 hover:shadow-[0_0_8px_rgba(59,130,246,0.25)]"
                >
                  <HelpCircle size={13} />
                  종합점수 보는 법
                </button>
              </div>

              {/* 지표별 막대그래프 */}
              <div className="space-y-4">
                {scoreResult.metrics.map((m) => (
                  <div key={m.name}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium">
                        {m.name}{" "}
                        <span className="text-xs text-muted-foreground">
                          ({(m.weight * 100).toFixed(0)}%)
                        </span>
                      </span>
                      {m.score != null ? (
                        <span
                          className={`font-mono font-semibold tabular-nums ${scoreColor(m.score)}`}
                        >
                          {m.score.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          N/A
                        </span>
                      )}
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                      {m.score != null ? (
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${barColor(m.score)}`}
                          style={{ width: `${m.score}%` }}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <span className="text-[9px] text-muted-foreground">
                            데이터 부족
                          </span>
                        </div>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {m.description}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* 초기 상태 */}
      {!scoreLoading && !scoreResult && (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">
            종목을 검색하면 5가지 재무 지표 기반 성장성 점수를 확인할 수 있습니다.
          </p>
          <button
            onClick={() => setGuideOpen(true)}
            className="mt-3 inline-flex items-center gap-1 rounded-md border border-blue-400/30 bg-blue-500/10 px-2.5 py-1 text-xs text-blue-400 transition-all hover:bg-blue-500/20 hover:text-blue-300 hover:shadow-[0_0_8px_rgba(59,130,246,0.25)]"
          >
            <HelpCircle size={13} />
            종합점수 보는 법
          </button>
        </div>
      )}

      {/* 가이드 모달 */}
      {guideOpen && <ScoreGuideModal onClose={() => setGuideOpen(false)} />}
    </div>
  );
}
