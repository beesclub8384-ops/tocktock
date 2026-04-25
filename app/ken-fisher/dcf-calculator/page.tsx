"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SAMPLE_STOCKS } from "@/lib/data/dcf-config";
import type { DCFAnalysis, Grade } from "@/lib/dcf-engine";

const GRADE_META: Record<Grade, { emoji: string; label: string; color: string; bgColor: string; message: string }> = {
  A: {
    emoji: "🟢",
    label: "A등급",
    color: "text-emerald-700",
    bgColor: "bg-emerald-50 border-emerald-200",
    message: "안정적 대형주로 DCF 적용 적합. 결과 신뢰도: 높음",
  },
  B: {
    emoji: "🟡",
    label: "B등급",
    color: "text-amber-700",
    bgColor: "bg-amber-50 border-amber-200",
    message: "대체로 안정적이나 일부 변동성 있음. 참고용으로 활용",
  },
  C: {
    emoji: "🟠",
    label: "C등급",
    color: "text-orange-700",
    bgColor: "bg-orange-50 border-orange-200",
    message: "성장주 또는 변동성 큰 종목. 결과를 절대 맹신하지 말 것",
  },
  D: {
    emoji: "🔴",
    label: "D등급",
    color: "text-rose-700",
    bgColor: "bg-rose-50 border-rose-200",
    message: "DCF 부적합. 다른 평가법을 사용하세요",
  },
};

function fmtMoney(v: number | null | undefined, currency: string): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (currency === "KRW") {
    if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}조원`;
    if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(0)}억원`;
    return `${sign}${Math.round(abs).toLocaleString("en-US")}원`;
  }
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}
function priceLabel(price: number | null, currency: string): string {
  if (price == null) return "—";
  if (currency === "KRW") return `${Math.round(price).toLocaleString("en-US")}원`;
  return `$${fmtNum(price, 2)}`;
}

// ── 클라이언트 사이드 DCF (슬라이더 실시간 재계산용) ──
function dcfFairPrice({
  startFcf,
  growthRate,
  perpetualGrowth,
  discountRate,
  years,
  sharesOutstanding,
}: {
  startFcf: number;
  growthRate: number;
  perpetualGrowth: number;
  discountRate: number;
  years: number;
  sharesOutstanding: number;
}): number | null {
  if (startFcf <= 0 || sharesOutstanding <= 0) return null;
  if (discountRate <= perpetualGrowth) return null;
  let pvSum = 0;
  let lastFcf = startFcf;
  for (let t = 1; t <= years; t++) {
    lastFcf = lastFcf * (1 + growthRate);
    pvSum += lastFcf / Math.pow(1 + discountRate, t);
  }
  const terminal = (lastFcf * (1 + perpetualGrowth)) / (discountRate - perpetualGrowth);
  const pvTerminal = terminal / Math.pow(1 + discountRate, years);
  return (pvSum + pvTerminal) / sharesOutstanding;
}

