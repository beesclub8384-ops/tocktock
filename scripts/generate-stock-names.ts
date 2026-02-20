/**
 * 종목 데이터 수집 스크립트
 * KRX(한국거래소) + 미국 주요 종목 → data/stock-names.json
 *
 * Usage: npx tsx scripts/generate-stock-names.ts
 */

import * as fs from "fs";
import * as path from "path";

interface StockEntry {
  symbol: string;
  code: string;
  name: string;
  nameEn?: string;
  market: string;
}

// ─── 한국 주식: kind.krx.co.kr HTML 파싱 ────────────────────
async function fetchKRXMarket(
  marketType: "stockMkt" | "kosdaqMkt"
): Promise<StockEntry[]> {
  const url = `https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13&marketType=${marketType}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  if (!res.ok) {
    console.error(`KRX ${marketType} fetch failed: ${res.status}`);
    return [];
  }

  const decoder = new TextDecoder("euc-kr");
  const buf = await res.arrayBuffer();
  const html = decoder.decode(buf);

  const suffix = marketType === "stockMkt" ? ".KS" : ".KQ";
  const marketName = marketType === "stockMkt" ? "KOSPI" : "KOSDAQ";

  const entries: StockEntry[] = [];
  const rowRegex = /<tr>([\s\S]*?)<\/tr>/g;
  let match;
  let isHeader = true;

  while ((match = rowRegex.exec(html)) !== null) {
    if (isHeader) {
      isHeader = false;
      continue;
    }
    const cells: string[] = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(match[1])) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]+>/g, "").trim());
    }
    // Cell 0: 회사명, Cell 2: 종목코드
    if (cells.length >= 3) {
      const name = cells[0].trim();
      const rawCode = cells[2].trim();
      // 6자리 숫자 코드만 포함 (비정규 코드 제외)
      if (name && /^\d{6}$/.test(rawCode)) {
        entries.push({
          symbol: `${rawCode}${suffix}`,
          code: rawCode,
          name,
          market: marketName,
        });
      }
    }
  }

  return entries;
}

async function fetchKoreanStocks(): Promise<StockEntry[]> {
  console.log("Fetching KOSPI stocks from KRX...");
  const kospi = await fetchKRXMarket("stockMkt");
  console.log(`  KOSPI: ${kospi.length} stocks`);

  console.log("Fetching KOSDAQ stocks from KRX...");
  const kosdaq = await fetchKRXMarket("kosdaqMkt");
  console.log(`  KOSDAQ: ${kosdaq.length} stocks`);

  return [...kospi, ...kosdaq];
}

// ─── 미국 주식: Wikipedia S&P 500 + 주요 종목 하드코딩 ──────
async function fetchSP500(): Promise<StockEntry[]> {
  console.log("Fetching S&P 500 from Wikipedia...");
  try {
    const res = await fetch(
      "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
    );
    const html = await res.text();

    // 첫 번째 테이블에서 종목 파싱
    const tableMatch = html.match(/<table[^>]*id="constituents"[^>]*>([\s\S]*?)<\/table>/);
    if (!tableMatch) {
      console.warn("  S&P 500 table not found, using fallback");
      return [];
    }

    const entries: StockEntry[] = [];
    const rowRegex = /<tr>([\s\S]*?)<\/tr>/g;
    let match;
    let isHeader = true;

    while ((match = rowRegex.exec(tableMatch[1])) !== null) {
      if (isHeader) {
        isHeader = false;
        continue;
      }
      const cells: string[] = [];
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(match[1])) !== null) {
        cells.push(cellMatch[1].replace(/<[^>]+>/g, "").trim());
      }
      if (cells.length >= 2) {
        const symbol = cells[0].replace(/\n/g, "").trim();
        const nameEn = cells[1].replace(/\n/g, "").trim();
        if (symbol && nameEn) {
          entries.push({
            symbol,
            code: "",
            name: "",
            nameEn,
            market: "NYSE/NASDAQ",
          });
        }
      }
    }

    console.log(`  S&P 500: ${entries.length} stocks`);
    return entries;
  } catch (e) {
    console.error("  Failed to fetch S&P 500:", e);
    return [];
  }
}

// 주요 미국 종목 (한글명 포함) - S&P 500에 없거나, 한글명이 필요한 종목
const US_MAJOR_STOCKS: StockEntry[] = [
  // FAANG + Big Tech
  { symbol: "AAPL", code: "", name: "애플", nameEn: "Apple Inc.", market: "NASDAQ" },
  { symbol: "MSFT", code: "", name: "마이크로소프트", nameEn: "Microsoft Corporation", market: "NASDAQ" },
  { symbol: "GOOGL", code: "", name: "구글", nameEn: "Alphabet Inc.", market: "NASDAQ" },
  { symbol: "GOOG", code: "", name: "구글 C", nameEn: "Alphabet Inc. Class C", market: "NASDAQ" },
  { symbol: "AMZN", code: "", name: "아마존", nameEn: "Amazon.com Inc.", market: "NASDAQ" },
  { symbol: "META", code: "", name: "메타", nameEn: "Meta Platforms Inc.", market: "NASDAQ" },
  { symbol: "NVDA", code: "", name: "엔비디아", nameEn: "NVIDIA Corporation", market: "NASDAQ" },
  { symbol: "TSLA", code: "", name: "테슬라", nameEn: "Tesla Inc.", market: "NASDAQ" },
  { symbol: "NFLX", code: "", name: "넷플릭스", nameEn: "Netflix Inc.", market: "NASDAQ" },

  // Semiconductors
  { symbol: "AMD", code: "", name: "AMD", nameEn: "Advanced Micro Devices", market: "NASDAQ" },
  { symbol: "INTC", code: "", name: "인텔", nameEn: "Intel Corporation", market: "NASDAQ" },
  { symbol: "TSM", code: "", name: "TSMC", nameEn: "Taiwan Semiconductor", market: "NYSE" },
  { symbol: "AVGO", code: "", name: "브로드컴", nameEn: "Broadcom Inc.", market: "NASDAQ" },
  { symbol: "QCOM", code: "", name: "퀄컴", nameEn: "Qualcomm Inc.", market: "NASDAQ" },
  { symbol: "MU", code: "", name: "마이크론", nameEn: "Micron Technology", market: "NASDAQ" },
  { symbol: "ARM", code: "", name: "ARM", nameEn: "Arm Holdings", market: "NASDAQ" },

  // Software & Cloud
  { symbol: "ORCL", code: "", name: "오라클", nameEn: "Oracle Corporation", market: "NYSE" },
  { symbol: "CRM", code: "", name: "세일즈포스", nameEn: "Salesforce Inc.", market: "NYSE" },
  { symbol: "ADBE", code: "", name: "어도비", nameEn: "Adobe Inc.", market: "NASDAQ" },
  { symbol: "NOW", code: "", name: "서비스나우", nameEn: "ServiceNow Inc.", market: "NYSE" },
  { symbol: "SNOW", code: "", name: "스노우플레이크", nameEn: "Snowflake Inc.", market: "NYSE" },
  { symbol: "PLTR", code: "", name: "팔란티어", nameEn: "Palantir Technologies", market: "NYSE" },

  // Finance
  { symbol: "BRK-B", code: "", name: "버크셔해서웨이", nameEn: "Berkshire Hathaway", market: "NYSE" },
  { symbol: "JPM", code: "", name: "JP모건", nameEn: "JPMorgan Chase & Co.", market: "NYSE" },
  { symbol: "V", code: "", name: "비자", nameEn: "Visa Inc.", market: "NYSE" },
  { symbol: "MA", code: "", name: "마스터카드", nameEn: "Mastercard Inc.", market: "NYSE" },
  { symbol: "GS", code: "", name: "골드만삭스", nameEn: "Goldman Sachs", market: "NYSE" },

  // Healthcare
  { symbol: "JNJ", code: "", name: "존슨앤존슨", nameEn: "Johnson & Johnson", market: "NYSE" },
  { symbol: "UNH", code: "", name: "유나이티드헬스", nameEn: "UnitedHealth Group", market: "NYSE" },
  { symbol: "PFE", code: "", name: "화이자", nameEn: "Pfizer Inc.", market: "NYSE" },
  { symbol: "LLY", code: "", name: "일라이릴리", nameEn: "Eli Lilly and Company", market: "NYSE" },
  { symbol: "NVO", code: "", name: "노보노디스크", nameEn: "Novo Nordisk", market: "NYSE" },

  // Consumer
  { symbol: "KO", code: "", name: "코카콜라", nameEn: "Coca-Cola Company", market: "NYSE" },
  { symbol: "PEP", code: "", name: "펩시", nameEn: "PepsiCo Inc.", market: "NASDAQ" },
  { symbol: "MCD", code: "", name: "맥도날드", nameEn: "McDonald's Corporation", market: "NYSE" },
  { symbol: "SBUX", code: "", name: "스타벅스", nameEn: "Starbucks Corporation", market: "NASDAQ" },
  { symbol: "NKE", code: "", name: "나이키", nameEn: "Nike Inc.", market: "NYSE" },
  { symbol: "DIS", code: "", name: "디즈니", nameEn: "Walt Disney Company", market: "NYSE" },
  { symbol: "WMT", code: "", name: "월마트", nameEn: "Walmart Inc.", market: "NYSE" },
  { symbol: "COST", code: "", name: "코스트코", nameEn: "Costco Wholesale", market: "NASDAQ" },

  // Industrial & Energy
  { symbol: "BA", code: "", name: "보잉", nameEn: "Boeing Company", market: "NYSE" },
  { symbol: "XOM", code: "", name: "엑슨모빌", nameEn: "Exxon Mobil Corporation", market: "NYSE" },
  { symbol: "CVX", code: "", name: "셰브론", nameEn: "Chevron Corporation", market: "NYSE" },
  { symbol: "CAT", code: "", name: "캐터필러", nameEn: "Caterpillar Inc.", market: "NYSE" },

  // EV & Auto
  { symbol: "RIVN", code: "", name: "리비안", nameEn: "Rivian Automotive", market: "NASDAQ" },
  { symbol: "LCID", code: "", name: "루시드", nameEn: "Lucid Group", market: "NASDAQ" },
  { symbol: "TM", code: "", name: "도요타", nameEn: "Toyota Motor Corporation", market: "NYSE" },

  // AI & Others
  { symbol: "AI", code: "", name: "C3.ai", nameEn: "C3.ai Inc.", market: "NYSE" },
  { symbol: "COIN", code: "", name: "코인베이스", nameEn: "Coinbase Global", market: "NASDAQ" },
  { symbol: "SQ", code: "", name: "블록", nameEn: "Block Inc.", market: "NYSE" },
  { symbol: "UBER", code: "", name: "우버", nameEn: "Uber Technologies", market: "NYSE" },
  { symbol: "ABNB", code: "", name: "에어비앤비", nameEn: "Airbnb Inc.", market: "NASDAQ" },
  { symbol: "SHOP", code: "", name: "쇼피파이", nameEn: "Shopify Inc.", market: "NYSE" },
  { symbol: "SPOT", code: "", name: "스포티파이", nameEn: "Spotify Technology", market: "NYSE" },
  { symbol: "RBLX", code: "", name: "로블록스", nameEn: "Roblox Corporation", market: "NYSE" },
  { symbol: "U", code: "", name: "유니티", nameEn: "Unity Software", market: "NYSE" },
  { symbol: "CRWD", code: "", name: "크라우드스트라이크", nameEn: "CrowdStrike Holdings", market: "NASDAQ" },
  { symbol: "PANW", code: "", name: "팔로알토네트웍스", nameEn: "Palo Alto Networks", market: "NASDAQ" },
  { symbol: "ZS", code: "", name: "지스케일러", nameEn: "Zscaler Inc.", market: "NASDAQ" },

  // ETFs (주요)
  { symbol: "SPY", code: "", name: "S&P500 ETF", nameEn: "SPDR S&P 500 ETF", market: "NYSE" },
  { symbol: "QQQ", code: "", name: "나스닥100 ETF", nameEn: "Invesco QQQ Trust", market: "NASDAQ" },
  { symbol: "VOO", code: "", name: "뱅가드 S&P500", nameEn: "Vanguard S&P 500 ETF", market: "NYSE" },
  { symbol: "SOXX", code: "", name: "반도체 ETF", nameEn: "iShares Semiconductor ETF", market: "NASDAQ" },
  { symbol: "ARKK", code: "", name: "ARK 혁신 ETF", nameEn: "ARK Innovation ETF", market: "NYSE" },
];

async function fetchUSStocks(): Promise<StockEntry[]> {
  const sp500 = await fetchSP500();
  const majorMap = new Map(US_MAJOR_STOCKS.map((s) => [s.symbol, s]));

  // S&P 500에 한글명 병합
  const merged: StockEntry[] = sp500.map((s) => {
    const major = majorMap.get(s.symbol);
    if (major) {
      majorMap.delete(s.symbol);
      return { ...s, name: major.name, market: major.market || s.market };
    }
    return s;
  });

  // S&P 500에 없는 주요 종목 추가
  for (const s of majorMap.values()) {
    merged.push(s);
  }

  console.log(`  Total US stocks: ${merged.length}`);
  return merged;
}

// ─── 메인 ─────────────────────────────────────────────────
async function main() {
  console.log("=== Stock Names Generator ===\n");

  const korean = await fetchKoreanStocks();
  const us = await fetchUSStocks();

  const all = [...korean, ...us];
  console.log(`\nTotal: ${all.length} stocks`);

  const outPath = path.join(__dirname, "..", "data", "stock-names.json");
  fs.writeFileSync(outPath, JSON.stringify(all, null, 2), "utf-8");
  console.log(`Written to ${outPath}`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
