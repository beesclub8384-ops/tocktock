import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import resultsData from "@/data/sectors/classification/results.json";
import sectorsData from "@/data/sectors/sectors.json";

/**
 * 섹터 보드 빌더 + cron 핸들러.
 * 네이버 전종목 시세(시총·등락률·거래대금) → results.json 분류와 조인
 *   → 소분류(섹터)별로 묶어 시총 내림차순 정렬 → Redis(sector-board:data) 저장.
 *
 * ⚠️ 네이버 수집 로직은 scripts/build-sector-board.mjs(로컬 수동 실행용)와 쌍둥이다.
 *    한쪽을 고치면 반드시 scripts/build-sector-board.mjs도 함께 반영할 것.
 */
export const SECTOR_BOARD_KEY = "sector-board:data";

const NAVER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "ko-KR,ko;q=0.9",
};

interface Quote {
  code: string;
  name: string;
  marketCap: number; // 원
  price: number; // 원
  changeRate: number; // %
  tradingValue: number; // 원
  market: "KOSPI" | "KOSDAQ";
}
interface NaverStock {
  itemCode?: string;
  stockName?: string;
  marketValueRaw?: string;
  closePriceRaw?: string;
  fluctuationsRatio?: string;
  accumulatedTradingValueRaw?: string;
  tradeStopType?: { name?: string };
}

// ── 네이버 한 시장 전종목 수집 (build-sector-board.mjs와 동일 로직) ──
async function fetchMarket(market: "KOSPI" | "KOSDAQ"): Promise<Quote[]> {
  const PAGE = 100;
  const out: Quote[] = [];
  const firstRes = await fetch(
    `https://m.stock.naver.com/api/stocks/marketValue/${market}?page=1&pageSize=${PAGE}`,
    { headers: NAVER_HEADERS, signal: AbortSignal.timeout(10000) }
  );
  const first = (await firstRes.json()) as { totalCount?: number; stocks?: NaverStock[] };
  const totalPages = Math.ceil((first.totalCount ?? 0) / PAGE);

  const collect = (stocks?: NaverStock[]) => {
    for (const s of stocks ?? []) {
      if (!s.itemCode || !s.stockName) continue;
      const cap = Number(s.marketValueRaw ?? "0");
      out.push({
        code: s.itemCode,
        name: s.stockName,
        marketCap: Number.isFinite(cap) ? cap : 0,
        price: Number(s.closePriceRaw ?? "0"),
        changeRate: Number(s.fluctuationsRatio ?? "0"),
        tradingValue: Number(s.accumulatedTradingValueRaw ?? "0"),
        market,
      });
    }
  };

  collect(first.stocks);
  // 5페이지씩 병렬 배치
  for (let p = 2; p <= totalPages; p += 5) {
    const batch: Promise<NaverStock[]>[] = [];
    for (let q = p; q < p + 5 && q <= totalPages; q++) {
      batch.push(
        fetch(
          `https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${q}&pageSize=${PAGE}`,
          { headers: NAVER_HEADERS, signal: AbortSignal.timeout(10000) }
        )
          .then((r) => (r.ok ? r.json() : { stocks: [] }))
          .then((j) => (j as { stocks?: NaverStock[] }).stocks ?? [])
          .catch(() => [] as NaverStock[])
      );
    }
    for (const stocks of await Promise.all(batch)) collect(stocks);
  }
  return out;
}

type ClassRow = { code: string; name: string; 칸?: string[] };
type Sectors = { 대분류: { name: string; 소분류: { name: string }[] }[] };

// ── 섹터 평균 등락 (시총가중 + 단순평균). build-sector-board.mjs와 동일 로직 ──
function sectorAverages(stocks: { changeRate: number; marketCap: number }[]) {
  let wSum = 0, capSum = 0, rSum = 0, n = 0;
  for (const s of stocks) {
    const r = Number(s.changeRate);
    if (!Number.isFinite(r)) continue;
    n++; rSum += r;
    const cap = Number(s.marketCap);
    if (Number.isFinite(cap) && cap > 0) { wSum += r * cap; capSum += cap; }
  }
  return {
    avgWeighted: capSum > 0 ? wSum / capSum : 0,
    avgSimple: n > 0 ? rSum / n : 0,
    avgCount: n,
  };
}

export async function buildSectorBoard() {
  const [kospi, kosdaq] = await Promise.all([fetchMarket("KOSPI"), fetchMarket("KOSDAQ")]);
  const quotes = [...kospi, ...kosdaq];
  const quoteByCode = new Map(quotes.map((q) => [q.code, q]));

  const results = resultsData as ClassRow[];
  const sectors = sectorsData as Sectors;

  // 소분류명 → 종목(시세) 리스트
  const cellMap = new Map<string, Quote[]>();
  for (const maj of sectors.대분류) for (const min of maj.소분류) cellMap.set(min.name, []);
  let joined = 0;
  for (const r of results) {
    if (!Array.isArray(r.칸) || r.칸.length === 0) continue;
    const q = quoteByCode.get(r.code);
    if (!q) continue; // 시세 없음(상폐 등)
    joined++;
    for (const c of r.칸) {
      const list = cellMap.get(c);
      if (list) list.push(q);
    }
  }

  // 섹터별 묶기 + 시총 내림차순
  const board: { name: string; 소분류: { name: string; count: number; stocks: Quote[] }[] }[] = [];
  let totalEntries = 0;
  for (const maj of sectors.대분류) {
    const subs = [];
    for (const min of maj.소분류) {
      const list = (cellMap.get(min.name) ?? []).slice().sort((a, b) => b.marketCap - a.marketCap);
      totalEntries += list.length;
      const { avgWeighted, avgSimple, avgCount } = sectorAverages(list);
      subs.push({ name: min.name, count: list.length, avgWeighted, avgSimple, avgCount, stocks: list });
    }
    board.push({ name: maj.name, 소분류: subs });
  }

  return {
    updatedAt: new Date().toISOString(),
    source: "naver marketValue API",
    units: { marketCap: "원", price: "원", tradingValue: "원", changeRate: "%" },
    totalQuotes: quotes.length,
    joined,
    totalEntries,
    대분류: board,
  };
}

// ── cron 핸들러 (GET 전용. weekly-calendar-cron.ts와 동일 골격) ──
export async function handleSectorBoardCron(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const blob = await buildSectorBoard();
    await redis.set(SECTOR_BOARD_KEY, blob); // Upstash 자동 직렬화 — JSON.stringify 금지
    return NextResponse.json({
      success: true,
      updatedAt: blob.updatedAt,
      totalQuotes: blob.totalQuotes,
      joined: blob.joined,
      totalEntries: blob.totalEntries,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
