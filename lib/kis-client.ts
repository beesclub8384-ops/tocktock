import zlib from "zlib";
import { redis } from "./redis.ts";

export interface MinuteCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const KIS_BASE = "https://openapi.koreainvestment.com:9443";
const TOKEN_KEY = "futures-trading:kis-token";
const FUTURES_CODE_KEY = "futures-trading:kis-futures-code";
const MASTER_URL = "https://new.real.download.dws.co.kr/common/master/fo_idx_code_mts.mst.zip";
const TOKEN_RENEW_WINDOW_MS = 10 * 60 * 1000;

interface TokenCache {
  access_token: string;
  expires_at: number;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not set`);
  return v;
}

// 단일 파일 ZIP(Deflate)을 순수 Node로 해제 — KIS 마스터 zip 전용 최소 파서
function extractFirstFileFromZip(zipBuf: Buffer): Buffer {
  if (zipBuf.length < 30 || zipBuf.readUInt32LE(0) !== 0x04034b50) {
    throw new Error("invalid zip (no local file header)");
  }
  const flags = zipBuf.readUInt16LE(6);
  const method = zipBuf.readUInt16LE(8);
  let compSize = zipBuf.readUInt32LE(18);
  let uncompSize = zipBuf.readUInt32LE(22);
  const fnl = zipBuf.readUInt16LE(26);
  const efl = zipBuf.readUInt16LE(28);
  const dataStart = 30 + fnl + efl;

  // data descriptor 플래그 셋이면 크기가 0 → 중앙 디렉터리에서 조회
  if (compSize === 0 && uncompSize === 0 && flags & 0x08) {
    const eocdSig = 0x06054b50;
    const cdEntrySig = 0x02014b50;
    const searchStart = Math.max(0, zipBuf.length - 65557);
    let eocdOff = -1;
    for (let i = zipBuf.length - 22; i >= searchStart; i--) {
      if (zipBuf.readUInt32LE(i) === eocdSig) {
        eocdOff = i;
        break;
      }
    }
    if (eocdOff < 0) throw new Error("zip EOCD not found");
    const cdOff = zipBuf.readUInt32LE(eocdOff + 16);
    if (zipBuf.readUInt32LE(cdOff) !== cdEntrySig) {
      throw new Error("zip central directory malformed");
    }
    compSize = zipBuf.readUInt32LE(cdOff + 20);
    uncompSize = zipBuf.readUInt32LE(cdOff + 24);
  }

  const compData = zipBuf.subarray(dataStart, dataStart + compSize);
  if (method === 0) return compData;
  if (method === 8) return zlib.inflateRawSync(compData);
  throw new Error(`unsupported zip compression method ${method}`);
}

// 동시 호출 방지: 같은 프로세스에서 토큰 발급 in-flight Promise 공유
let inflightTokenPromise: Promise<string> | null = null;

/** KIS 토큰 발급/재사용 — Redis에 캐싱. 만료 10분 전이면 재발급.
 *  병렬 호출 시 동일 발급 요청이 중복되지 않도록 in-flight promise를 공유한다. */
export async function getKisToken(): Promise<string> {
  const cached = await redis.get<TokenCache>(TOKEN_KEY);
  if (cached?.access_token && cached.expires_at - Date.now() > TOKEN_RENEW_WINDOW_MS) {
    return cached.access_token;
  }
  if (inflightTokenPromise) return inflightTokenPromise;

  inflightTokenPromise = (async () => {
    try {
      const appKey = requireEnv("KIS_APP_KEY");
      const appSecret = requireEnv("KIS_APP_SECRET");
      const res = await fetch(`${KIS_BASE}/oauth2/tokenP`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credentials",
          appkey: appKey,
          appsecret: appSecret,
        }),
      });
      const data = (await res.json()) as {
        access_token?: string;
        access_token_token_expired?: string;
        error_description?: string;
      };
      if (!data.access_token || !data.access_token_token_expired) {
        throw new Error(`KIS token issue failed: ${data.error_description ?? JSON.stringify(data)}`);
      }
      const expiresAt = new Date(data.access_token_token_expired.replace(" ", "T") + "+09:00").getTime();
      const token: TokenCache = { access_token: data.access_token, expires_at: expiresAt };
      const ttlSec = Math.max(60, Math.floor((expiresAt - Date.now()) / 1000));
      await redis.set(TOKEN_KEY, token, { ex: ttlSec });
      return data.access_token;
    } finally {
      inflightTokenPromise = null;
    }
  })();
  return inflightTokenPromise;
}

/** KIS 종목 시세(현재가) 조회 — PER/EPS/PBR 포함 */
export interface KisStockPriceInfo {
  symbol6: string;        // 6자리 단축코드 (예: "005930")
  market: "kospi" | "kosdaq" | "unknown";
  price: number;          // 현재가 (원)
  marketCapKRW: number;   // 시가총액 (원)
  per: number | null;
  eps: number | null;
  pbr: number | null;
  bps: number | null;
  sharesOutstanding: number;
  high52w: number | null;
  low52w: number | null;
  industryName: string | null;
  fetchedAt: string;
}

const STOCK_PRICE_CACHE_TTL_SEC = 6 * 60 * 60;
const STOCK_PRICE_CACHE_KEY = (code: string) => `kis:stock-price:${code}`;

export async function fetchKoreanStockPrice(symbol6: string): Promise<KisStockPriceInfo | null> {
  const code = symbol6.replace(/\.[A-Z]{2,3}$/, "").trim();
  if (!/^\d{6}$/.test(code)) return null;

  const cached = await redis.get<KisStockPriceInfo>(STOCK_PRICE_CACHE_KEY(code));
  if (cached && cached.price > 0) return cached;

  const token = await getKisToken();
  const url = `${KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${code}`;
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      appkey: requireEnv("KIS_APP_KEY"),
      appsecret: requireEnv("KIS_APP_SECRET"),
      tr_id: "FHKST01010100",
      custtype: "P",
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { rt_cd?: string; output?: Record<string, string> };
  if (j.rt_cd !== "0" || !j.output) return null;
  const o = j.output;

  const num = (v: string | undefined) => {
    if (v == null || v === "" || v === "0") return v === "0" ? 0 : null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };

  const price = num(o.stck_prpr);
  const shares = num(o.lstn_stcn);
  // hts_avls 단위는 "억원" (확인됨: 12,832,582 억원 = 1283조원 ≈ 삼성전자 시총)
  const marketCapEokWon = num(o.hts_avls);
  const marketCapKRW = marketCapEokWon != null ? marketCapEokWon * 1e8 : (price && shares ? price * shares : 0);

  if (!price || price <= 0) return null;

  const result: KisStockPriceInfo = {
    symbol6: code,
    market: "unknown", // 호출자가 결정 (마스터 zip 안 깨고 빠르게 가려면)
    price,
    marketCapKRW,
    per: num(o.per),
    eps: num(o.eps),
    pbr: num(o.pbr),
    bps: num(o.bps),
    sharesOutstanding: shares ?? 0,
    high52w: num(o.w52_hgpr),
    low52w: num(o.w52_lwpr),
    industryName: o.bstp_kor_isnm ?? null,
    fetchedAt: new Date().toISOString(),
  };
  await redis.set(STOCK_PRICE_CACHE_KEY(code), result, { ex: STOCK_PRICE_CACHE_TTL_SEC });
  return result;
}

/** KIS 마스터에서 KOSPI200 정규 선물 근월물 단축코드 반환. Redis에 당일만 캐싱. */
export async function getNearestFuturesCode(): Promise<string> {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const kstDateStr = `${kst.getUTCFullYear()}${String(kst.getUTCMonth() + 1).padStart(2, "0")}${String(
    kst.getUTCDate()
  ).padStart(2, "0")}`;

  const cached = await redis.get<{ code: string; date: string }>(FUTURES_CODE_KEY);
  if (cached?.code && cached.date === kstDateStr) {
    return cached.code;
  }

  const res = await fetch(MASTER_URL);
  if (!res.ok) throw new Error(`KIS master download failed: HTTP ${res.status}`);
  const zipBuf = Buffer.from(await res.arrayBuffer());
  const mstBuf = extractFirstFileFromZip(zipBuf);
  const text = new TextDecoder("euc-kr").decode(mstBuf);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  // 포맷: type | shcode | isin | name("F YYYYMM") | ... | "KOSPI200"
  const currentYYYYMM = kstDateStr.slice(0, 6);
  type Row = { shcode: string; expiryMonth: string };
  const regular: Row[] = [];
  for (const line of lines) {
    const cols = line.split("|");
    if (cols.length < 9) continue;
    if (cols[0] !== "1") continue; // 정규 선물만
    if (!/KOSPI200/.test(cols[8])) continue;
    const shcode = cols[1];
    const monthMatch = cols[3].match(/(\d{6})/);
    if (!monthMatch) continue;
    const expiryMonth = monthMatch[1];
    if (expiryMonth < currentYYYYMM) continue;
    regular.push({ shcode, expiryMonth });
  }
  regular.sort((a, b) => a.expiryMonth.localeCompare(b.expiryMonth));
  if (regular.length === 0) {
    throw new Error("KOSPI200 regular futures not found in master");
  }
  const near = regular[0];

  const kstEndOfDay = new Date(
    `${kstDateStr.slice(0, 4)}-${kstDateStr.slice(4, 6)}-${kstDateStr.slice(6, 8)}T23:59:59+09:00`
  );
  const ttlSec = Math.max(60, Math.floor((kstEndOfDay.getTime() - Date.now()) / 1000));
  await redis.set(FUTURES_CODE_KEY, { code: near.shcode, date: kstDateStr }, { ex: ttlSec });
  return near.shcode;
}

interface RawBar {
  stck_bsop_date: string;
  stck_cntg_hour: string;
  futs_prpr: string;
  futs_oprc: string;
  futs_hgpr: string;
  futs_lwpr: string;
  cntg_vol: string;
}

function parseKstToIso(dateYYYYMMDD: string, hourHHMMSS: string): string {
  const y = dateYYYYMMDD.slice(0, 4);
  const m = dateYYYYMMDD.slice(4, 6);
  const d = dateYYYYMMDD.slice(6, 8);
  const hh = hourHHMMSS.slice(0, 2);
  const mm = hourHHMMSS.slice(2, 4);
  const ss = hourHHMMSS.slice(4, 6);
  return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}+09:00`).toISOString();
}

