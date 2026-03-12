import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { loadState, saveState } from "@/lib/ai-trading-store";
import {
  BuySignalCandidate,
  D_MINUS_1_MAX_VALUE,
  D_DAY_MIN_VALUE,
  D_DAY_MAX_VALUE,
  D_DAY_MIN_CHANGE,
  D_DAY_MAX_CHANGE,
  D_PLUS_1_RATIO,
  D_PLUS_2_MIN_VALUE,
} from "@/lib/types/ai-trading";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NAVER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

interface NaverStockRaw {
  itemCode: string;
  stockName: string;
  closePrice: string;
  fluctuationsRatio: string;
  compareToPreviousPrice: { code: string };
  accumulatedTradingValue: string;
  openPrice?: string;
  localTradedAt: string;
}

const ETF_BRAND_RE =
  /^(KODEX|TIGER|KBSTAR|ACE|ARIRANG|HANARO|SOL|KOSEF|KINDEX|TIMEFOLIO|PLUS|FOCUS|WOORI|BNK|RISE|KIWOOM|KoAct|WON|HK|1Q|TIME|DAISHIN\d+|UNICORN|TRUSTON|VITA|에셋플러스|마이다스|더제이|파워|마이티|히어로)\s/;

function isRegularStock(name: string): boolean {
  if (/ETF|ETN/i.test(name)) return false;
  if (ETF_BRAND_RE.test(name)) return false;
  if (name.includes("리츠") || /REIT/i.test(name)) return false;
  if (/스팩/.test(name)) return false;
  if (/채권|선물|인버스|레버리지/.test(name)) return false;
  if (/^(맥쿼리|KB발해)인프라/.test(name)) return false;
  if (/우[A-C]?$/.test(name)) return false;
  return true;
}

function parseNum(s: string): number {
  return Number(s.replace(/,/g, "")) || 0;
}

async function fetchNaverMarket(
  market: string
): Promise<
  {
    code: string;
    name: string;
    closePrice: number;
    changeRate: number;
    tradingValue: number;
    market: string;
  }[]
> {
  const results: {
    code: string;
    name: string;
    closePrice: number;
    changeRate: number;
    tradingValue: number;
    market: string;
  }[] = [];
  const PAGE_SIZE = 100;

  const firstUrl = `https://m.stock.naver.com/api/stocks/marketValue/${market}?page=1&pageSize=${PAGE_SIZE}`;
  const firstRes = await fetch(firstUrl, {
    headers: NAVER_HEADERS,
    signal: AbortSignal.timeout(10000),
  });
  if (!firstRes.ok) return [];
  const firstJson = await firstRes.json();
  const totalPages = Math.ceil(firstJson.totalCount / PAGE_SIZE);

  const processStocks = (stocks: NaverStockRaw[]) => {
    for (const s of stocks) {
      if (!isRegularStock(s.stockName)) continue;
      results.push({
        code: s.itemCode,
        name: s.stockName,
        closePrice: parseNum(s.closePrice),
        changeRate: parseNum(s.fluctuationsRatio),
        tradingValue: parseNum(s.accumulatedTradingValue) * 1_000_000,
        market,
      });
    }
  };

  processStocks(firstJson.stocks);

  for (let page = 2; page <= totalPages; page += 5) {
    const batch = [];
    for (let p = page; p < page + 5 && p <= totalPages; p++) {
      batch.push(
        fetch(
          `https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${p}&pageSize=${PAGE_SIZE}`,
          { headers: NAVER_HEADERS, signal: AbortSignal.timeout(10000) }
        )
          .then((r) => r.json())
          .then((j) => j.stocks as NaverStockRaw[])
          .catch(() => [] as NaverStockRaw[])
      );
    }
    const batched = await Promise.all(batch);
    for (const stocks of batched) processStocks(stocks);
  }

  return results;
}

/** 개별 종목 시가 조회 */
async function fetchOpenPrice(code: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://m.stock.naver.com/api/stock/${code}/price`,
      { headers: NAVER_HEADERS, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0 && data[0].openPrice) {
      return parseNum(String(data[0].openPrice));
    }
    if (data?.openPrice) return parseNum(String(data.openPrice));
    return null;
  } catch {
    return null;
  }
}

