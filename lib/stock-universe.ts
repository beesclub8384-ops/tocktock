/**
 * 투자자 동향 자동 추적 대상 종목 선정.
 *
 * 기준 (모두 만족):
 *   - 시가총액: 1,000억 ~ 1조원 (세력이 갖고 놀기 좋은 중소형주만)
 *   - 60일 평균 일거래대금: 10억원 이상
 *   - 30일 변동성 ((고가-저가)/저가): 5% 이상
 *   - 보통주만 (우선주·스팩·ETF·리츠·인프라 제외)
 *   - 거래정지 종목 제외
 *
 * 매주 일요일 새벽에 cron으로 갱신. 약 400~600개 예상.
 *
 * 주의:
 *   - 단위 일관: 모든 금액은 원(₩). Naver marketValueRaw는 원 단위 raw string.
 *   - Naver siseJson: ['날짜','시가','고가','저가','종가','거래량','외국인소진율']
 */

import { redis } from "@/lib/redis";

const NAVER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "ko-KR,ko;q=0.9",
};

const ETF_BRAND_RE =
  /^(KODEX|TIGER|KBSTAR|ACE|ARIRANG|HANARO|SOL|KOSEF|KINDEX|TIMEFOLIO|PLUS|FOCUS|WOORI|BNK|RISE|KIWOOM|KoAct|WON|HK|1Q|TIME|DAISHIN\d+|UNICORN|TRUSTON|VITA|에셋플러스|마이다스|더제이|파워|마이티|히어로)\s/;

export function isRegularStock(name: string): boolean {
  if (/ETF|ETN/i.test(name)) return false;
  if (ETF_BRAND_RE.test(name)) return false;
  if (name.includes("리츠") || /REIT/i.test(name)) return false;
  if (/스팩/.test(name)) return false;
  if (/채권|선물|인버스|레버리지/.test(name)) return false;
  if (/^(맥쿼리|KB발해)인프라/.test(name)) return false;
  if (/우[A-C]?$/.test(name)) return false;
  return true;
}

export interface RawListedStock {
  code: string;
  name: string;
  market: "KOSPI" | "KOSDAQ";
  /** 시가총액 (원) */
  marketCapKRW: number;
  /** 당일 누적 거래대금 (원) */
  todayTradingValueKRW: number;
  /** 거래정지 여부 */
  tradeStopped: boolean;
}

interface NaverMarketStock {
  itemCode: string;
  stockName: string;
  closePriceRaw?: string;
  marketValueRaw?: string;
  accumulatedTradingValueRaw?: string;
  tradeStopType?: { name?: string };
}

async function fetchMarket(market: "KOSPI" | "KOSDAQ"): Promise<RawListedStock[]> {
  const PAGE_SIZE = 100;
  const result: RawListedStock[] = [];

  const firstUrl = `https://m.stock.naver.com/api/stocks/marketValue/${market}?page=1&pageSize=${PAGE_SIZE}`;
  const firstRes = await fetch(firstUrl, {
    headers: NAVER_HEADERS,
    signal: AbortSignal.timeout(10_000),
  });
  if (!firstRes.ok) return [];
  const firstJson = (await firstRes.json()) as {
    totalCount: number;
    stocks: NaverMarketStock[];
  };
  const totalPages = Math.ceil((firstJson.totalCount ?? 0) / PAGE_SIZE);

  const collect = (stocks: NaverMarketStock[]) => {
    for (const s of stocks) {
      if (!s.itemCode || !s.stockName) continue;
      if (!isRegularStock(s.stockName)) continue;
      const cap = Number(s.marketValueRaw ?? "0");
      const val = Number(s.accumulatedTradingValueRaw ?? "0");
      if (!Number.isFinite(cap) || cap <= 0) continue;
      result.push({
        code: s.itemCode,
        name: s.stockName,
        market,
        marketCapKRW: cap,
        todayTradingValueKRW: Number.isFinite(val) ? val : 0,
        tradeStopped: s.tradeStopType?.name === "STOP",
      });
    }
  };

  collect(firstJson.stocks ?? []);

  // 5페이지씩 병렬로 (네이버 모바일 API는 충분히 견딤)
  for (let page = 2; page <= totalPages; page += 5) {
    const batch: Promise<NaverMarketStock[]>[] = [];
    for (let p = page; p < page + 5 && p <= totalPages; p++) {
      const url = `https://m.stock.naver.com/api/stocks/marketValue/${market}?page=${p}&pageSize=${PAGE_SIZE}`;
      batch.push(
        fetch(url, { headers: NAVER_HEADERS, signal: AbortSignal.timeout(10_000) })
          .then((r) => (r.ok ? r.json() : { stocks: [] }))
          .then((j) => (j as { stocks?: NaverMarketStock[] }).stocks ?? [])
          .catch(() => [] as NaverMarketStock[])
      );
    }
    for (const stocks of await Promise.all(batch)) collect(stocks);
  }

  return result;
}

