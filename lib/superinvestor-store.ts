import * as cheerio from "cheerio";
import { redis } from "@/lib/redis";
import {
  type ActivityRecord,
  type InsiderData,
  type SuperinvestorStock,
  type SuperinvestorData,
  SUPERINVESTOR_KEY,
  SUPERINVESTOR_TTL,
  MIN_DISPLAY_SCORE,
} from "@/lib/types/superinvestor";
import { aggregateActivities, calculateScores } from "@/lib/superinvestor-score";

const DATAROMA_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const FETCH_OPTS: RequestInit = {
  headers: { "User-Agent": DATAROMA_UA },
  signal: AbortSignal.timeout(15000),
};

// ─── Dataroma HTML 파싱 ───

/**
 * 전체 슈퍼투자자 최근 매매 활동 파싱
 * URL: https://www.dataroma.com/m/allact.php?typ=a
 *
 * 실제 HTML 구조 (table#grid):
 *   행 1개 = 투자자 1명
 *   td[0] class="firm"   → 투자자명 (링크 텍스트)
 *   td[1] class="period" → 분기 ("Q4 2025")
 *   td[2~11] class="sym" → Top 10 종목 각각:
 *     <a class="buy|sell" href="...">TICKER</a>
 *     <div>Company Name<br>Buy|Add X%|Reduce -X%|Sell -X%<br>Change to portfolio: X%</div>
 */
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

    // td[0] = 투자자명
    const investor = $(cells[0]).find("a").text().trim();
    if (!investor) return;

    // td[2~11] = 종목 셀들 (class="sym")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $(row).find("td.sym").each((_2: any, symCell: any) => {
      const $cell = $(symCell);
      const link = $cell.find("a").first();
      const ticker = link.text().trim();
      if (!ticker) return;

      // <div> 안의 텍스트를 <br> 기준으로 분리
      const divHtml = $cell.find("div").html() || "";
      const lines = divHtml.split(/<br\s*\/?>/i).map((s: string) => s.replace(/<[^>]+>/g, "").trim());
      // lines[0] = "Company Name"
      // lines[1] = "Buy" | "Add 269.87%" | "Reduce -64.58%" | "Sell -100.00%"
      // lines[2] = "Change to portfolio: 3.65%"

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

      // "Change to portfolio: 3.65%" → 3.65
      let portfolioWeight = 0;
      const weightLine = lines[2] || "";
      const wm = weightLine.match(/([\d.]+)%/);
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

/**
 * 전체 슈퍼투자자 보유종목에서 가격 데이터 추출
 * 각 투자자의 holdings 페이지에서 보고가/현재가 가져오기는 너무 많음
 * → 대신 stock.php에서 개별 종목 가격 데이터를 가져옴
 */
export async function fetchStockPrice(
  ticker: string
): Promise<{
  reportedPrice: number;
  currentPrice: number;
  priceChangePercent: number;
  insiderBuys: number;
  insiderBuyTotal: number;
} | null> {
  const url = `https://www.dataroma.com/m/stock.php?sym=${encodeURIComponent(ticker)}`;
  try {
    const res = await fetch(url, FETCH_OPTS);
    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    // 보고가: td#price
    const priceText = $("td#price").text().trim().replace(/[$,]/g, "");
    const reportedPrice = parseFloat(priceText) || 0;

    // 현재가 + 변동률: grid 테이블의 첫 행에서 추출
    // 대안: 종목 기본 정보 테이블에서 추출
    let currentPrice = reportedPrice;
    let priceChangePercent = 0;

    // grid 테이블에서 현재가/변동률 추출
    const gridRows = $("table#grid tbody tr");
    if (gridRows.length > 0) {
      const firstRow = gridRows.first();
      const quoteTd = firstRow.find("td.quote");
      const quotePctTd = firstRow.find("td.quote_pct");

      if (quoteTd.length) {
        const cp = quoteTd.text().trim().replace(/[$,]/g, "");
        const parsed = parseFloat(cp);
        if (parsed > 0) currentPrice = parsed;
      }
      if (quotePctTd.length) {
        const pct = quotePctTd.text().trim().replace(/%/g, "");
        priceChangePercent = parseFloat(pct) || 0;
      }
    }

    // 인사이더 매수/매도 데이터: table#ins_sum
    let insiderBuys = 0;
    let insiderBuyTotal = 0;

    const insSumRows = $("table#ins_sum tr");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    insSumRows.each((_: any, row: any) => {
      const $row = $(row);
      if ($row.hasClass("buys")) {
        const cells = $row.find("td");
        if (cells.length >= 2) {
          insiderBuys = parseInt($(cells[0]).text().trim().replace(/,/g, "")) || 0;
          insiderBuyTotal =
            parseFloat(
              $(cells[1]).text().trim().replace(/[$,]/g, "")
            ) || 0;
        }
      }
    });

    return { reportedPrice, currentPrice, priceChangePercent, insiderBuys, insiderBuyTotal };
  } catch {
    return null;
  }
}