/** siseJson으로 이전 거래일 거래대금 조회 */
async function fetchPrevDayValue(
  code: string,
  endDate: string
): Promise<{ date: string; tradingValue: number; closePrice: number } | null> {
  const d = new Date(
    parseInt(endDate.slice(0, 4)),
    parseInt(endDate.slice(4, 6)) - 1,
    parseInt(endDate.slice(6, 8))
  );
  d.setDate(d.getDate() - 10);
  const startDate = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

  const url = `https://api.finance.naver.com/siseJson.naver?symbol=${code}&requestType=1&startTime=${startDate}&endTime=${endDate}&timeframe=day`;
  try {
    const res = await fetch(url, {
      headers: NAVER_HEADERS,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    const parsed = JSON.parse(text.trim().replace(/'/g, '"'));
    if (!Array.isArray(parsed) || parsed.length < 3) return null;

    // 마지막에서 2번째가 이전 거래일 (마지막은 오늘)
    const row = parsed[parsed.length - 2];
    return {
      date: String(row[0]).trim(),
      tradingValue: Math.round(Number(row[4]) * Number(row[5])),
      closePrice: Number(row[4]),
    };
  } catch {
    return null;
  }
}

function getKSTDate(): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const kst = new Date(utc + 9 * 3600000);
  return `${kst.getFullYear()}${String(kst.getMonth() + 1).padStart(2, "0")}${String(kst.getDate()).padStart(2, "0")}`;
}

/**
 * 매일 KST 16:00에 실행 — 종목 스캔
 *
 * 1. 새 D일 폭발 종목 찾기 (D-1 ≤ 300억, D ≥ 950억 & < 5000억, 등락률 10~20%, 양봉, 보통주)
 * 2. 기존 D1_WAITING → D+1 체크 (D+1 거래대금 ≤ D × 1/3)
 * 3. 기존 D2_CHECKING → D+2 체크 (D+2 종가 > D+1 종가, D+2 거래대금 ≥ 300억)
 */
export async function GET() {
  const LOCK_KEY = "lock:cron:ai-trading-scan";
  const locked = await redis.set(LOCK_KEY, "1", { ex: 600, nx: true });
  if (!locked) {
    return NextResponse.json({ message: "이미 실행 중 (lock)" });
  }
  try {
  const todayDate = getKSTDate();
  const state = await loadState();

  // 이미 오늘 스캔했으면 skip
  if (state.lastScanDate === todayDate) {
    return NextResponse.json({
      message: "이미 오늘 스캔 완료",
      date: todayDate,
    });
  }

  console.log(`[ai-trading-scan] 스캔 시작: ${todayDate}`);

  // 1. 전종목 데이터 조회
  const [kospi, kosdaq] = await Promise.all([
    fetchNaverMarket("KOSPI"),
    fetchNaverMarket("KOSDAQ"),
  ]);
  const allStocks = [...kospi, ...kosdaq];

  if (allStocks.length === 0) {
    return NextResponse.json(
      { error: "네이버 데이터 조회 실패" },
      { status: 500 }
    );
  }

  const stockMap = new Map(allStocks.map((s) => [s.code, s]));

  // 2. 기존 candidates 업데이트
  const updatedCandidates: BuySignalCandidate[] = [];

  for (const c of state.candidates) {
    const current = stockMap.get(c.code);
    if (!current) continue;

    if (c.stage === "D1_WAITING") {
      // D+1 체크: 거래대금 ≤ D × 1/3
      if (current.tradingValue <= c.dTradingValue * D_PLUS_1_RATIO) {
        console.log(
          `[scan] ${c.name}: D+1 통과 (${(current.tradingValue / 1e8).toFixed(0)}억 ≤ ${(c.dTradingValue * D_PLUS_1_RATIO / 1e8).toFixed(0)}억)`
        );
        updatedCandidates.push({
          ...c,
          dPlusOneTradingValue: current.tradingValue,
          dPlusOneClosePrice: current.closePrice,
          stage: "D2_CHECKING",
        });
      } else {
        console.log(
          `[scan] ${c.name}: D+1 탈락 (거래대금 ${(current.tradingValue / 1e8).toFixed(0)}억 > ${(c.dTradingValue * D_PLUS_1_RATIO / 1e8).toFixed(0)}억)`
        );
      }
    } else if (c.stage === "D2_CHECKING") {
      // D+2 체크: 종가 > D+1 종가, 거래대금 ≥ 300억
      if (
        current.closePrice > (c.dPlusOneClosePrice || 0) &&
        current.tradingValue >= D_PLUS_2_MIN_VALUE
      ) {
        console.log(
          `[scan] ${c.name}: D+2 통과 → D+3 매수 대기 (종가 ${current.closePrice} > ${c.dPlusOneClosePrice}, 거래대금 ${(current.tradingValue / 1e8).toFixed(0)}억)`
        );
        updatedCandidates.push({
          ...c,
          dPlusTwoClosePrice: current.closePrice,
          dPlusTwoTradingValue: current.tradingValue,
          stage: "D3_BUY_READY",
        });
      } else {
        console.log(
          `[scan] ${c.name}: D+2 탈락 (종가=${current.closePrice}, D+1종가=${c.dPlusOneClosePrice}, 거래대금=${(current.tradingValue / 1e8).toFixed(0)}억)`
        );
      }
    } else if (c.stage === "D3_BUY_READY") {
      // 이미 매수 대기 상태 — trade-check에서 처리
      updatedCandidates.push(c);
    }
  }

  // 3. 새 D일 폭발 종목 찾기
  const newCandidates: BuySignalCandidate[] = [];
  const existingCodes = new Set(updatedCandidates.map((c) => c.code));
  const positionCodes = new Set(state.positions.map((p) => p.code));

  // 거래대금 950억~5000억, 등락률 10~20% 필터
  const potentials = allStocks.filter(
    (s) =>
      s.tradingValue >= D_DAY_MIN_VALUE &&
      s.tradingValue < D_DAY_MAX_VALUE &&
      s.changeRate >= D_DAY_MIN_CHANGE &&
      s.changeRate <= D_DAY_MAX_CHANGE &&
      !existingCodes.has(s.code) &&
      !positionCodes.has(s.code)
  );

  console.log(`[scan] 잠재 폭발 종목: ${potentials.length}개`);

  // 각 종목의 D-1 거래대금 확인 + 갭상승 음봉 체크
  for (const s of potentials) {
    // 갭상승 10%+ 음봉 체크
    const openPrice = await fetchOpenPrice(s.code);
    if (openPrice) {
      const prevClose = s.closePrice / (1 + s.changeRate / 100);
      const gapPct = ((openPrice - prevClose) / prevClose) * 100;
      if (gapPct >= 10 && s.closePrice < openPrice) {
        console.log(
          `[scan] ${s.name}: 갭상승+음봉 제외 (갭=${gapPct.toFixed(1)}%)`
        );
        continue;
      }
    }

    // D-1 거래대금 확인
    const prev = await fetchPrevDayValue(s.code, todayDate);
    if (!prev) continue;

    if (prev.tradingValue <= D_MINUS_1_MAX_VALUE) {
      console.log(
        `[scan] 새 D일 폭발: ${s.name} (D-1=${(prev.tradingValue / 1e8).toFixed(0)}억, D=${(s.tradingValue / 1e8).toFixed(0)}억, 등락률=${s.changeRate}%)`
      );
      newCandidates.push({
        code: s.code,
        name: s.name,
        market: s.market,
        dDate: todayDate,
        dTradingValue: s.tradingValue,
        dClosePrice: s.closePrice,
        dChangeRate: s.changeRate,
        dPlusOneTradingValue: 0,
        dPlusOneClosePrice: 0,
        stage: "D1_WAITING",
      });
    }
  }

  state.candidates = [...updatedCandidates, ...newCandidates];
  state.lastScanDate = todayDate;

  // 보유 종목 평가액 갱신 → equity curve
  const investedValue = state.positions.reduce((sum, p) => {
    const current = stockMap.get(p.code);
    return sum + (current ? current.closePrice * p.quantity : p.buyPrice * p.quantity);
  }, 0);
  const totalAsset = state.cash + investedValue;

  state.equityCurve.push({
    date: todayDate,
    totalAsset,
    cash: state.cash,
    investedValue,
    returnRate:
      Math.round(
        ((totalAsset - state.initialCapital) / state.initialCapital) * 10000
      ) / 100,
  });

  await saveState(state);

  return NextResponse.json({
    message: "스캔 완료",
    date: todayDate,
    newCandidates: newCandidates.length,
    updatedCandidates: updatedCandidates.length,
    totalCandidates: state.candidates.length,
    positions: state.positions.length,
  });
  } catch (error) {
    console.error("[ai-trading-scan] 스캔 중 에러:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  } finally {
    await redis.del(LOCK_KEY).catch(() => {});
  }
}