/** 1단계: 코스피 + 코스닥 전 종목 시세 수집 */
export async function fetchAllListedStocks(): Promise<RawListedStock[]> {
  const [k, q] = await Promise.all([fetchMarket("KOSPI"), fetchMarket("KOSDAQ")]);
  return [...k, ...q];
}

interface DailyOhlc {
  date: string;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Naver siseJson — 60일치 OHLCV. 응답이 단순 문자열 형태라 직접 파싱. */
async function fetchDailyOhlc(code: string, days: number): Promise<DailyOhlc[]> {
  const today = new Date();
  const kst = new Date(today.getTime() + 9 * 3600 * 1000);
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(
      d.getUTCDate()
    ).padStart(2, "0")}`;
  const endDate = fmt(kst);
  const startKst = new Date(kst.getTime() - days * 86400 * 1000);
  const startDate = fmt(startKst);

  const url = `https://api.finance.naver.com/siseJson.naver?symbol=${code}&requestType=1&startTime=${startDate}&endTime=${endDate}&timeframe=day`;
  try {
    const res = await fetch(url, {
      headers: NAVER_HEADERS,
      signal: AbortSignal.timeout(7_000),
    });
    if (!res.ok) return [];
    const text = await res.text();
    // 단일 따옴표/주석 등 비표준 JSON 형태 → JSON 호환으로 변환
    const cleaned = text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/'/g, '"')
      .trim();
    const parsed = JSON.parse(cleaned) as unknown[];
    if (!Array.isArray(parsed) || parsed.length < 2) return [];
    const rows: DailyOhlc[] = [];
    for (let i = 1; i < parsed.length; i++) {
      const row = parsed[i] as unknown[];
      if (!Array.isArray(row) || row.length < 6) continue;
      const dateStr = String(row[0]).trim();
      const high = Number(row[2]);
      const low = Number(row[3]);
      const close = Number(row[4]);
      const volume = Number(row[5]);
      if (!/^\d{8}$/.test(dateStr) || !Number.isFinite(close) || close <= 0) continue;
      rows.push({ date: dateStr, high, low, close, volume });
    }
    return rows;
  } catch {
    return [];
  }
}

interface HistStats {
  /** 60일 평균 일거래대금 (원). 데이터 부족하면 null */
  avgTradingValue60d: number | null;
  /** 30일 변동성 = (max(고가) - min(저가)) / min(저가). 데이터 부족하면 null */
  volatility30d: number | null;
  /** 실제 캔들 수 */
  candleCount: number;
}

function computeStats(rows: DailyOhlc[]): HistStats {
  if (rows.length === 0) {
    return { avgTradingValue60d: null, volatility30d: null, candleCount: 0 };
  }
  // 60일 평균 거래대금: close × volume
  const last60 = rows.slice(-60);
  const sumValue = last60.reduce((s, r) => s + r.close * r.volume, 0);
  const avg = last60.length > 0 ? sumValue / last60.length : null;

  // 30일 변동성: 최근 30거래일의 (max(high) - min(low)) / min(low)
  const last30 = rows.slice(-30);
  let vol: number | null = null;
  if (last30.length >= 5) {
    const maxH = Math.max(...last30.map((r) => r.high));
    const minL = Math.min(...last30.map((r) => r.low));
    if (minL > 0) vol = (maxH - minL) / minL;
  }
  return { avgTradingValue60d: avg, volatility30d: vol, candleCount: rows.length };
}

const MARKET_CAP_MIN = 1000 * 1e8; // 1,000억원 — 세력이 갖고 놀기 좋은 중소형주 하한
const MARKET_CAP_MAX = 1 * 1e12; //  1조원 — 대형주는 제외
const AVG_VALUE_MIN = 10 * 1e8; //   10억원
const VOL_MIN = 0.05; //              5%
const TODAY_VALUE_PROXY_MIN = 1e8; // 1억원 — 사실상 거래 거의 없는 종목 사전 컷

export interface UniverseSelectionResult {
  /** 최종 선정 종목 코드 */
  symbols: string[];
  /** 디버깅용: 단계별 갯수 */
  stages: {
    totalListed: number;
    afterRegularFilter: number;
    afterMarketCap: number;
    afterTodayValueCut: number;
    afterHistStats: number;
  };
  /** 처음 10개 샘플 */
  sample: { code: string; name: string; marketCap: number; market: string }[];
}

