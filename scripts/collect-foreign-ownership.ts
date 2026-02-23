import { Redis } from "@upstash/redis";

interface StockInfo {
  name: string;
  code: string;
  ticker: string;
}

interface ForeignOwnershipEntry {
  date: string;
  quantity: number;
  ratio: number;
}

const KOSPI_TOP20: StockInfo[] = [
  { name: "삼성전자", code: "KR7005930003", ticker: "005930" },
  { name: "SK하이닉스", code: "KR7000660001", ticker: "000660" },
  { name: "LG에너지솔루션", code: "KR7373220003", ticker: "373220" },
  { name: "삼성바이오로직스", code: "KR7207940008", ticker: "207940" },
  { name: "현대차", code: "KR7005380001", ticker: "005380" },
  { name: "기아", code: "KR7000270009", ticker: "000270" },
  { name: "셀트리온", code: "KR7068270008", ticker: "068270" },
  { name: "POSCO홀딩스", code: "KR7005490008", ticker: "005490" },
  { name: "KB금융", code: "KR7105560007", ticker: "105560" },
  { name: "신한지주", code: "KR7055550008", ticker: "055550" },
  { name: "삼성SDI", code: "KR7006400006", ticker: "006400" },
  { name: "LG화학", code: "KR7051910008", ticker: "051910" },
  { name: "하나금융지주", code: "KR7086790003", ticker: "086790" },
  { name: "현대모비스", code: "KR7012330007", ticker: "012330" },
  { name: "카카오", code: "KR7035720002", ticker: "035720" },
  { name: "NAVER", code: "KR7035420009", ticker: "035420" },
  { name: "우리금융지주", code: "KR7316140003", ticker: "316140" },
  { name: "LG전자", code: "KR7066570003", ticker: "066570" },
  { name: "SK이노베이션", code: "KR7096770003", ticker: "096770" },
  { name: "KT&G", code: "KR7033780008", ticker: "033780" },
];

const KOSDAQ_TOP20: StockInfo[] = [
  { name: "HLB", code: "KR7028300003", ticker: "028300" },
  { name: "에코프로비엠", code: "KR7247540009", ticker: "247540" },
  { name: "에코프로", code: "KR7086520004", ticker: "086520" },
  { name: "알테오젠", code: "KR7196170003", ticker: "196170" },
  { name: "리가켐바이오", code: "KR7141080008", ticker: "141080" },
  { name: "셀트리온제약", code: "KR7068760008", ticker: "068760" },
  { name: "클래시스", code: "KR7214150002", ticker: "214150" },
  { name: "레인보우로보틱스", code: "KR7277810004", ticker: "277810" },
  { name: "삼천당제약", code: "KR7000250001", ticker: "000250" },
  { name: "엔켐", code: "KR7348370009", ticker: "348370" },
  { name: "파마리서치", code: "KR7214450006", ticker: "214450" },
  { name: "휴젤", code: "KR7145020007", ticker: "145020" },
  { name: "카카오게임즈", code: "KR7293490009", ticker: "293490" },
  { name: "솔브레인", code: "KR7357780009", ticker: "357780" },
  { name: "HPSP", code: "KR7403870001", ticker: "403870" },
  { name: "펩트론", code: "KR7087010004", ticker: "087010" },
  { name: "보로노이", code: "KR7310210007", ticker: "310210" },
  { name: "오스템임플란트", code: "KR7048260005", ticker: "048260" },
  { name: "덴티움", code: "KR7145720002", ticker: "145720" },
  { name: "실리콘투", code: "KR7257720008", ticker: "257720" },
];

const ALL_STOCKS = [...KOSPI_TOP20, ...KOSDAQ_TOP20];

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchFromNaver(
  ticker: string,
  startDate: string,
  endDate: string
): Promise<ForeignOwnershipEntry[]> {
  const url = `https://api.finance.naver.com/siseJson.naver?symbol=${ticker}&requestType=1&startTime=${startDate}&endTime=${endDate}&timeframe=day`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  if (!res.ok) {
    console.error(`NAVER request failed for ${ticker}: ${res.status}`);
    return [];
  }

  const text = await res.text();

  // NAVER returns JS-style array: [['header',...], ['20260220', ...], ...]
  // Parse it safely
  let parsed: unknown[][];
  try {
    // Replace single quotes with double quotes for JSON parsing
    const jsonText = text.trim().replace(/'/g, '"');
    parsed = JSON.parse(jsonText);
  } catch {
    console.error(`Failed to parse NAVER response for ${ticker}`);
    return [];
  }

  if (!Array.isArray(parsed) || parsed.length < 2) return [];

  // First row is header: ['날짜', '시가', '고가', '저가', '종가', '거래량', '외국인소진율']
  const entries: ForeignOwnershipEntry[] = [];
  for (let i = 1; i < parsed.length; i++) {
    const row = parsed[i];
    if (!Array.isArray(row) || row.length < 7) continue;

    const rawDate = String(row[0]).trim();
    const ratio = Number(row[6]);

    if (rawDate && !isNaN(ratio)) {
      // rawDate is "20260220" → "2026-02-20"
      const date = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
      entries.push({
        date,
        quantity: 0, // NAVER doesn't provide quantity in this API
        ratio,
      });
    }
  }

  // Sort by date ascending
  entries.sort((a, b) => a.date.localeCompare(b.date));
  return entries;
}

async function main() {
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const startDate = formatDate(sixMonthsAgo);
  const endDate = formatDate(now);

  console.log(`Collecting foreign ownership data: ${startDate} ~ ${endDate}`);
  console.log(`Source: NAVER Finance API`);
  console.log(`Total stocks: ${ALL_STOCKS.length}`);

  let success = 0;
  let fail = 0;

  for (const stock of ALL_STOCKS) {
    try {
      console.log(`Fetching: ${stock.name} (${stock.ticker})...`);
      const entries = await fetchFromNaver(stock.ticker, startDate, endDate);

      if (entries.length > 0) {
        const key = `foreign:${stock.ticker}`;
        await redis.set(key, entries, { ex: 86400 }); // TTL 24h
        console.log(`  → ${entries.length} entries saved`);
        success++;
      } else {
        console.log(`  → No data returned`);
        fail++;
      }
    } catch (err) {
      console.error(`  → Error: ${err}`);
      fail++;
    }

    // 0.3초 딜레이
    await sleep(300);
  }

  console.log(`\nDone! Success: ${success}, Failed: ${fail}`);
}

main().catch(console.error);
