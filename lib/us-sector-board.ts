import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import YahooFinance from "yahoo-finance2";

/**
 * 미국 섹터 보드(S&P500·GICS) 빌더 + cron 핸들러.
 * 위키 S&P500 명단·GICS + 야후 시세 조인 → GICS 11섹터별 시총 내림차순 → Redis(us-sector-board:data).
 *
 * ⚠️ 로직은 scripts/build-us-sector-board.mjs(로컬 수동 실행용)와 쌍둥이다.
 *    한쪽을 고치면 반드시 scripts/build-us-sector-board.mjs도 함께 반영할 것.
 */
export const US_SECTOR_BOARD_KEY = "us-sector-board:data";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

const GICS_KO: Record<string, string> = {
  "Information Technology": "정보기술",
  "Health Care": "헬스케어",
  Financials: "금융",
  "Consumer Discretionary": "경기소비재",
  "Communication Services": "커뮤니케이션서비스",
  Industrials: "산업재",
  "Consumer Staples": "필수소비재",
  Energy: "에너지",
  Utilities: "유틸리티",
  "Real Estate": "부동산",
  Materials: "소재",
};

interface SP500Row {
  ticker: string;
  yahoo: string;
  name: string;
  gicsSector: string;
}

// ── 위키 S&P500 파싱 ──
async function fetchSP500(): Promise<SP500Row[]> {
  const html = await (
    await fetch("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; tocktock/1.0)" },
      signal: AbortSignal.timeout(15000),
    })
  ).text();
  const s = html.indexOf('id="constituents"');
  const tbl = html.slice(s, html.indexOf("</table>", s));
  const rows = tbl.split("<tr>").slice(2);
  const out: SP500Row[] = [];
  for (const r of rows) {
    const cells = [...r.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) =>
      m[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\n/g, " ").trim()
    );
    if (cells.length >= 4 && /^[A-Z.]{1,6}$/.test(cells[0])) {
      out.push({ ticker: cells[0], yahoo: cells[0].replace(/\./g, "-"), name: cells[1], gicsSector: cells[2] });
    }
  }
  if (out.length < 450) throw new Error(`위키 파싱 행 부족(${out.length}) — 포맷 변경 의심`);
  return out;
}

// ── 야후 시세 배치(청크 75) ──
async function fetchQuotes(tickers: string[]) {
  const CHUNK = 75;
  const map = new Map<string, Awaited<ReturnType<typeof yf.quote>>>();
  for (let i = 0; i < tickers.length; i += CHUNK) {
    const chunk = tickers.slice(i, i + CHUNK);
    let arr: unknown[] | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const r = await yf.quote(chunk, {}, { validateResult: false });
        arr = Array.isArray(r) ? r : [r];
        break;
      } catch {
        if (attempt < 2) await new Promise((s) => setTimeout(s, 1500));
      }
    }
    for (const q of (arr || []) as { symbol?: string }[]) if (q?.symbol) map.set(q.symbol, q as never);
  }
  return map;
}

export async function buildUsSectorBoard() {
  const list = await fetchSP500();
  const qmap = await fetchQuotes(list.map((x) => x.yahoo));

  const bySector = new Map<string, unknown[]>();
  let joined = 0;
  for (const it of list) {
    const q = qmap.get(it.yahoo) as
      | { marketCap?: number; regularMarketPrice?: number; regularMarketChangePercent?: number; regularMarketVolume?: number }
      | undefined;
    if (!q || !Number.isFinite(q.marketCap) || !Number.isFinite(q.regularMarketVolume)) continue;
    joined++;
    const price = Number(q.regularMarketPrice) || 0;
    const volume = Number(q.regularMarketVolume) || 0;
    const entry = {
      ticker: it.ticker,
      name: it.name,
      marketCap: Number(q.marketCap),
      price,
      changeRate: Number(q.regularMarketChangePercent) || 0,
      tradingValue: Math.round(price * volume), // 근사(현재가×거래량)
      volume,
    };
    if (!bySector.has(it.gicsSector)) bySector.set(it.gicsSector, []);
    bySector.get(it.gicsSector)!.push(entry);
  }

  const 섹터 = [];
  for (const [sec, stocks] of bySector) {
    (stocks as { marketCap: number }[]).sort((a, b) => b.marketCap - a.marketCap);
    섹터.push({ name: sec, nameKo: GICS_KO[sec] || sec, count: stocks.length, stocks });
  }
  const cap = (s: { stocks: unknown[] }) => (s.stocks as { marketCap: number }[]).reduce((a, x) => a + x.marketCap, 0);
  섹터.sort((a, b) => cap(b) - cap(a));

  return {
    updatedAt: new Date().toISOString(),
    source: "wikipedia S&P500 + yahoo-finance2",
    units: { currency: "USD", marketCap: "USD", price: "USD", tradingValue: "USD", volume: "주", changeRate: "%" },
    totalQuotes: qmap.size,
    joined,
    섹터,
  };
}

// ── cron 핸들러 (GET 전용. 한국판 handleSectorBoardCron과 동일 골격) ──
export async function handleUsSectorBoardCron(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const blob = await buildUsSectorBoard();
    await redis.set(US_SECTOR_BOARD_KEY, blob); // Upstash 자동 직렬화 — JSON.stringify 금지
    return NextResponse.json({
      success: true,
      updatedAt: blob.updatedAt,
      totalQuotes: blob.totalQuotes,
      joined: blob.joined,
      sectors: blob.섹터.length,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
