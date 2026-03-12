import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { fetchFredLatest, calcMoM } from "@/lib/fetch-fred";
import { redis } from "@/lib/redis";
import { manualData } from "@/lib/money-flow-manual";
import type {
  Indicator,
  PlayerData,
  SummaryIndicator,
  MoneyFlowApiResponse,
} from "@/lib/money-flow-data";
import { PLAYER_META } from "@/lib/money-flow-data";

// ---------------------------------------------------------------------------
// 캐시 TTL
// ---------------------------------------------------------------------------
const FRED_TTL = 21600; // 6시간
const YF_TTL = 900; // 15분

// ---------------------------------------------------------------------------
// Yahoo Finance 인스턴스
// ---------------------------------------------------------------------------
const yahooFinance = new YahooFinance();

interface YahooQuoteResult {
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
}

// ---------------------------------------------------------------------------
// 캐싱 래퍼
// ---------------------------------------------------------------------------

async function cachedFred(
  seriesId: string,
  count: number = 2
): Promise<{ value: number; change: number }> {
  const cacheKey = `money-flow:fred:${seriesId}`;

  try {
    const cached = await redis.get<{ value: number; change: number }>(cacheKey);
    if (cached) return cached;
  } catch { /* miss */ }

  const obs = await fetchFredLatest(seriesId, count);
  const value = parseFloat(obs[0].value);
  const change = count >= 2 ? (calcMoM(obs) ?? 0) : 0;
  const result = { value, change };

  try {
    await redis.set(cacheKey, result, { ex: FRED_TTL });
  } catch { /* cache write fail ok */ }

  return result;
}

async function cachedYahoo(
  symbol: string
): Promise<{ price: number; change: number; changePercent: number }> {
  const cacheKey = `money-flow:yf:${symbol}`;

  try {
    const cached = await redis.get<{ price: number; change: number; changePercent: number }>(cacheKey);
    if (cached) return cached;
  } catch { /* miss */ }

  const raw = await yahooFinance.quote(symbol);
  const q = raw as unknown as YahooQuoteResult;
  const result = {
    price: q.regularMarketPrice ?? 0,
    change: q.regularMarketChange ?? 0,
    changePercent: q.regularMarketChangePercent ?? 0,
  };

  try {
    await redis.set(cacheKey, result, { ex: YF_TTL });
  } catch { /* cache write fail ok */ }

  return result;
}

// ---------------------------------------------------------------------------
// 지표 헬퍼
// ---------------------------------------------------------------------------

function ind(name: string, value: string, change: number, description: string, isManual?: boolean, updatedAt?: string): Indicator {
  return { name, value, change, description, ...(isManual && { isManual }), ...(updatedAt && { updatedAt }) };
}

function fmt(n: number, decimals: number = 2): string {
  return n.toFixed(decimals);
}

// ---------------------------------------------------------------------------
// FOMC 점도표 — Redis 우선, manual fallback
// ---------------------------------------------------------------------------

interface FomcDotPlotData {
  value: string;
  change: number;
  updatedAt: string;
}