function rawToCandle(r: RawBar): MinuteCandle {
  return {
    time: parseKstToIso(r.stck_bsop_date, r.stck_cntg_hour),
    open: Number(r.futs_oprc),
    high: Number(r.futs_hgpr),
    low: Number(r.futs_lwpr),
    close: Number(r.futs_prpr),
    volume: Number(r.cntg_vol),
  };
}

const SLEEP_MS = 300; // 초당 호출 한도 완충
const MAX_PAGES = 40;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 해당일(YYYY-MM-DD) 코스피200 선물 근월물 1분봉 전체 수집(KIS) — 페이지네이션 포함. */
export async function fetchKosp200FuturesMinutes(date: string): Promise<MinuteCandle[]> {
  const [y, m, d] = date.split("-");
  if (!y || !m || !d) throw new Error(`invalid date: ${date}`);
  const dateStr = `${y}${m}${d}`;

  const token = await getKisToken();
  const code = await getNearestFuturesCode();
  const appKey = requireEnv("KIS_APP_KEY");
  const appSecret = requireEnv("KIS_APP_SECRET");

  // 시장: 코스피200 선물은 09:00 시작, 주간 15:45 종료. 여유있게 15:50부터 역순 페이지네이션.
  let cursorHour = "155000";
  const stopHour = "085900"; // 09:00 이전에 멈춤
  const seenKeys = new Set<string>();
  const all: MinuteCandle[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) await sleep(SLEEP_MS);

    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "F",
      FID_INPUT_ISCD: code,
      FID_HOUR_CLS_CODE: "60",
      FID_PW_DATA_INCU_YN: "N",
      FID_FAKE_TICK_INCU_YN: "",
      FID_INPUT_DATE_1: dateStr,
      FID_INPUT_DATE_2: dateStr,
      FID_INPUT_HOUR_1: cursorHour,
    });
    const url = `${KIS_BASE}/uapi/domestic-futureoption/v1/quotations/inquire-time-fuopchartprice?${params.toString()}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: "FHKIF03020200",
        custtype: "P",
      },
    });
    const data = (await res.json()) as { rt_cd?: string; msg1?: string; output2?: RawBar[] };
    if (data.rt_cd !== "0") {
      if (data.rt_cd === "1" && /초당/.test(data.msg1 ?? "")) {
        await sleep(1200);
        continue;
      }
      throw new Error(`KIS minute chart failed: rt_cd=${data.rt_cd} msg=${data.msg1}`);
    }
    const rows = data.output2 ?? [];
    if (rows.length === 0) break;

    let added = 0;
    let earliest = rows[0].stck_cntg_hour;
    for (const r of rows) {
      if (!r.stck_bsop_date || !r.stck_cntg_hour) continue;
      if (r.stck_bsop_date !== dateStr) continue; // 다른 날짜 섞여오는 경우 방어
      if (r.stck_cntg_hour < earliest) earliest = r.stck_cntg_hour;
      const key = `${r.stck_bsop_date}-${r.stck_cntg_hour}`;
      if (seenKeys.has(key)) continue;
      // 가격/거래량이 모두 0 인 행은 장외 시간대 — 제외
      if (Number(r.futs_prpr) === 0 && Number(r.cntg_vol) === 0) continue;
      seenKeys.add(key);
      all.push(rawToCandle(r));
      added++;
    }

    // 다음 페이지 커서: 이번 응답의 가장 이른 시각 1분 전
    if (earliest <= stopHour) break;
    const nextHour = decrementMinute(earliest);
    if (nextHour === cursorHour) break; // 진행 없음
    cursorHour = nextHour;
    if (added === 0) break;
  }

  all.sort((a, b) => a.time.localeCompare(b.time));
  return all;
}

function decrementMinute(hhmmss: string): string {
  const hh = Number(hhmmss.slice(0, 2));
  const mm = Number(hhmmss.slice(2, 4));
  const total = hh * 60 + mm - 1;
  if (total < 0) return "000000";
  const nhh = Math.floor(total / 60);
  const nmm = total % 60;
  return `${String(nhh).padStart(2, "0")}${String(nmm).padStart(2, "0")}00`;
}

/* ────────────────────────────────────────────────────────────
 *  종목별 일별 외국인/기관/개인 매매 동향 (FHKST01010900)
 *
 *  KIS는 약 30거래일치만 반환한다. 그 이상의 과거는 네이버 등 다른 소스 사용.
 *  매수=양수, 매도=음수로 정규화. 단위: shares=주, value=원.
 * ──────────────────────────────────────────────────────────── */

export interface KisInvestorDailyEntry {
  /** YYYY-MM-DD */
  date: string;
  /** 종가 (원) */
  close: number | null;
  /** 순매수 수량 (주) — 매수=양수, 매도=음수 */
  foreignShares: number;
  institutionShares: number;
  individualShares: number;
  /** 순매수 대금 (원). KIS는 거래대금(매도+매수)을 따로 주지 않으므로 close*shares로 추정 */
  foreignValue: number | null;
  institutionValue: number | null;
  individualValue: number | null;
}

interface KisInvestorRawRow {
  stck_bsop_date?: string;
  stck_clpr?: string;
  /** 외국인 순매수 수량 (천주 단위로 오는 경우 많음 — 실측 후 보정) */
  frgn_ntby_qty?: string;
  /** 기관 합계 순매수 수량 */
  orgn_ntby_qty?: string;
  /** 개인 순매수 수량 */
  prsn_ntby_qty?: string;
  /** 외국인 순매수 대금 */
  frgn_ntby_tr_pbmn?: string;
  orgn_ntby_tr_pbmn?: string;
  prsn_ntby_tr_pbmn?: string;
}

function safeNum(v: string | undefined): number {
  if (!v) return 0;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * 종목 6자리 코드(예: "005930")로 일별 투자자 매매동향 조회.
 * 기본 30거래일. KIS API 한계로 그 이상은 네이버 fallback 필요.
 */
export async function fetchKisInvestorTrend(
  symbol6: string
): Promise<KisInvestorDailyEntry[]> {
  const code = symbol6.replace(/\.[A-Z]{2,3}$/, "").trim();
  if (!/^\d{6}$/.test(code)) {
    throw new Error(`invalid Korean stock code: ${symbol6}`);
  }

  const token = await getKisToken();
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: "J",
    FID_INPUT_ISCD: code,
  });
  const url =
    `${KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-investor` +
    `?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      appkey: requireEnv("KIS_APP_KEY"),
      appsecret: requireEnv("KIS_APP_SECRET"),
      tr_id: "FHKST01010900",
      custtype: "P",
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`KIS investor fetch HTTP ${res.status}`);
  }
  const j = (await res.json()) as {
    rt_cd?: string;
    msg1?: string;
    output?: KisInvestorRawRow[];
  };
  if (j.rt_cd !== "0") {
    throw new Error(`KIS investor fetch failed: rt_cd=${j.rt_cd} msg=${j.msg1}`);
  }
  const rows = j.output ?? [];

  const out: KisInvestorDailyEntry[] = [];
  for (const r of rows) {
    const ymd = r.stck_bsop_date;
    if (!ymd || ymd.length !== 8) continue;
    const date = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
    const close = safeNum(r.stck_clpr) || null;
    out.push({
      date,
      close,
      foreignShares: safeNum(r.frgn_ntby_qty),
      institutionShares: safeNum(r.orgn_ntby_qty),
      individualShares: safeNum(r.prsn_ntby_qty),
      foreignValue: r.frgn_ntby_tr_pbmn ? safeNum(r.frgn_ntby_tr_pbmn) : null,
      institutionValue: r.orgn_ntby_tr_pbmn ? safeNum(r.orgn_ntby_tr_pbmn) : null,
      individualValue: r.prsn_ntby_tr_pbmn ? safeNum(r.prsn_ntby_tr_pbmn) : null,
    });
  }
  // 오름차순으로 정렬 (오래된 → 최신)
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}
