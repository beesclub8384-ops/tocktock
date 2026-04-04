import * as cheerio from "cheerio";
import YahooFinance from "yahoo-finance2";
import { redis } from "@/lib/redis";
import {
  type ActivityRecord,
  type ConsensusStock,
  type DiscountStock,
  type InsiderStock,
  type Manager,
  type Holding,
  type StockDetail,
  type SuperinvestorStore,
  REDIS_KEYS,
  SUPERINVESTOR_TTL,
} from "@/lib/types/superinvestor";

const yahooFinance = new YahooFinance();

const DATAROMA_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const FETCH_OPTS: RequestInit = {
  headers: { "User-Agent": DATAROMA_UA },
  signal: AbortSignal.timeout(15000),
};

// ─── 1. allact.php 파싱: 전체 매매 활동 ───

export async function fetchAllActivity(): Promise<ActivityRecord[]> {
  const url = "https://www.dataroma.com/m/allact.php?typ=a";
  const res = await fetch(url, FETCH_OPTS);
  if (!res.ok) throw new Error(`AllAct fetch failed: ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);
  const records: ActivityRecord[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $("table#grid tbody tr").each((_: any, row: any) => {
    const cells = $(row).find("td");
    if (cells.length < 3) return;

    const investor = $(cells[0]).find("a").text().trim();
    if (!investor) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $(row).find("td.sym").each((_2: any, symCell: any) => {
      const $cell = $(symCell);
      const link = $cell.find("a").first();
      const ticker = link.text().trim();
      if (!ticker) return;

      const divHtml = $cell.find("div").html() || "";
      const lines = divHtml
        .split(/<br\s*\/?>/i)
        .map((s: string) => s.replace(/<[^>]+>/g, "").trim());

      const companyName = lines[0] || ticker;
      const activityText = lines[1] || "";
      let activityType: ActivityRecord["activityType"] = "Buy";
      let changePercent = 0;

      if (activityText.startsWith("Add")) {
        activityType = "Add";
        const m = activityText.match(/([\d.]+)%/);
        if (m) changePercent = parseFloat(m[1]);
      } else if (activityText.startsWith("Reduce")) {
        activityType = "Reduce";
        const m = activityText.match(/([\d.]+)%/);
        if (m) changePercent = parseFloat(m[1]);
      } else if (activityText.startsWith("Sell")) {
        activityType = "Sell";
        const m = activityText.match(/([\d.]+)%/);
        if (m) changePercent = parseFloat(m[1]);
      }

      let portfolioWeight = 0;
      const wm = (lines[2] || "").match(/([\d.]+)%/);
      if (wm) portfolioWeight = parseFloat(wm[1]);

      records.push({
        ticker,
        companyName,
        investor,
        activityType,
        changePercent,
        portfolioWeight,
      });
    });
  });

  return records;
}

// ─��─ 2. stock.php 파싱: 보유자 + 인사이더 + Hold Price ───

export async function fetchStockDetail(
  ticker: string
): Promise<StockDetail | null> {
  const url = `https://www.dataroma.com/m/stock.php?sym=${encodeURIComponent(ticker)}`;
  try {
    const res = await fetch(url, FETCH_OPTS);
    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    // Hold Price: td#price
    const priceText = $("td#price").text().trim().replace(/[$,]/g, "");
    const holdPrice = parseFloat(priceText) || 0;

    // 보유자 목록: table#grid
    // th: History | Portfolio Manager | % of portfolio | Recent activity | Shares | Value
    const holders: StockDetail["holders"] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $("table#grid tbody tr").each((_: any, row: any) => {
      const cells = $(row).find("td");
      if (cells.length < 4) return;
      const name = $(cells[1]).text().trim();
      const weight = parseFloat($(cells[2]).text().trim()) || 0;
      const activity = $(cells[3]).text().trim();
      if (name) holders.push({ name, weight, activity });
    });

    // 인사이더: table#ins_sum
    let insiderBuyCount = 0;
    let insiderBuyAmount = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $("table#ins_sum tr").each((_: any, row: any) => {
      const $row = $(row);
      if ($row.hasClass("buys")) {
        const cells = $row.find("td");
        if (cells.length >= 3) {
          insiderBuyCount =
            parseInt($(cells[1]).text().trim().replace(/,/g, "")) || 0;
          insiderBuyAmount =
            parseFloat($(cells[2]).text().trim().replace(/[$,]/g, "")) || 0;
        }
      }
    });

    return { ticker, holdPrice, holders, insiderBuyCount, insiderBuyAmount };
  } catch {
    return null;
  }
}

// ─── 3. managers.php 파싱: 투자자 목록 ───

export async function fetchManagers(): Promise<Manager[]> {
  const url = "https://www.dataroma.com/m/managers.php";
  const res = await fetch(url, FETCH_OPTS);
  if (!res.ok) throw new Error(`Managers fetch failed: ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);
  const managers: Manager[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $('a[href*="holdings.php?m="]').each((_: any, el: any) => {
    const href = $(el).attr("href") || "";
    const codeMatch = href.match(/m=([^&]+)/);
    if (!codeMatch) return;
    const name = $(el).text().trim();
    if (name) managers.push({ code: codeMatch[1], name });
  });

  return managers;
}

// ─── 4. holdings.php 파싱: 개별 투자자 포트폴리오 ───

export async function fetchHoldings(managerCode: string): Promise<Holding[]> {
  const url = `https://www.dataroma.com/m/holdings.php?m=${encodeURIComponent(managerCode)}`;
  const res = await fetch(url, FETCH_OPTS);
  if (!res.ok) throw new Error(`Holdings fetch failed: ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);
  const holdings: Holding[] = [];

  // th: History | Stock | % of Portfolio | Recent Activity | Shares | Reported Price | Value | gap | Current Price | +/- Reported | 52W Low | 52W High
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $("table#grid tbody tr").each((_: any, row: any) => {
    const cells = $(row).find("td");
    if (cells.length < 10) return;

    const stockText = $(cells[1]).text().trim();
    // "AAPL - Apple Inc." or "BN - Brookfield Corp."
    const match = stockText.match(/^(\S+)\s*-\s*(.+)$/);
    if (!match) return;

    const ticker = match[1];
    const companyName = match[2].trim();
    const weightPercent = parseFloat($(cells[2]).text().trim()) || 0;
    const activity = $(cells[3]).text().trim();
    const reportedPrice =
      parseFloat($(cells[5]).text().trim().replace(/[$,]/g, "")) || 0;
    const currentPrice =
      parseFloat($(cells[8]).text().trim().replace(/[$,]/g, "")) || 0;
    const changePctText = $(cells[9]).text().trim().replace(/%/g, "");
    const changePct = parseFloat(changePctText) || 0;

    holdings.push({
      ticker,
      companyName,
      weightPercent,
      activity,
      reportedPrice,
      currentPrice,
      changePct,
    });
  });

  return holdings;
}

// ─── Yahoo Finance 현재가 일괄 조회 ───

async function fetchCurrentPrices(
  tickers: string[]
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  for (let i = 0; i < tickers.length; i += 10) {
    const batch = tickers.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map(async (t) => {
        const q = await yahooFinance.quote(t);
        const quote = q as unknown as { regularMarketPrice?: number };
        return { ticker: t, price: quote.regularMarketPrice ?? 0 };
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.price > 0) {
        prices.set(r.value.ticker, r.value.price);
      }
    }
    if (i + 10 < tickers.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return prices;
}

// ─── Redis 저장/��회 ───

export async function loadData(): Promise<SuperinvestorStore | null> {
  try {
    return (await redis.get<SuperinvestorStore>(REDIS_KEYS.DATA)) ?? null;
  } catch {
    return null;
  }
}

async function saveData(data: SuperinvestorStore): Promise<void> {
  await redis.set(REDIS_KEYS.DATA, data, { ex: SUPERINVESTOR_TTL });
}

// ─── 전체 수집 파이프라인 ───

export async function collectAll(): Promise<SuperinvestorStore> {
  console.log("[superinvestor] 수집 시작");

  // 1. 매매 활동 + 투자자 목록 동시 수집
  const [activities, managers] = await Promise.all([
    fetchAllActivity(),
    fetchManagers(),
  ]);
  console.log(
    `[superinvestor] 활동 ${activities.length}건, 투자자 ${managers.length}명`
  );

  // 2. Buy/Add만 필터 → 동시 매수 2명↑ 종목 추출
  const buyActivities = activities.filter(
    (a) => a.activityType === "Buy" || a.activityType === "Add"
  );

  const tickerMap = new Map<
    string,
    {
      companyName: string;
      buyers: Map<string, "Buy" | "Add">;
    }
  >();

  for (const act of buyActivities) {
    let entry = tickerMap.get(act.ticker);
    if (!entry) {
      entry = { companyName: act.companyName, buyers: new Map() };
      tickerMap.set(act.ticker, entry);
    }
    if (!entry.buyers.has(act.investor)) {
      entry.buyers.set(act.investor, act.activityType as "Buy" | "Add");
    }
  }

  // 섹션 1: 동시 매수 종목 (2명↑)
  const consensus: ConsensusStock[] = [];
  const consensusTickers: string[] = [];

  for (const [ticker, entry] of tickerMap) {
    if (entry.buyers.size >= 2) {
      consensus.push({
        ticker,
        companyName: entry.companyName,
        buyerCount: entry.buyers.size,
        buyers: Array.from(entry.buyers.entries()).map(([name, type]) => ({
          name,
          activityType: type,
        })),
      });
      consensusTickers.push(ticker);
    }
  }
  consensus.sort((a, b) => b.buyerCount - a.buyerCount);
  console.log(`[superinvestor] 동시 매수 2명↑: ${consensus.length}개`);

  // 3. 동시 매수 종목들만 stock.php 호출 (배치 5개, 1초 대기)
  const stockDetails = new Map<string, StockDetail>();
  for (let i = 0; i < consensusTickers.length; i += 5) {
    const batch = consensusTickers.slice(i, i + 5);
    const results = await Promise.all(batch.map((t) => fetchStockDetail(t)));
    for (let j = 0; j < batch.length; j++) {
      if (results[j]) stockDetails.set(batch[j], results[j]!);
    }
    if (i + 5 < consensusTickers.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  console.log(`[superinvestor] stock.php: ${stockDetails.size}개 수집`);

  // 4. Yahoo Finance 현재가 조회
  const currentPrices = await fetchCurrentPrices(consensusTickers);
  console.log(`[superinvestor] 현재가: ${currentPrices.size}개 조회`);

  // 섹션 2: 할인 중인 종목
  const discount: DiscountStock[] = [];
  for (const [ticker, detail] of stockDetails) {
    const currentPrice = currentPrices.get(ticker);
    if (!currentPrice || detail.holdPrice <= 0) continue;

    // 비중 3%↑ 보유자 있는지 확인
    const highWeightHolders = detail.holders.filter((h) => h.weight >= 3);
    if (highWeightHolders.length === 0) continue;

    // 현재가 < Hold Price (할인 ��)
    if (currentPrice >= detail.holdPrice) continue;

    const discountPct =
      ((currentPrice - detail.holdPrice) / detail.holdPrice) * 100;
    const topHolder = highWeightHolders.sort(
      (a, b) => b.weight - a.weight
    )[0];
    const cEntry = consensus.find((c) => c.ticker === ticker);

    discount.push({
      ticker,
      companyName: cEntry?.companyName ?? ticker,
      topHolder: topHolder.name,
      topHolderWeight: topHolder.weight,
      holdPrice: detail.holdPrice,
      currentPrice,
      discountPercent: Math.round(discountPct * 100) / 100,
      holderCount: detail.holders.length,
    });
  }
  discount.sort((a, b) => a.discountPercent - b.discountPercent);
  console.log(`[superinvestor] 할인 종목: ${discount.length}개`);

  // 섹션 3: 거물 + 내부자 동시 매수
  const insider: InsiderStock[] = [];
  for (const [ticker, detail] of stockDetails) {
    if (detail.insiderBuyCount <= 0) continue;
    const cEntry = consensus.find((c) => c.ticker === ticker);
    insider.push({
      ticker,
      companyName: cEntry?.companyName ?? ticker,
      superinvestorCount: detail.holders.length,
      insiderBuyCount: detail.insiderBuyCount,
      insiderBuyAmount: detail.insiderBuyAmount,
    });
  }
  insider.sort((a, b) => b.insiderBuyCount - a.insiderBuyCount);
  console.log(`[superinvestor] 내부자 동반 매수: ${insider.length}개`);

  const store: SuperinvestorStore = {
    consensus,
    discount,
    insider,
    managers,
    lastUpdated: new Date().toISOString(),
  };

  await saveData(store);
  console.log("[superinvestor] 저장 완료");

  return store;
}