export default function DCFCalculatorPage() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<DCFAnalysis | null>(null);

  // 슬라이더 상태 (분석 결과 로드 후 기본값 세팅)
  const [growthSlider, setGrowthSlider] = useState(0.08);
  const [discountSlider, setDiscountSlider] = useState(0.09);

  const runAnalysis = useCallback(async (query: string) => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const res = await fetch(`/api/dcf/${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? "분석에 실패했습니다.");
        return;
      }
      setAnalysis(data as DCFAnalysis);
      // 슬라이더 기본값을 분석 결과의 가정으로 초기화
      setGrowthSlider(data.assumptions.growthAssumption);
      setDiscountSlider(data.assumptions.discountRate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "예상치 못한 오류");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runAnalysis(input);
  };

  // 슬라이더 기반 적정가 실시간 계산
  const sliderFairPrice = useMemo(() => {
    if (!analysis || analysis.grade === "D") return null;
    const sf = analysis.assumptions.startFcf;
    const so = analysis.data.sharesOutstanding;
    if (sf == null || sf <= 0 || so == null || so <= 0) return null;
    return dcfFairPrice({
      startFcf: sf,
      growthRate: growthSlider,
      perpetualGrowth: analysis.assumptions.perpetualGrowth,
      discountRate: discountSlider,
      years: 5,
      sharesOutstanding: so,
    });
  }, [analysis, growthSlider, discountSlider]);

  const sliderUpside = useMemo(() => {
    if (!analysis || sliderFairPrice == null || analysis.data.price == null) return null;
    return (sliderFairPrice - analysis.data.price) / analysis.data.price;
  }, [analysis, sliderFairPrice]);

  // 초기 데모: 페이지 진입 시 GOOGL을 자동으로 한 번 로드 (선택사항)
  useEffect(() => {
    // 자동 로드는 비활성화. 사용자가 직접 검색하게.
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      {/* 페이지 헤더 */}
      <div className="mb-8">
        <div className="mb-2 text-sm text-muted-foreground">켄 피셔 · 도구</div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight">DCF 가치 계산기 <span className="text-base font-normal text-muted-foreground">(참고용)</span></h1>
        <p className="text-sm text-muted-foreground">
          기업의 미래 잉여현금흐름(FCF)을 현재가치로 할인해 내재가치를 추정합니다.
          이 도구는 <strong>정확한 답을 내려고 하지 않습니다</strong> — DCF로 평가하기 적합한 종목인지부터 판정하고, 가정에 얼마나 민감한지를 함께 보여줍니다.
        </p>
      </div>

      {/* 검색 영역 */}
      <Card className="mb-6">
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="종목 코드 또는 티커 입력 (예: AAPL, 005930, 086520)"
              className="flex-1 rounded-md border border-input bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={loading}
            />
            <Button type="submit" disabled={loading || !input.trim()}>
              {loading ? "분석 중..." : "계산"}
            </Button>
          </form>
          <div className="mt-4">
            <div className="mb-2 text-xs text-muted-foreground">샘플 종목 빠른 선택:</div>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_STOCKS.map((s) => (
                <Button
                  key={s.query}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setInput(s.query);
                    runAnalysis(s.query);
                  }}
                  disabled={loading}
                  className="h-7 text-xs"
                >
                  {s.display}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 에러 */}
      {error && (
        <Card className="mb-6 border-rose-200 bg-rose-50">
          <CardContent>
            <div className="text-sm text-rose-700">
              <strong>분석 실패:</strong> {error}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              종목 코드를 다시 확인해주세요. 한국 종목은 6자리 숫자(예: 005930), 미국 종목은 영문 티커(예: AAPL)로 입력합니다.
            </div>
          </CardContent>
        </Card>
      )}

      {/* 분석 결과 */}
      {analysis && <AnalysisView analysis={analysis} growthSlider={growthSlider} discountSlider={discountSlider} setGrowthSlider={setGrowthSlider} setDiscountSlider={setDiscountSlider} sliderFairPrice={sliderFairPrice} sliderUpside={sliderUpside} />}

      {/* 면책 (강조) */}
      <Card className="mt-6 border-zinc-300 bg-zinc-50">
        <CardContent>
          <div className="text-sm leading-relaxed">
            <div className="mb-2 font-semibold text-zinc-900">⚠️ 이 도구는 참고용입니다</div>
            <ul className="list-disc space-y-1 pl-5 text-zinc-700">
              <li>실제 투자 결정에 단독 근거로 사용하지 마세요.</li>
              <li>DCF는 가정(성장률, 할인율, 영구성장률)에 매우 민감합니다. 같은 회사도 가정을 살짝 바꾸면 적정가가 2배 이상 차이납니다.</li>
              <li>미래는 예측 불가능합니다. 본 도구의 결과는 &ldquo;현재 알려진 데이터 + 단순 가정&rdquo;의 산물일 뿐입니다.</li>
              <li>모든 투자 판단의 책임은 투자자 본인에게 있습니다.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AnalysisView({
  analysis,
  growthSlider,
  discountSlider,
  setGrowthSlider,
  setDiscountSlider,
  sliderFairPrice,
  sliderUpside,
}: {
  analysis: DCFAnalysis;
  growthSlider: number;
  discountSlider: number;
  setGrowthSlider: (v: number) => void;
  setDiscountSlider: (v: number) => void;
  sliderFairPrice: number | null;
  sliderUpside: number | null;
}) {
  const { data, grade, assumptions, dcf, sensitivity, reasonDetail, resolvedSymbol, bigTech } = analysis;
  const meta = GRADE_META[grade];
  const showAssumptions = grade !== "D";
  const showDCF = grade !== "D" && dcf?.ok && dcf.fairPerShare != null;
  const showSensitivity = grade !== "D" && sensitivity.length > 0;

  const upside =
    showDCF && data.price != null && dcf?.fairPerShare != null
      ? (dcf.fairPerShare - data.price) / data.price
      : null;

  // 민감도 표 정렬용 (행: 할인율, 열: 성장률)
  const grs = [0.05, 0.08, 0.12];
  const drs = [0.07, 0.09, 0.11];
  const fairsForRange = sensitivity
    .map((c) => c.fairPerShare)
    .filter((v): v is number => v != null);
  const fairLo = fairsForRange.length ? Math.min(...fairsForRange) : null;
  const fairHi = fairsForRange.length ? Math.max(...fairsForRange) : null;

  return (
    <>
      {/* (가) 종목 헤더 */}
      <Card className="mb-6">
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xs text-muted-foreground">{resolvedSymbol}</div>
              <div className="text-2xl font-bold">{data.longName ?? data.name ?? resolvedSymbol}</div>
              {data.industry && (
                <div className="mt-1 text-sm text-muted-foreground">{data.industry}</div>
              )}
              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                <div>
                  <div className="text-xs text-muted-foreground">현재가</div>
                  <div className="font-semibold">{priceLabel(data.price, data.currency)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">시가총액</div>
                  <div className="font-semibold">{fmtMoney(data.marketCap, data.currency)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">PER (TTM)</div>
                  <div className="font-semibold">{data.pe != null ? fmtNum(data.pe, 1) : "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">ROE</div>
                  <div className="font-semibold">{fmtPct(data.roe)}</div>
                </div>
              </div>
            </div>
            <div className={`shrink-0 rounded-lg border px-4 py-3 ${meta.bgColor}`}>
              <div className="text-xs text-muted-foreground">DCF 적합도</div>
              <div className={`text-2xl font-bold ${meta.color}`}>
                {meta.emoji} {meta.label}
              </div>
              <div className={`mt-1 text-xs ${meta.color}`}>{meta.message}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* (나) 가정 섹션 (D등급 숨김) */}
      {showAssumptions && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">가정</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <AssumptionRow label="시작 FCF" value={fmtMoney(assumptions.startFcf, data.currency)} hint={assumptions.startFcfSource} />
              <AssumptionRow label="5년 성장률" value={fmtPct(assumptions.growthAssumption)} hint={assumptions.growthSource} />
              <AssumptionRow label="영구 성장률" value={fmtPct(assumptions.perpetualGrowth)} hint={bigTech ? `빅테크/플랫폼 우위: ${bigTech.reason}` : "일반"} />
              <AssumptionRow label="할인율" value={fmtPct(assumptions.discountRate)} hint={assumptions.discountSource} />
            </dl>
            {data.beta == null && (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                ℹ️ 이 종목은 베타 정보가 없어 폴백 9% 할인율을 사용했습니다. 한국 코스닥 종목은 베타 추정치가 부정확한 경우가 많습니다.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* (다) DCF 결과 카드 */}
      <Card className={`mb-6 ${grade === "D" ? "border-rose-200 bg-rose-50/50" : ""}`}>
        <CardHeader>
          <CardTitle className="text-base">DCF 결과</CardTitle>
        </CardHeader>
        <CardContent>
          {showDCF ? (
            <div className="flex flex-col items-start gap-2">
              <div className="text-xs text-muted-foreground">주당 적정가</div>
              <div className="text-4xl font-bold">{priceLabel(dcf!.fairPerShare ?? null, data.currency)}</div>
              {data.price != null && upside != null && (
                <div className={`text-base font-semibold ${upside > 0.1 ? "text-emerald-700" : upside < -0.1 ? "text-rose-700" : "text-amber-700"}`}>
                  현재가 대비 {upside > 0 ? "+" : ""}{(upside * 100).toFixed(1)}%
                  {" "}
                  ({upside > 0.1 ? "저평가" : upside < -0.1 ? "고평가" : "적정"})
                </div>
              )}
              <div className="mt-3 grid w-full gap-2 text-xs sm:grid-cols-3">
                <div className="rounded border border-border px-3 py-2">
                  <div className="text-muted-foreground">5년 FCF 현재가치 합</div>
                  <div className="font-semibold">{fmtMoney(dcf!.pvSum, data.currency)}</div>
                </div>
                <div className="rounded border border-border px-3 py-2">
                  <div className="text-muted-foreground">잔여가치(터미널) 현재가치</div>
                  <div className="font-semibold">{fmtMoney(dcf!.pvTerminal, data.currency)}</div>
                </div>
                <div className="rounded border border-border px-3 py-2">
                  <div className="text-muted-foreground">기업가치(EV) 추정</div>
                  <div className="font-semibold">{fmtMoney(dcf!.enterpriseValue, data.currency)}</div>
                </div>
              </div>
            </div>
          ) : grade === "D" ? (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="destructive" className="text-sm">⚠️ DCF 적용 부적합</Badge>
              </div>
              <div className="text-sm text-zinc-800">
                <div className="mb-1 font-semibold">사유</div>
                <div className="text-muted-foreground">{reasonDetail}</div>
              </div>
              <div className="mt-4 rounded-md border border-zinc-200 bg-white p-3 text-sm">
                <div className="mb-1 font-semibold">권장 대안 평가법</div>
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  <li><strong>PBR (주가순자산비율)</strong>: 자본이 안정적인 회사의 자산가치 평가</li>
                  <li><strong>EV/Sales</strong>: 적자지만 매출이 큰 성장기업/플랫폼</li>
                  <li><strong>자산가치 평가</strong>: 부동산·현금성 자산이 큰 비중을 차지하는 회사</li>
                  <li>최근 매출/이익이 흑자 전환되면 다시 분석해 보세요.</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">DCF 계산이 가능한 데이터가 부족합니다.</div>
          )}
        </CardContent>
      </Card>

      {/* (라) 민감도 분석 */}
      {showSensitivity && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">민감도 분석</CardTitle>
            <p className="text-xs text-muted-foreground">
              DCF는 가정에 매우 민감합니다. 슬라이더로 직접 흔들어 보세요.
            </p>
          </CardHeader>
          <CardContent>
            {/* 인터랙티브 슬라이더 */}
            <div className="mb-6 grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">5년 성장률</span>
                  <span className="font-mono font-semibold">{(growthSlider * 100).toFixed(1)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.2}
                  step={0.005}
                  value={growthSlider}
                  onChange={(e) => setGrowthSlider(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>0%</span>
                  <span>20%</span>
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">할인율</span>
                  <span className="font-mono font-semibold">{(discountSlider * 100).toFixed(1)}%</span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={0.15}
                  step={0.005}
                  value={discountSlider}
                  onChange={(e) => setDiscountSlider(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>5%</span>
                  <span>15%</span>
                </div>
              </div>
            </div>

            <div className="mb-6 rounded-lg border border-border bg-muted/30 p-4">
              <div className="text-xs text-muted-foreground">슬라이더 기반 적정가</div>
              <div className="mt-1 text-3xl font-bold">{priceLabel(sliderFairPrice, data.currency)}</div>
              {sliderUpside != null && (
                <div className={`mt-1 text-sm font-semibold ${sliderUpside > 0.1 ? "text-emerald-700" : sliderUpside < -0.1 ? "text-rose-700" : "text-amber-700"}`}>
                  현재가 대비 {sliderUpside > 0 ? "+" : ""}{(sliderUpside * 100).toFixed(1)}%
                </div>
              )}
            </div>

            {/* 정적 3×3 표 */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border border-border bg-muted px-3 py-2 text-left text-xs font-medium text-muted-foreground">할인율 \ 성장률</th>
                    {grs.map((g) => (
                      <th key={g} className="border border-border bg-muted px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                        {(g * 100).toFixed(0)}%
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {drs.map((d) => (
                    <tr key={d}>
                      <td className="border border-border bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">{(d * 100).toFixed(0)}%</td>
                      {grs.map((g) => {
                        const cell = sensitivity.find(
                          (c) => Math.abs(c.discountRate - d) < 1e-6 && Math.abs(c.growthRate - g) < 1e-6
                        );
                        const fp = cell?.fairPerShare ?? null;
                        return (
                          <td key={g} className="border border-border px-3 py-2 text-right font-mono">
                            {priceLabel(fp, data.currency)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {fairLo != null && fairHi != null && data.price != null && (
              <div className="mt-3 text-xs text-muted-foreground">
                해석: 가정에 따라 적정가가 <strong>{priceLabel(fairLo, data.currency)}</strong> ~ <strong>{priceLabel(fairHi, data.currency)}</strong> 범위로 변동
                {" "}(현재가 대비 {((fairLo - data.price) / data.price * 100).toFixed(0)}% ~ {((fairHi - data.price) / data.price * 100).toFixed(0)}%).
                <span className="ml-1">DCF는 가정에 매우 민감하다는 걸 직접 확인하세요.</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 시계열 데이터 (참고용) */}
      {analysis.series.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">연간 재무 시계열</CardTitle>
            <p className="text-xs text-muted-foreground">출처: Yahoo Finance ({analysis.seriesSource})</p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="border border-border bg-muted px-2 py-1 text-left text-muted-foreground">연도</th>
                    <th className="border border-border bg-muted px-2 py-1 text-right text-muted-foreground">매출</th>
                    <th className="border border-border bg-muted px-2 py-1 text-right text-muted-foreground">영업CF</th>
                    <th className="border border-border bg-muted px-2 py-1 text-right text-muted-foreground">Capex</th>
                    <th className="border border-border bg-muted px-2 py-1 text-right text-muted-foreground">FCF</th>
                    <th className="border border-border bg-muted px-2 py-1 text-right text-muted-foreground">영업이익</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.series.map((s) => (
                    <tr key={s.year}>
                      <td className="border border-border px-2 py-1 font-medium">{s.year}</td>
                      <td className="border border-border px-2 py-1 text-right font-mono">{fmtMoney(s.revenue, data.currency)}</td>
                      <td className="border border-border px-2 py-1 text-right font-mono">{fmtMoney(s.operatingCF, data.currency)}</td>
                      <td className="border border-border px-2 py-1 text-right font-mono">{fmtMoney(s.capex, data.currency)}</td>
                      <td className={`border border-border px-2 py-1 text-right font-mono ${s.fcf != null && s.fcf < 0 ? "text-rose-700" : ""}`}>{fmtMoney(s.fcf, data.currency)}</td>
                      <td className="border border-border px-2 py-1 text-right font-mono">{fmtMoney(s.ebit, data.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function AssumptionRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="font-mono text-sm font-semibold">{value}</span>
      </div>
      {hint && <div className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</div>}
    </div>
  );
}
