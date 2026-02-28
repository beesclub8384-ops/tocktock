"use client";

import { useState, useEffect, useMemo } from "react";
import { X, HelpCircle, Sparkles } from "lucide-react";

interface YesterdayStock {
  code: string;
  name: string;
  value: number;
  market: string;
}

interface ExplosionStock {
  code: string;
  name: string;
  yesterdayValue: number;
  todayValue: number;
  closePrice: number;
  changeRate: number;
  market: string;
}

interface SuspectedStock {
  code: string;
  name: string;
  dDayValue: number;
  dPlusOneValue: number;
  dDayClosePrice: number;
  dDayChangeRate: number;
  marketCap: number;
  isRepeated: boolean;
  repeatedDates: string[];
  market: string;
  dDate: string;
}

interface VolumeData {
  todayDate: string;
  yesterdayDate: string;
  marketOpen: boolean;
  yesterdayStocks: YesterdayStock[];
  explosionStocks: ExplosionStock[];
  suspectedStocks: SuspectedStock[];
  updatedAt: string;
  error?: string;
}

function formatBillion(value: number): string {
  const eok = Math.round(value / 100_000_000);
  if (eok >= 10000) {
    return (eok / 10000).toFixed(2) + "조";
  }
  return eok.toLocaleString() + "억";
}

function formatDateLabel(yyyymmdd: string): string {
  const m = parseInt(yyyymmdd.slice(4, 6));
  const d = parseInt(yyyymmdd.slice(6, 8));
  return `${m}/${d}`;
}