async function getFomcDotPlot(): Promise<FomcDotPlotData> {
  try {
    const cached = await redis.get<FomcDotPlotData>("fomc-dot-plot");
    if (cached) return cached;
  } catch { /* miss */ }

  // Redis에 없으면 manual fallback
  return {
    value: manualData.fomcDotPlot.value,
    change: manualData.fomcDotPlot.change,
    updatedAt: manualData.fomcDotPlot.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// 주체별 데이터 수집
// ---------------------------------------------------------------------------

async function fetchFedData(): Promise<PlayerData> {
  const meta = PLAYER_META.find((p) => p.id === "fed")!;
  const [rate, walcl, fomc] = await Promise.allSettled([
    cachedFred("DFEDTARU", 2),
    cachedFred("WALCL", 2),
    getFomcDotPlot(),
  ]);

  const rateVal = rate.status === "fulfilled" ? rate.value : null;
  const walclVal = walcl.status === "fulfilled" ? walcl.value : null;
  const fomcVal = fomc.status === "fulfilled" ? fomc.value : null;

  // WALCL: millions → trillions
  const balanceT = walclVal ? walclVal.value / 1_000_000 : null;
  const balanceChange = walclVal ? walclVal.change / 1_000_000 : 0;

  // FOMC 점도표: Redis → manual fallback
  const dotPlot = fomcVal ?? {
    value: manualData.fomcDotPlot.value,
    change: manualData.fomcDotPlot.change,
    updatedAt: manualData.fomcDotPlot.updatedAt,
  };

  return {
    id: "fed",
    indicators: [
      ind(
        meta.indicatorMeta[0].name,
        rateVal ? `${fmt(rateVal.value)}%` : "N/A",
        rateVal?.change ?? 0,
        meta.indicatorMeta[0].description,
      ),
      ind(
        meta.indicatorMeta[1].name,
        balanceT ? `$${fmt(balanceT)}T` : "N/A",
        balanceChange,
        meta.indicatorMeta[1].description,
      ),
      ind(
        meta.indicatorMeta[2].name,
        dotPlot.value,
        dotPlot.change,
        meta.indicatorMeta[2].description,
        true,
        dotPlot.updatedAt,
      ),
    ],
  };
}

async function fetchInstitutionsData(): Promise<PlayerData> {
  const meta = PLAYER_META.find((p) => p.id === "institutions")!;
  const [sofr, spread] = await Promise.allSettled([
    cachedFred("SOFR", 2),
    cachedFred("BAMLC0A0CM", 2),
  ]);

  const sofrVal = sofr.status === "fulfilled" ? sofr.value : null;
  const spreadVal = spread.status === "fulfilled" ? spread.value : null;

  return {
    id: "institutions",
    indicators: [
      ind(
        meta.indicatorMeta[0].name,
        manualData.filing13F.value,
        manualData.filing13F.change,
        meta.indicatorMeta[0].description,
        true,
        manualData.filing13F.updatedAt,
      ),
      ind(
        meta.indicatorMeta[1].name,
        sofrVal ? `${fmt(sofrVal.value)}%` : "N/A",
        sofrVal?.change ?? 0,
        meta.indicatorMeta[1].description,
      ),
      ind(
        meta.indicatorMeta[2].name,
        spreadVal ? `${fmt(spreadVal.value)}%p` : "N/A",
        spreadVal?.change ?? 0,
        meta.indicatorMeta[2].description,
      ),
    ],
  };
}

async function fetchHedgefundsData(): Promise<PlayerData> {
  const meta = PLAYER_META.find((p) => p.id === "hedgefunds")!;
  const vixResult = await cachedYahoo("^VIX").catch(() => null);

  return {
    id: "hedgefunds",
    indicators: [
      ind(
        meta.indicatorMeta[0].name,
        manualData.shortInterest.value,
        manualData.shortInterest.change,
        meta.indicatorMeta[0].description,
        true,
        manualData.shortInterest.updatedAt,
      ),
      ind(
        meta.indicatorMeta[1].name,
        manualData.cotReport.value,
        manualData.cotReport.change,
        meta.indicatorMeta[1].description,
        true,
        manualData.cotReport.updatedAt,
      ),
      ind(
        meta.indicatorMeta[2].name,
        vixResult ? fmt(vixResult.price, 1) : "N/A",
        vixResult?.change ?? 0,
        meta.indicatorMeta[2].description,
      ),
    ],
  };
}

async function fetchBigtechData(): Promise<PlayerData> {
  const meta = PLAYER_META.find((p) => p.id === "bigtech")!;

  // 빅테크 3종 시총 참고용 — 자사주/CAPEX는 수동
  const [aapl, nvda, msft] = await Promise.allSettled([
    cachedYahoo("AAPL"),
    cachedYahoo("NVDA"),
    cachedYahoo("MSFT"),
  ]);

  // 빅테크 평균 등락률
  const prices = [aapl, nvda, msft]
    .filter((r): r is PromiseFulfilledResult<{ price: number; change: number; changePercent: number }> => r.status === "fulfilled");
  const avgChange = prices.length > 0
    ? prices.reduce((sum, r) => sum + r.value.changePercent, 0) / prices.length
    : 0;

  return {
    id: "bigtech",
    indicators: [
      ind(
        meta.indicatorMeta[0].name,
        manualData.earnings.value,
        manualData.earnings.change,
        meta.indicatorMeta[0].description,
        true,
        manualData.earnings.updatedAt,
      ),
      ind(
        meta.indicatorMeta[1].name,
        manualData.capex.value,
        manualData.capex.change,
        meta.indicatorMeta[1].description,
        true,
        manualData.capex.updatedAt,
      ),
      ind(
        meta.indicatorMeta[2].name,
        manualData.buybacks.value,
        manualData.buybacks.change,
        meta.indicatorMeta[2].description,
        true,
        manualData.buybacks.updatedAt,
      ),
    ],
  };
}

async function fetchGovernmentData(): Promise<PlayerData> {
  const meta = PLAYER_META.find((p) => p.id === "government")!;
  const [debt, payems] = await Promise.allSettled([
    cachedFred("GFDEBTN", 2),
    cachedFred("PAYEMS", 4),
  ]);

  const debtVal = debt.status === "fulfilled" ? debt.value : null;
  const payemsVal = payems.status === "fulfilled" ? payems.value : null;

  // GFDEBTN: millions → trillions
  const debtT = debtVal ? debtVal.value / 1_000_000 : null;

  // PAYEMS: MoM in thousands → K 표시
  const nfpMom = payemsVal ? payemsVal.change : null;

  return {
    id: "government",
    indicators: [
      ind(
        meta.indicatorMeta[0].name,
        debtT ? `$${fmt(debtT, 1)}T` : "N/A",
        debtVal?.change ?? 0,
        meta.indicatorMeta[0].description,
      ),
      ind(
        meta.indicatorMeta[1].name,
        nfpMom !== null ? `${nfpMom > 0 ? "+" : ""}${Math.round(nfpMom)}K (전월 대비)` : "N/A",
        nfpMom ?? 0,
        meta.indicatorMeta[1].description,
      ),
      ind(
        meta.indicatorMeta[2].name,
        manualData.regulationPolicy.value,
        manualData.regulationPolicy.change,
        meta.indicatorMeta[2].description,
        true,
        manualData.regulationPolicy.updatedAt,
      ),
    ],
  };
}

async function fetchRegulatorsData(): Promise<PlayerData> {
  const meta = PLAYER_META.find((p) => p.id === "regulators")!;

  return {
    id: "regulators",
    indicators: [
      ind(meta.indicatorMeta[0].name, manualData.financialRegulation.value, manualData.financialRegulation.change, meta.indicatorMeta[0].description, true, manualData.financialRegulation.updatedAt),
      ind(meta.indicatorMeta[1].name, manualData.antitrustProbe.value, manualData.antitrustProbe.change, meta.indicatorMeta[1].description, true, manualData.antitrustProbe.updatedAt),
      ind(meta.indicatorMeta[2].name, manualData.fxIntervention.value, manualData.fxIntervention.change, meta.indicatorMeta[2].description, true, manualData.fxIntervention.updatedAt),
    ],
  };
}

async function fetchRetailData(): Promise<PlayerData> {
  const meta = PLAYER_META.find((p) => p.id === "retail")!;
  const [umcsent, tdsp] = await Promise.allSettled([
    cachedFred("UMCSENT", 2),
    cachedFred("TDSP", 2),
  ]);

  const umcsentVal = umcsent.status === "fulfilled" ? umcsent.value : null;
  const tdspVal = tdsp.status === "fulfilled" ? tdsp.value : null;

  return {
    id: "retail",
    indicators: [
      ind(
        meta.indicatorMeta[0].name,
        umcsentVal ? fmt(umcsentVal.value, 1) : "N/A",
        umcsentVal?.change ?? 0,
        meta.indicatorMeta[0].description,
      ),
      ind(
        meta.indicatorMeta[1].name,
        tdspVal ? `${fmt(tdspVal.value, 1)}%` : "N/A",
        tdspVal?.change ?? 0,
        meta.indicatorMeta[1].description,
      ),
      ind(
        meta.indicatorMeta[2].name,
        manualData.retailFlow.value,
        manualData.retailFlow.change,
        meta.indicatorMeta[2].description,
        true,
        manualData.retailFlow.updatedAt,
      ),
    ],
  };
}

// ---------------------------------------------------------------------------
// 종합 지표 (상단 참고용)
// ---------------------------------------------------------------------------

async function fetchSummaryIndicators(): Promise<SummaryIndicator[]> {
  const tasks = [
    { id: "sp500", label: "S&P 500", symbol: "^GSPC" },
    { id: "dxy", label: "달러 인덱스", symbol: "DX-Y.NYB" },
    { id: "gold", label: "금", symbol: "GC=F" },
    { id: "us10y", label: "미국 10년 국채", symbol: "^TNX" },
  ];

  const results = await Promise.allSettled(
    tasks.map((t) => cachedYahoo(t.symbol))
  );

  return results.map((r, i) => {
    if (r.status === "fulfilled") {
      return {
        id: tasks[i].id,
        label: tasks[i].label,
        value: fmt(r.value.price, tasks[i].id === "us10y" ? 2 : tasks[i].id === "gold" ? 0 : 2),
        change: r.value.changePercent,
      };
    }
    return { id: tasks[i].id, label: tasks[i].label, value: "N/A", change: 0 };
  });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  // 수동 FOMC 점도표 갱신 트리거
  const { searchParams } = new URL(request.url);
  if (searchParams.get("refresh-fomc") === "1") {
    try {
      const baseUrl = new URL(request.url).origin;
      const cronRes = await fetch(
        `${baseUrl}/api/cron/update-fomc-dot-plot`,
        {
          headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
          signal: AbortSignal.timeout(10000),
        }
      );
      const cronData = await cronRes.json();
      console.log("[money-flow-data] FOMC 수동 갱신 결과:", cronData);
    } catch (e) {
      console.error("[money-flow-data] FOMC 수동 갱신 실패:", e);
    }
  }

  const playerTasks = [
    fetchFedData(),
    fetchInstitutionsData(),
    fetchHedgefundsData(),
    fetchBigtechData(),
    fetchGovernmentData(),
    fetchRegulatorsData(),
    fetchRetailData(),
  ];

  const [playerResults, summary] = await Promise.allSettled([
    Promise.allSettled(playerTasks),
    fetchSummaryIndicators(),
  ]);

  // 주체별 데이터 조합
  const players: PlayerData[] =
    playerResults.status === "fulfilled"
      ? playerResults.value.map((r, i) => {
          if (r.status === "fulfilled") return r.value;
          const fallbackId = ["fed", "institutions", "hedgefunds", "bigtech", "government", "regulators", "retail"][i];
          console.error(`[money-flow-data] ${fallbackId} failed:`, r.reason);
          return { id: fallbackId, indicators: PLAYER_META[i].indicatorMeta.map((m) => ind(m.name, "N/A", 0, m.description)) } as PlayerData;
        })
      : [];

  const summaryData: SummaryIndicator[] =
    summary.status === "fulfilled" ? summary.value : [];

  const response: MoneyFlowApiResponse = {
    players,
    summary: summaryData,
    fetchedAt: new Date().toISOString(),
  };

  return NextResponse.json(response);
}