/**
 * 추적 대상 종목 약 400~600개 선정.
 * 1) Naver marketValue API로 코스피+코스닥 전 종목 (시총 정렬)
 * 2) 시총 500억~5조 + 거래정지 X + 보통주만 1차 필터
 * 3) 당일 거래대금 1억 미만은 사전 컷 (60일 평균 10억 충족 가능성 거의 없음)
 * 4) siseJson 60일 OHLCV로 평균 거래대금/변동성 계산 → 최종 필터
 *
 * 약 1500 → 600~ 개로 축소 예상. 시간: ~60-90초 (병렬 5개 배치)
 */
export async function selectTrackedStocks(): Promise<UniverseSelectionResult> {
  const all = await fetchAllListedStocks();

  const after1 = all.filter((s) => !s.tradeStopped); // 보통주 필터는 fetchMarket 안에서 이미 처리
  const after2 = after1.filter(
    (s) => s.marketCapKRW >= MARKET_CAP_MIN && s.marketCapKRW <= MARKET_CAP_MAX
  );
  const after3 = after2.filter(
    (s) => s.todayTradingValueKRW >= TODAY_VALUE_PROXY_MIN
  );

  // 4단계: 60일 통계 — 병렬 배치 5개씩
  const final: { stock: RawListedStock; stats: HistStats }[] = [];
  const batchSize = 5;
  for (let i = 0; i < after3.length; i += batchSize) {
    const batch = after3.slice(i, i + batchSize);
    const stats = await Promise.all(
      batch.map((s) => fetchDailyOhlc(s.code, 90).then(computeStats))
    );
    for (let j = 0; j < batch.length; j++) {
      const st = stats[j];
      if (
        st.avgTradingValue60d != null &&
        st.avgTradingValue60d >= AVG_VALUE_MIN &&
        st.volatility30d != null &&
        st.volatility30d >= VOL_MIN
      ) {
        final.push({ stock: batch[j], stats: st });
      }
    }
  }

  const symbols = final.map((f) => f.stock.code);
  const sample = final.slice(0, 10).map((f) => ({
    code: f.stock.code,
    name: f.stock.name,
    marketCap: f.stock.marketCapKRW,
    market: f.stock.market,
  }));

  return {
    symbols,
    stages: {
      totalListed: all.length,
      afterRegularFilter: after1.length,
      afterMarketCap: after2.length,
      afterTodayValueCut: after3.length,
      afterHistStats: final.length,
    },
    sample,
  };
}

/* ──────────────────────────────────────────────────────────
 *  Redis 저장/로드
 * ────────────────────────────────────────────────────────── */

const UNIVERSE_KEY = "investor-flow:universe";
const UNIVERSE_TTL_SEC = 8 * 24 * 60 * 60; // 8일 — 주 1회 갱신 보장

interface UniverseBlob {
  symbols: string[];
  computedAt: string;
  stages?: UniverseSelectionResult["stages"];
}

export async function saveStockUniverse(
  result: UniverseSelectionResult
): Promise<void> {
  const blob: UniverseBlob = {
    symbols: result.symbols,
    computedAt: new Date().toISOString(),
    stages: result.stages,
  };
  await redis.set(UNIVERSE_KEY, blob, { ex: UNIVERSE_TTL_SEC });
}

/**
 * Redis에서 universe 로드. 없으면 자동 계산 + 저장.
 * 자동 계산은 60-90초 걸릴 수 있으므로 cron이 아닌 곳에서 부르면 주의.
 */
export async function loadStockUniverse(): Promise<{
  symbols: string[];
  computedAt: string | null;
  recomputed: boolean;
}> {
  try {
    const blob = await redis.get<UniverseBlob>(UNIVERSE_KEY);
    if (blob && blob.symbols.length > 0) {
      return { symbols: blob.symbols, computedAt: blob.computedAt, recomputed: false };
    }
  } catch {
    /* fall through */
  }
  const fresh = await selectTrackedStocks();
  await saveStockUniverse(fresh);
  return {
    symbols: fresh.symbols,
    computedAt: new Date().toISOString(),
    recomputed: true,
  };
}

/** 저장된 universe만 (없으면 빈 배열). selectTrackedStocks 호출하지 않음. */
export async function peekStockUniverse(): Promise<{
  symbols: string[];
  computedAt: string | null;
}> {
  try {
    const blob = await redis.get<UniverseBlob>(UNIVERSE_KEY);
    if (blob) return { symbols: blob.symbols, computedAt: blob.computedAt };
  } catch {
    /* ignore */
  }
  return { symbols: [], computedAt: null };
}