// ─── Redis 저장/조회 ───

export async function loadStocks(): Promise<SuperinvestorData | null> {
  try {
    const data = await redis.get<SuperinvestorData>(SUPERINVESTOR_KEY);
    return data ?? null;
  } catch {
    return null;
  }
}

export async function saveStocks(stocks: SuperinvestorStock[]): Promise<void> {
  const data: SuperinvestorData = {
    stocks,
    lastUpdated: new Date().toISOString(),
  };
  await redis.set(SUPERINVESTOR_KEY, data, { ex: SUPERINVESTOR_TTL });
}

// ─── 전체 수집 파이프라인 ───

export async function collectAndScore(): Promise<SuperinvestorStock[]> {
  console.log("[superinvestor] 데이터 수집 시작");

  // 1. 전체 매매 활동 수집
  const activities = await fetchAllActivity();
  console.log(`[superinvestor] 매매 활동 ${activities.length}건 파싱 완료`);

  // Buy/Add만 필터
  const buyActivities = activities.filter(
    (a) => a.activityType === "Buy" || a.activityType === "Add"
  );
  console.log(`[superinvestor] Buy/Add 활동 ${buyActivities.length}건`);

  // 2. 고유 티커 목록 추출
  const tickers = [...new Set(buyActivities.map((a) => a.ticker))];
  console.log(`[superinvestor] 고유 종목 ${tickers.length}개`);

  // 3. 종목별 가격/인사이더 데이터 수집 (5개씩 배치)
  const priceData = new Map<
    string,
    { reportedPrice: number; currentPrice: number; priceChangePercent: number }
  >();
  const insiderMap = new Map<string, InsiderData>();

  for (let i = 0; i < tickers.length; i += 5) {
    const batch = tickers.slice(i, i + 5);
    const results = await Promise.all(batch.map((t) => fetchStockPrice(t)));

    for (let j = 0; j < batch.length; j++) {
      const ticker = batch[j];
      const result = results[j];
      if (!result) continue;

      priceData.set(ticker, {
        reportedPrice: result.reportedPrice,
        currentPrice: result.currentPrice,
        priceChangePercent: result.priceChangePercent,
      });

      if (result.insiderBuys > 0) {
        insiderMap.set(ticker, {
          ticker,
          buyCount: result.insiderBuys,
          buyTotal: result.insiderBuyTotal,
          sellCount: 0,
          sellTotal: 0,
        });
      }
    }

    // Rate limit 방지: 배치 간 1초 대기
    if (i + 5 < tickers.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log(
    `[superinvestor] 가격 데이터 ${priceData.size}개, 인사이더 ${insiderMap.size}개 수집 완료`
  );

  // 4. 집계 + 점수 계산
  const aggregated = aggregateActivities(activities, priceData);
  const scored = calculateScores(aggregated, insiderMap);

  // 5. 40점 이상만 필터 + 점수 내림차순
  const filtered = scored
    .filter((s) => s.score >= MIN_DISPLAY_SCORE)
    .sort((a, b) => b.score - a.score);

  console.log(
    `[superinvestor] ${MIN_DISPLAY_SCORE}점 이상 종목 ${filtered.length}개`
  );

  return filtered;
}