function VolumeGuideModal({ onClose }: { onClose: () => void }) {
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
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <div className="relative max-h-[85vh] overflow-y-auto p-6 sm:p-8">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X size={20} />
        </button>

        <h2 className="mb-6 text-xl font-bold">거래대금 폭발 보는 법</h2>

        {/* 섹션1 */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">
            거래대금이 뭔가요?
          </h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            하루 동안 그 주식이 사고팔린 총 금액입니다. 예를 들어 삼성전자가
            하루에 1조원어치 거래되었다면, 그날 삼성전자의 거래대금은
            1조원입니다. 주가와는 다른 개념으로,{" "}
            <strong className="text-foreground">
              &ldquo;이 종목에 얼마나 많은 돈이 오갔는가&rdquo;
            </strong>
            를 보여줍니다.
          </p>
        </section>

        <hr className="my-5 border-border" />

        {/* 섹션2 */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">
            이 페이지는 뭘 보여주나요?
          </h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            어제까지 조용하던 종목(거래대금 300억 이하) 중에서, 오늘 갑자기
            돈이 몰린 종목(950억 이상)을 자동으로 찾아줍니다. 즉,{" "}
            <strong className="text-foreground">
              &ldquo;어제는 아무도 안 쳐다보던 종목에 오늘 갑자기 큰돈이
              들어왔다&rdquo;
            </strong>
            는 뜻입니다.
          </p>
        </section>

        <hr className="my-5 border-border" />

        {/* 섹션3 */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">
            왜 이게 중요한가요?
          </h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            거래대금이 갑자기 폭발한다는 건, 큰손(기관·외국인)이 움직이고
            있거나 중요한 뉴스가 터졌다는 신호일 수 있습니다. 비유하면 이렇습니다.{" "}
            <strong className="text-foreground">
              평소 손님 10명 오던 가게에 갑자기 100명이 몰렸다면, 분명 뭔가
              이유가 있는 겁니다.
            </strong>{" "}
            그 이유를 찾아보는 게 투자의 출발점입니다.
          </p>
        </section>

        <hr className="my-5 border-border" />

        {/* 섹션4: 패널 설명 — 2단 그리드 */}
        <section className="mb-6">
          <h3 className="mb-3 text-base font-semibold">
            화면 구성
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <h4 className="mb-1.5 text-sm font-semibold">
                왼쪽 &ldquo;어제&rdquo; 패널
              </h4>
              <ul className="space-y-1 text-sm leading-relaxed text-muted-foreground">
                <li>
                  어제 거래대금이{" "}
                  <strong className="text-foreground">300억 이하</strong>였던
                  종목들입니다.
                </li>
                <li>
                  한마디로 &ldquo;조용했던 종목들&rdquo;. 평소에 시장의 관심을
                  거의 받지 못하던 종목이라고 보면 됩니다.
                </li>
                <li>
                  검색창에서 종목명이나 코드로 검색할 수 있습니다.
                </li>
              </ul>
            </div>

            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <h4 className="mb-1.5 text-sm font-semibold">
                오른쪽 &ldquo;세력진입 의심 종목&rdquo; 패널{" "}
                <span className="font-normal text-amber-400">— 핵심!</span>
              </h4>
              <ul className="space-y-1 text-sm leading-relaxed text-muted-foreground">
                <li>
                  거래대금이{" "}
                  <strong className="text-foreground">950억 이상</strong>{" "}
                  폭발한 뒤, 다음날 거래대금이{" "}
                  <strong className="text-foreground">1/3 이하</strong>로
                  급감한 종목입니다.
                </li>
                <li>
                  세력이 대량 매수 후 다음날 물량을 털지 못한(거래가
                  급감한) 패턴을 포착합니다.
                </li>
                <li>
                  D일 종가·등락률과 함께 D일 대비 D+1일 거래대금
                  비율(%)이 표시됩니다.
                </li>
              </ul>
            </div>
          </div>
        </section>

        <hr className="my-5 border-border" />

        {/* 하단 정보 — 2단 그리드 */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* 좌측: 주의할 점 */}
          <div className="space-y-5">
            <section>
              <h3 className="mb-2 text-base font-semibold">주의할 점</h3>
              <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>
                  거래대금 폭발이{" "}
                  <strong className="text-foreground">
                    항상 좋은 신호는 아닙니다.
                  </strong>{" "}
                  급등할 때도 거래대금이 폭발하지만, 급락할 때도 폭발합니다.
                </li>
                <li>
                  반드시{" "}
                  <strong className="text-foreground">
                    &ldquo;왜 터졌는지&rdquo; 뉴스를 확인
                  </strong>
                  하세요. 호재(신사업, 실적 서프라이즈)인지, 악재(소송, 분식회계
                  의혹)인지에 따라 의미가 완전히 달라집니다.
                </li>
                <li>
                  거래대금만 보고 매수하는 것은 권장하지 않습니다. 다른 분석과
                  함께 보조 지표로 활용하세요.
                </li>
              </ul>
            </section>
          </div>

          {/* 우측: 장 마감 + 데이터 출처 */}
          <div className="space-y-5">
            <section>
              <h3 className="mb-2 text-base font-semibold">
                장 마감 전에는?
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                오른쪽 &ldquo;세력진입 의심 종목&rdquo; 패널은{" "}
                <strong className="text-foreground">
                  장 마감(15:30) 이후
                </strong>
                에 업데이트됩니다. 장중에는 아직 거래가 진행 중이라 최종
                거래대금을 알 수 없기 때문입니다. 왼쪽 &ldquo;어제&rdquo;
                패널은 장중에도 정상적으로 표시됩니다.
              </p>
            </section>

            <hr className="border-border md:hidden" />

            <section>
              <h3 className="mb-2 text-base font-semibold">데이터 출처</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                <strong className="text-foreground">네이버 금융</strong>에서
                코스피·코스닥 전 종목의 거래대금 데이터를 가져옵니다. 매일 장
                마감 후 자동으로 업데이트되며, ETF·ETN·스팩·우선주 등 파생상품은
                제외하고{" "}
                <strong className="text-foreground">
                  일반 기업 주식만
                </strong>{" "}
                표시합니다.
              </p>
            </section>
          </div>
        </div>

        <hr className="my-5 border-border" />

        {/* TockTock 분석 설명 — 2단 그리드 */}
        <section className="mb-6">
          <h3 className="mb-3 text-base font-semibold">
            TockTock 분석 패널
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-4">
              <h4 className="mb-1.5 text-sm font-semibold">
                TockTock 분석이란?
              </h4>
              <p className="text-sm leading-relaxed text-muted-foreground">
                거래대금이 폭발한 종목들을{" "}
                <strong className="text-foreground">
                  자동으로 분석
                </strong>
                해주는 기능입니다. 네이버 금융의 테마 데이터를 수집하고,
                이를 바탕으로 폭발 종목들의 패턴을 읽어줍니다.
              </p>
            </div>

            <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-4">
              <h4 className="mb-1.5 text-sm font-semibold">
                어떤 내용을 알려주나요?
              </h4>
              <ul className="space-y-1 text-sm leading-relaxed text-muted-foreground">
                <li>
                  <strong className="text-foreground">공통 테마</strong> —
                  어떤 테마·섹터에 돈이 몰리고 있는지
                </li>
                <li>
                  <strong className="text-foreground">종목별 포인트</strong> —
                  폭발 종목 간 핵심 차이점
                </li>
                <li>
                  <strong className="text-foreground">리스크 요인</strong> —
                  고평가, 과열, 작전주 의심 등 위험 요소
                </li>
                <li>
                  <strong className="text-foreground">한줄 요약</strong> —
                  오늘의 수급 흐름 정리
                </li>
              </ul>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <section>
            <h3 className="mb-2 text-base font-semibold">
              언제 볼 수 있나요?
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              <strong className="text-foreground">
                장 마감(15:30) 이후
              </strong>
              에 자동으로 생성됩니다. 장중에는 &ldquo;장 마감 후 분석이
              제공됩니다&rdquo; 메시지가 표시됩니다. 한 번 생성된 분석은
              캐싱되어, 같은 날 다시 접속해도 빠르게 확인할 수 있습니다.
            </p>
          </section>

          <section>
            <h3 className="mb-2 text-base font-semibold">
              분석 시 주의할 점
            </h3>
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
              <li>
                TockTock 분석은{" "}
                <strong className="text-foreground">참고용</strong>이며,
                투자 판단의 유일한 근거로 사용하면 안 됩니다.
              </li>
              <li>
                반드시{" "}
                <strong className="text-foreground">
                  본인이 직접 뉴스와 재무정보를 확인
                </strong>
                하세요.
              </li>
              <li>
                자동 분석이 모든 시장 상황을 완벽하게 파악하지는 못합니다.
                예상치 못한 이벤트나 급변하는 시장에는 한계가 있을 수
                있습니다.
              </li>
            </ul>
          </section>
        </div>
      </div>
      </div>
    </div>
  );
}

export default function VolumeExplosionPage() {
  const [data, setData] = useState<VolumeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  useEffect(() => {
    fetch("/api/volume-explosion")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setData(json);
      })
      .catch(() => setError("데이터를 불러올 수 없습니다."))
      .finally(() => setLoading(false));
  }, []);

  // 장 마감 후 + 폭발 종목 있을 때 분석 fetch
  useEffect(() => {
    if (!data || data.marketOpen || data.explosionStocks.length === 0) return;
    setAnalysisLoading(true);
    fetch("/api/volume-explosion/analysis")
      .then((r) => r.json())
      .then((json) => {
        if (json.analysis) setAnalysis(json.analysis);
      })
      .catch(() => {})
      .finally(() => setAnalysisLoading(false));
  }, [data]);

  const filteredYesterday = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data.yesterdayStocks;
    const q = search.toLowerCase();
    return data.yesterdayStocks.filter(
      (s) => s.name.toLowerCase().includes(q) || s.code.includes(q),
    );
  }, [data, search]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground/30 border-t-foreground" />
          <p className="mt-4 text-muted-foreground text-sm">
            네이버 금융 데이터를 불러오는 중...
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">
            {error || "데이터를 불러올 수 없습니다."}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-accent transition-colors"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* 헤더 */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            거래대금 폭발 탐지
          </h1>
          <p className="text-muted-foreground text-sm">
            어제 조용했던 종목(거래대금 300억 이하) 중 오늘 거래대금이 950억
            이상 터진 종목을 찾습니다. 데이터 출처: 네이버 금융
          </p>
          <button
            onClick={() => setShowGuide(true)}
            className="guide-btn mt-3 inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-all"
          >
            <HelpCircle size={13} />
            거래대금 폭발 보는 법
          </button>
        </header>

        {showGuide && <VolumeGuideModal onClose={() => setShowGuide(false)} />}

        {/* 요약 배너 */}
        {!data.marketOpen && data.suspectedStocks.length > 0 && (
          <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/5 px-5 py-3">
            <p className="text-sm">
              <strong className="text-amber-400">
                {data.suspectedStocks.length}개 종목
              </strong>
              <span className="text-muted-foreground">
                에서 세력 진입이 의심됩니다 (거래대금 폭발 후 다음날 급감)
              </span>
            </p>
          </div>
        )}

        {/* 좌우 패널 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── 왼쪽: 어제 ── */}
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="bg-muted/30 px-5 py-4 border-b border-border">
              <h2 className="text-lg font-bold">
                어제{" "}
                <span className="text-muted-foreground font-normal">
                  ({data.yesterdayDate ? formatDateLabel(data.yesterdayDate) : "-"})
                </span>
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                거래대금 300억 이하 ·{" "}
                {data.yesterdayStocks.length.toLocaleString()}종목
              </p>
              <input
                type="text"
                placeholder="종목명 또는 코드 검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="mt-3 w-full px-3 py-1.5 text-sm border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">종목코드</th>
                    <th className="text-left px-4 py-2 font-medium">종목명</th>
                    <th className="text-right px-4 py-2 font-medium">
                      거래대금
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredYesterday.map((s) => (
                    <tr
                      key={s.code}
                      className="border-t border-border/20 hover:bg-accent/30 transition-colors"
                    >
                      <td
                        className="px-4 py-1.5 text-muted-foreground text-xs"
                        style={{ fontFamily: "'DM Mono', monospace" }}
                      >
                        {s.code}
                      </td>
                      <td className="px-4 py-1.5">
                        {s.name}
                        <span className="ml-1.5 text-[10px] text-muted-foreground/60">
                          {s.market}
                        </span>
                      </td>
                      <td
                        className="px-4 py-1.5 text-right text-muted-foreground"
                        style={{ fontFamily: "'DM Mono', monospace" }}
                      >
                        {formatBillion(s.value)}
                      </td>
                    </tr>
                  ))}
                  {filteredYesterday.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-8 text-center text-muted-foreground text-xs"
                      >
                        {search.trim()
                          ? `"${search}" 검색 결과가 없습니다`
                          : "데이터가 없습니다"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── 오른쪽: 세력진입 의심 종목 + TockTock 분석 ── */}
          <div className="flex flex-col gap-6">
            {/* 상단: 세력진입 의심 종목 리스트 */}
            <div className="border border-amber-500/30 rounded-xl overflow-hidden">
              <div className="bg-amber-500/5 px-5 py-4 border-b border-amber-500/20">
                <h2 className="text-lg font-bold">
                  세력진입 의심 종목
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.marketOpen
                    ? "장 마감 후 업데이트"
                    : `거래대금 폭발 후 다음날 1/3 이하로 급감 · ${data.suspectedStocks.length}종목`}
                </p>
              </div>
              <div className="p-4 space-y-3 h-[300px] overflow-y-auto">
                {data.marketOpen ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <p className="text-muted-foreground text-sm mb-2">
                        아직 장 마감 전입니다.
                      </p>
                      <p className="text-muted-foreground/60 text-xs">
                        장 마감 후(15:30 이후) 업데이트됩니다.
                      </p>
                    </div>
                  </div>
                ) : data.suspectedStocks.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <p className="text-muted-foreground text-sm mb-1">
                        조건에 해당하는 종목이 없습니다
                      </p>
                      <p className="text-muted-foreground/60 text-xs">
                        전일 폭발 종목 중 오늘 거래대금이 1/3 이하로 급감한 종목 없음
                      </p>
                    </div>
                  </div>
                ) : (
                  data.suspectedStocks.map((s) => {
                    const dropRatio = s.dDayValue > 0
                      ? ((s.dPlusOneValue / s.dDayValue) * 100).toFixed(1)
                      : "N/A";
                    const isUp = s.dDayChangeRate >= 0;

                    return (
                      <div
                        key={s.code}
                        className="border border-border rounded-lg p-4 bg-card hover:bg-accent/30 transition-colors"
                      >
                        {/* 종목 정보 */}
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-base">{s.name}</span>
                              {s.isRepeated && (
                                <span className="px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-[10px] font-bold">
                                  반복 폭발
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                              <span
                                style={{
                                  fontFamily: "'DM Mono', monospace",
                                }}
                              >
                                {s.code}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-muted text-[10px]">
                                {s.market}
                              </span>
                              {s.marketCap > 0 && (
                                <span className="text-muted-foreground/70">
                                  시총 {formatBillion(s.marketCap)}
                                </span>
                              )}
                            </div>
                            {s.isRepeated && s.repeatedDates.length > 0 && (
                              <div className="text-[10px] text-orange-400/70 mt-0.5">
                                {s.repeatedDates.map((d) => `${parseInt(d.slice(4, 6))}/${parseInt(d.slice(6, 8))}`).join(", ")} 폭발
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <div
                              className="text-lg font-bold"
                              style={{ fontFamily: "'DM Mono', monospace" }}
                            >
                              {s.dDayClosePrice.toLocaleString()}원
                            </div>
                            <div
                              className={`text-sm font-medium ${isUp ? "text-red-400" : "text-blue-400"}`}
                            >
                              {isUp ? "+" : ""}
                              {s.dDayChangeRate.toFixed(2)}%
                              <span className="text-muted-foreground/60 text-xs ml-1">
                                (D일)
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 거래대금 비교: D일 → D+1일 */}
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground text-xs">
                            D일({formatDateLabel(s.dDate)})
                          </span>
                          <span
                            className="font-bold text-amber-400"
                            style={{ fontFamily: "'DM Mono', monospace" }}
                          >
                            {formatBillion(s.dDayValue)}
                          </span>
                          <span className="text-muted-foreground/50">→</span>
                          <span className="text-xs text-muted-foreground">
                            D+1일
                          </span>
                          <span
                            style={{ fontFamily: "'DM Mono', monospace" }}
                            className="text-muted-foreground"
                          >
                            {formatBillion(s.dPlusOneValue)}
                          </span>
                          <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400">
                            {dropRatio}%
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 하단: TockTock 분석 */}
            <div className="border border-purple-500/30 rounded-xl overflow-hidden">
              <div className="bg-purple-500/5 px-5 py-4 border-b border-purple-500/20">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Sparkles size={18} className="text-purple-400" />
                  TockTock 분석
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  네이버 금융 테마 데이터 기반
                </p>
              </div>
              <div className="p-5 h-[300px] overflow-y-auto">
                {data.marketOpen ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <Sparkles
                        size={24}
                        className="mx-auto mb-3 text-purple-400/40"
                      />
                      <p className="text-muted-foreground text-sm mb-1">
                        장 마감 후 분석이 제공됩니다
                      </p>
                      <p className="text-muted-foreground/60 text-xs">
                        15:30 이후 폭발 종목의 공통 테마·리스크를 분석합니다
                      </p>
                    </div>
                  </div>
                ) : data.explosionStocks.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground text-sm">
                      분석할 종목이 없습니다
                    </p>
                  </div>
                ) : analysisLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="inline-block h-6 w-6 animate-spin rounded-full border-3 border-purple-400/30 border-t-purple-400" />
                      <p className="mt-3 text-muted-foreground text-sm">
                        분석 중입니다...
                      </p>
                    </div>
                  </div>
                ) : analysis ? (
                  <div className="prose-sm text-sm leading-relaxed text-muted-foreground [&_strong]:text-foreground [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1">
                    {analysis.split("\n").map((line, i) => {
                      if (!line.trim()) return null;
                      // 볼드 처리
                      const parts = line.split(/(\*\*[^*]+\*\*)/g);
                      const rendered = parts.map((part, j) => {
                        if (part.startsWith("**") && part.endsWith("**")) {
                          return (
                            <strong key={j} className="text-foreground">
                              {part.slice(2, -2)}
                            </strong>
                          );
                        }
                        return part;
                      });
                      // 불릿 라인
                      if (line.trim().startsWith("- ")) {
                        return (
                          <div key={i} className="flex gap-2 mb-1.5 pl-2">
                            <span className="text-purple-400 mt-0.5">•</span>
                            <span>{rendered.map((r, k) => typeof r === "string" ? r.replace(/^- /, "") : r)}</span>
                          </div>
                        );
                      }
                      return (
                        <p key={i} className="mb-2.5">
                          {rendered}
                        </p>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground/60 text-sm">
                      분석을 불러올 수 없습니다
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 업데이트 시각 */}
        <p className="mt-4 text-xs text-muted-foreground/50 text-right">
          마지막 업데이트:{" "}
          {new Date(data.updatedAt).toLocaleString("ko-KR", {
            timeZone: "Asia/Seoul",
          })}
        </p>
      </div>
    </div>
  );
}
