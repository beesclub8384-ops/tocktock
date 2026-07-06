import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import YahooFinance from "yahoo-finance2";
import gicsMap from "@/data/us-gics-mapping.json";
import namesKo from "@/data/us-stock-names-ko.json";

/**
 * 미국 섹터 보드(S&P500·GICS) 빌더 + cron 핸들러.
 * 위키 S&P500 명단·GICS + 야후 시세 조인 → GICS 11섹터별 시총 내림차순 → Redis(us-sector-board:data).
 *
 * ⚠️ 로직은 scripts/build-us-sector-board.mjs(로컬 수동 실행용)와 쌍둥이다.
 *    한쪽을 고치면 반드시 scripts/build-us-sector-board.mjs도 함께 반영할 것.
 */
export const US_SECTOR_BOARD_KEY = "us-sector-board:data";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

// GICS 세부산업 → 산업그룹(25) 매핑 (data/us-gics-mapping.json)
const SUB2GROUP = (gicsMap as { subIndustryToGroup: Record<string, string> }).subIndustryToGroup;
const GROUP_KO = (gicsMap as { groups: Record<string, string> }).groups;
const NAMES_KO = namesKo as Record<string, string>; // 미국 종목 한글명(없으면 영문 폴백)

interface SP500Row {
  ticker: string;
  yahoo: string;
  name: string;
  gicsSector: string;
  subIndustry: string;
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
  const rows = tbl.split(/<tr[^>]*>/).slice(2); // 위키가 <tr>→<tr 속성...>로 바뀌어도 대응
  const out: SP500Row[] = [];
  for (const r of rows) {
    const cells = [...r.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) =>
      m[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\n/g, " ").trim()
    );
    if (cells.length >= 4 && /^[A-Z.]{1,6}$/.test(cells[0])) {
      out.push({ ticker: cells[0], yahoo: cells[0].replace(/\./g, "-"), name: cells[1], gicsSector: cells[2], subIndustry: cells[3] });
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

// ── 섹터 평균 등락 (시총가중 + 단순평균). build-us-sector-board.mjs와 동일 로직 ──
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

export async function buildUsSectorBoard() {
  const list = await fetchSP500();
  const qmap = await fetchQuotes(list.map((x) => x.yahoo));

  const byGroup = new Map<string, unknown[]>();
  let joined = 0;
  for (const it of list) {
    const q = qmap.get(it.yahoo) as
      | { marketCap?: number; regularMarketPrice?: number; regularMarketChangePercent?: number; regularMarketVolume?: number }
      | undefined;
    if (!q || !Number.isFinite(q.marketCap) || !Number.isFinite(q.regularMarketVolume)) continue;
    const group = SUB2GROUP[it.subIndustry] || "기타"; // 매핑 검증상 0(기타 없음)
    joined++;
    const price = Number(q.regularMarketPrice) || 0;
    const volume = Number(q.regularMarketVolume) || 0;
    const entry = {
      ticker: it.ticker,
      name: it.name,
      nameKo: NAMES_KO[it.ticker] || it.name, // 한글명(없으면 영문 폴백)
      marketCap: Number(q.marketCap),
      price,
      changeRate: Number(q.regularMarketChangePercent) || 0,
      tradingValue: Math.round(price * volume), // 근사(현재가×거래량)
      volume,
    };
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group)!.push(entry);
  }

  const 산업그룹 = [];
  for (const [g, stocks] of byGroup) {
    (stocks as { marketCap: number }[]).sort((a, b) => b.marketCap - a.marketCap);
    const { avgWeighted, avgSimple, avgCount } = sectorAverages(stocks as { changeRate: number; marketCap: number }[]);
    산업그룹.push({ name: g, nameKo: GROUP_KO[g] || g, count: stocks.length, avgWeighted, avgSimple, avgCount, stocks });
  }
  const cap = (s: { stocks: unknown[] }) => (s.stocks as { marketCap: number }[]).reduce((a, x) => a + x.marketCap, 0);
  산업그룹.sort((a, b) => cap(b) - cap(a));

  return {
    updatedAt: new Date().toISOString(),
    source: "wikipedia S&P500 + yahoo-finance2 · GICS 산업그룹(25)",
    units: { currency: "USD", marketCap: "USD", price: "USD", tradingValue: "USD", volume: "주", changeRate: "%" },
    totalQuotes: qmap.size,
    joined,
    산업그룹,
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
      groups: blob.산업그룹.length,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
