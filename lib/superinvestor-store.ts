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
  MIN_ADD_PERCENT,
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

  // Period 열 위치는 헤더 텍스트로 찾는다 (열 번호 고정 X). colspan 도 반영.
  // 헤더 칸이 <th> 가 아니라 <td> 다: Portfolio Manager - Firm | Period | Top 10 Buys/Sells(colspan=10)
  let periodIdx = -1;
  let colPos = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $("table#grid thead tr").first().children("th, td").each((_: any, th: any) => {
    const $th = $(th);
    if (periodIdx < 0 && $th.text().trim().toLowerCase() === "period") {
      periodIdx = colPos;
    }
    colPos += parseInt($th.attr("colspan") || "1", 10) || 1;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $("table#grid tbody tr").each((_: any, row: any) => {
    const cells = $(row).find("td");
    if (cells.length < 3) return;

    const investor = $(cells[0]).find("a").text().trim();
    if (!investor) return;

    const period =
      periodIdx >= 0 && periodIdx < cells.length
        ? $(cells[periodIdx]).text().replace(/\s+/g, " ").trim()
        : "";

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
        period,
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

// Dataroma 는 클래스주를 "BRK.B" 로, Yahoo 는 "BRK-B" 로 쓴다.
// 변환은 Yahoo 조회에만 쓰고, 결과 Map 키는 Dataroma 티커 그대로 둔다.
function toYahooTicker(ticker: string): string {
  return ticker.replace(/\./g, "-");
}

async function fetchCurrentPrices(
  tickers: string[]
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  for (let i = 0; i < tickers.length; i += 10) {
    const batch = tickers.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map(async (t) => {
        const q = await yahooFinance.quote(toYahooTicker(t));
        const quote = q as unknown as { regularMarketPrice?: number } | undefined;
        return { ticker: t, price: quote?.regularMarketPrice ?? 0 };
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

  // 조용히 빠지지 않게: 가격을 못 가져온 티커는 경고로 남긴다 (예: WBD-OLD)
  const missing = tickers.filter((t) => !prices.has(t));
  if (missing.length > 0) {
    console.warn(
      `[superinvestor] 현재가 조회 실패 ${missing.length}개: ${missing.join(", ")}`
    );
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

// 투자자 수 기준으로 가장 많은 기간을 "기준 분기"로 고른다.
// 제출이 늦거나 끊긴 투자자(예: 지난 분기 기간이 남아 있는 경우)를 이번 분기 집계에서 뺀다.
function pickQuarter(activities: ActivityRecord[]): string {
  const investorPeriod = new Map<string, string>();
  for (const a of activities) {
    if (a.period && !investorPeriod.has(a.investor)) {
      investorPeriod.set(a.investor, a.period);
    }
  }
  const counts = new Map<string, number>();
  for (const p of investorPeriod.values()) {
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  let quarter = "";
  let best = 0;
  for (const [p, n] of counts) {
    // 동점이면 더 최신 분기를 고른다 (공시 시즌에 신·구 분기 인원이 비슷할 수 있음)
    if (n > best || (n === best && quarterRank(p) > quarterRank(quarter))) {
      quarter = p;
      best = n;
    }
  }
  return quarter;
}

// "Q2 2026" → 20262. 형식이 다르면 -1
function quarterRank(period: string): number {
  const m = period.match(/^Q([1-4])\s+(\d{4})$/);
  return m ? parseInt(m[2], 10) * 10 + parseInt(m[1], 10) : -1;
}

export async function collectAll(
  options: { save?: boolean } = {}
): Promise<SuperinvestorStore> {
  const { save = true } = options;
  console.log("[superinvestor] 수집 시작");

  // 1. 매매 활동 + 투자자 목록 동시 수집
  const [allActivities, managers] = await Promise.all([
    fetchAllActivity(),
    fetchManagers(),
  ]);
  console.log(
    `[superinvestor] 활동 ${allActivities.length}건, 투자자 ${managers.length}명`
  );

  // 2. 기준 분기 활동만 남긴다. Period 를 못 읽으면 필터 없이 진행.
  const quarter = pickQuarter(allActivities);
  let activities = allActivities;
  if (!quarter) {
    console.warn(
      "[superinvestor] Period 열을 못 찾았거나 값이 비어 있음 → 분기 필터 없이 진행"
    );
  } else {
    const excluded = new Map<string, string>();
    for (const a of allActivities) {
      if (a.period !== quarter) excluded.set(a.investor, a.period || "(기간 없음)");
    }
    activities = allActivities.filter((a) => a.period === quarter);
    console.log(
      `[superinvestor] 기준 분기 ${quarter}, 제외 투자자 ${excluded.size}명` +
        (excluded.size > 0
          ? `: ${Array.from(excluded, ([inv, p]) => `${inv} (${p})`).join(", ")}`
          : "")
    );
  }

  // 3. Buy 는 그대로, Add 는 MIN_ADD_PERCENT 이상만 인정 → 동시 매수 2명↑ 종목 추출
  const smallAdds = activities.filter(
    (a) => a.activityType === "Add" && a.changePercent < MIN_ADD_PERCENT
  );
  console.log(
    `[superinvestor] Add ${MIN_ADD_PERCENT}% 미만 제외: ${smallAdds.length}건`
  );
  const buyActivities = activities.filter(
    (a) =>
      a.activityType === "Buy" ||
      (a.activityType === "Add" && a.changePercent >= MIN_ADD_PERCENT)
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
    quarter,
    lastUpdated: new Date().toISOString(),
  };

  if (save) {
    await saveData(store);
    console.log("[superinvestor] 저장 완료");
  }

  return store;
}
