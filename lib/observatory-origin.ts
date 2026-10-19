/**
 * 관측소 원출처 수집 — FRED 시리즈 대신 원출처에서 같은 값을 받아 FRED 와 같은 모양({date, value})으로 돌려준다.
 * 수집기들은 FRED 응답을 가공하던 코드를 그대로 쓰므로, 값이 같으면 판정도 같다.
 *
 * 출처 (2026-10-19 확인)
 *  - 연준 이사회 발표 페이지의 XML 묶음 (미션 6에서 DDP 주소에서 옮김):
 *      https://www.federalreserve.gov/releases/{h41|h8|chgdel|h15|z1|prates}/data/FRB_{…}_xml.zip
 *    DDP 묶음(Output.aspx?rel=…&filetype=zip)과 바이트까지 같은 파일이다(2026-10-19 H.4.1 로 cmp 확인).
 *    연준 공지(2026-07-16, federalreserve.gov/data/data-download-fred-information.htm): "Historical data will remain
 *    available for download as XML files on statistical release pages." — DDP 는 폐지 예정이지만 이 경로는 남는다.
 *    안에 {REL}_data.xml(SDMX). 크기가 커서(H.4.1 XML 약 127MB, Z.1 약 620MB) 통째로 풀지 않고 스트리밍으로 읽어
 *    필요한 시리즈만 꺼내고 다 찾으면 멈춘다.
 *    용량 줄이기(미션 6): ETag 로 조건부 요청을 보내 바뀐 날만 내려받고(304 면 0 바이트), 꺼낸 시리즈는 Redis
 *    (observatory:origin-cache:{REL})에 보관해 304 일 때 그 값을 쓴다.
 *    이용 조건: "Unless otherwise indicated, information on Board's website is in the public domain and may be
 *    copied and distributed without permission. Please cite to the Board as the source"(federalreserve.gov/disclaimer.htm).
 *  - 뉴욕 연은 Markets Data API: SOFR https://markets.newyorkfed.org/api/rates/secured/sofr/search.json
 *    역레포·레포 운영 결과 https://markets.newyorkfed.org/api/rp/results/search.json (미션 6, 아래 fetchNyFedRp)
 *    이용 조건: 뉴욕 연은 약관의 출처 표기와 SOFR 고지문(app/observatory/source-notices.tsx).
 *
 * FRED 와의 대조 (2026-10-19, 전 기간): 아래 연준 이사회 13개 + 뉴욕 연은 SOFR, 모두 14개 값·날짜 불일치 0.
 * FRED 가 바꿔 주던 것은 두 가지뿐이라 여기서 똑같이 바꾼다:
 *  - 분기 자료(Z.1, CHGDEL)의 날짜: 원출처는 분기 말일, FRED 는 분기 첫날 → 분기 첫날로.
 *  - H.8 의 단위: 원출처는 백만 달러, FRED 는 십억 달러 → 소수점을 세 자리 옮긴다(부동소수 나눗셈을 쓰지 않아 FRED 문자열과 같은 값).
 */
import { createInflateRaw } from "node:zlib";
import { StringDecoder } from "node:string_decoder";
import { redis } from "@/lib/redis";

export interface OriginObs {
  date: string;
  value: string;
}

/** H6(통화량)은 관측소가 쓰지 않고 사이트 다른 화면(미국 유동성)만 쓴다 (미션 8, lib/site-origin.ts) */
export type FedRelease = "H41" | "H8" | "CHGDEL" | "H15" | "Z1" | "PRATES" | "H6";

interface FedMapping {
  rel: FedRelease;
  /** 원출처 시리즈 이름 (SERIES_NAME) */
  name: string;
  /** 분기 말일 → 분기 첫날 */
  quarterStart?: boolean;
  /** 백만 → 십억 달러 (소수점 세 자리 이동) */
  millionsToBillions?: boolean;
}

/** FRED 시리즈 → 원출처 시리즈 (2026-10-19 값 대조로 찾음, 결정 로그 17장) */
export const FED_MAPPING: Record<string, FedMapping> = {
  WRESBAL: { rel: "H41", name: "RESH4R_XAW_N.WW" },
  WLCFLPCL: { rel: "H41", name: "RESPPALDP_N.WW" },
  BOGZ1FL403069330Q: { rel: "Z1", name: "FL403069330.Q", quarterStart: true },
  DPSSCBW027NBOG: { rel: "H8", name: "B1058NSMD", millionsToBillions: true },
  DPSLCBW027NBOG: { rel: "H8", name: "B1058NLGD", millionsToBillions: true },
  LNFACBW027SBOG: { rel: "H8", name: "B1030NCBA", millionsToBillions: true },
  TOTLL: { rel: "H8", name: "B1020NCBA", millionsToBillions: true },
  CORBLACBS: { rel: "CHGDEL", name: "STFBQCB%STFBAILB_MA.Q", quarterStart: true },
  DRCRELEXFACBS: { rel: "CHGDEL", name: "STFBQDSX%STFBAILSX_XEOP_XDO_MA.Q", quarterStart: true },
  DRCRELEXFT100S: { rel: "CHGDEL", name: "STFBQDSX%STFBAILSX_XEOP_XDO_XS1A2_MA.Q", quarterStart: true },
  DRCRELEXFOBS: { rel: "CHGDEL", name: "STFBQDSX%STFBAILSX_XEOP_XDO_XS3A4_MA.Q", quarterStart: true },
  DGS10: { rel: "H15", name: "RIFLGFCY10_N.B" },
  IORB: { rel: "PRATES", name: "RESBM_N.D" },
};

/** 발표 페이지 XML 묶음 주소 (대출 상각률은 chargeoff → chgdel 로 옮겨져 최종 주소를 쓴다) */
const RELEASE_ZIP: Record<FedRelease, string> = {
  H41: "https://www.federalreserve.gov/releases/h41/data/FRB_h41_xml.zip",
  H8: "https://www.federalreserve.gov/releases/h8/data/FRB_h8_xml.zip",
  CHGDEL: "https://www.federalreserve.gov/releases/chgdel/data/FRB_CHGDEL_xml.zip",
  H15: "https://www.federalreserve.gov/releases/h15/data/FRB_h15_xml.zip",
  Z1: "https://www.federalreserve.gov/releases/z1/data/FRB_Z1_xml.zip",
  PRATES: "https://www.federalreserve.gov/releases/prates/data/FRB_PRATES_xml.zip",
  H6: "https://www.federalreserve.gov/releases/h6/data/FRB_H6_xml.zip",
};

/** 이 묶음에서 한 번 실행 동안 필요한 시리즈 (같은 cron 실행에서 묶음을 한 번만 받으려고 미리 모은다) */
function namesFor(rel: FedRelease): string[] {
  return Object.values(FED_MAPPING)
    .filter((m) => m.rel === rel)
    .map((m) => m.name);
}

const UA = "TockTock/1.0 (observatory data collector)";

/* ────────────────────────────────────────────────────────────
 * zip 안의 XML 을 스트리밍으로 읽어 필요한 시리즈만 꺼낸다
 * ──────────────────────────────────────────────────────────── */

function locateEntry(buf: Buffer, entryName: string): { start: number; size: number; method: number } {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("연준 zip: 끝 레코드를 찾지 못함");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("연준 zip: 중앙 디렉터리 형식 오류");
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    if (buf.toString("utf8", p + 46, p + 46 + nameLen) === entryName) {
      const start = localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28);
      return { start, size, method };
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`연준 zip: ${entryName} 없음`);
}

function parseObs(block: string): { t: string; v: string }[] {
  const out: { t: string; v: string }[] = [];
  for (const m of block.matchAll(/<frb:Obs\b([^>]*)\/>/g)) {
    const v = /OBS_VALUE="([^"]*)"/.exec(m[1])?.[1];
    const t = /TIME_PERIOD="([^"]*)"/.exec(m[1])?.[1];
    const status = /OBS_STATUS="([^"]*)"/.exec(m[1])?.[1];
    // 상태가 "A"(값 있음)인 것만 쓴다. ND(자료 없음, 공휴일 등)·NA·NC 는 -9999 같은 자리표시 값이라 건너뛴다 —
    // FRED 는 같은 날을 "." 로 주고 수집기가 건너뛰므로 결과가 같다 (2026-10-19 H.15 공휴일 721일로 확인)
    if (status !== undefined && status !== "A") continue;
    if (t && v !== undefined && v !== "" && v !== "NaN" && Number.isFinite(Number(v))) out.push({ t, v });
  }
  return out;
}

function extractSeries(zip: Buffer, entryName: string, names: string[]): Promise<Map<string, { t: string; v: string }[]>> {
  const { start, size, method } = locateEntry(zip, entryName);
  if (method !== 8) throw new Error(`연준 zip: 지원하지 않는 압축 방식 ${method}`);
  const want = new Set(names);
  const out = new Map<string, { t: string; v: string }[]>();
  return new Promise((resolve, reject) => {
    const inflater = createInflateRaw();
    const decoder = new StringDecoder("utf8");
    let buf = "";
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      inflater.destroy();
      if (want.size > 0) reject(new Error(`연준 ${entryName}: 시리즈 없음 — ${[...want].join(", ")}`));
      else resolve(out);
    };
    inflater.on("data", (chunk: Buffer) => {
      if (done) return;
      buf += decoder.write(chunk);
      for (;;) {
        const s = buf.indexOf("<kf:Series ");
        if (s < 0) {
          buf = buf.slice(-16); // 태그가 조각 경계에 걸칠 수 있어 끝 몇 글자는 남긴다
          break;
        }
        const e = buf.indexOf("</kf:Series>", s);
        if (e < 0) {
          buf = buf.slice(s);
          break;
        }
        const block = buf.slice(s, e);
        const m = /SERIES_NAME="([^"]+)"/.exec(block.slice(0, 600));
        if (m && want.has(m[1])) {
          out.set(m[1], parseObs(block));
          want.delete(m[1]);
          if (want.size === 0) return finish();
        }
        buf = buf.slice(e + 12);
      }
    });
    inflater.on("end", finish);
    inflater.on("error", (err) => {
      if (!done) {
        done = true;
        reject(err);
      }
    });
    inflater.end(zip.subarray(start, start + size));
  });
}

/* 같은 cron 실행 안에서는 묶음을 한 번만 받는다 (예: H.8 은 예금 유출·NDFI 가 같이 쓴다).
 * 메모리 캐시는 보관 키별로 따로 둔다 — 사이트 다른 화면(lib/site-origin.ts)은 같은 묶음에서 다른 시리즈를 꺼내
 * 다른 키에 보관하므로, 묶음 이름만으로 나누면 서로의 결과를 잘못 돌려준다(미션 8). */
const releaseCache = new Map<string, { at: number; p: Promise<Map<string, { t: string; v: string }[]>> }>();
const CACHE_MS = 10 * 60 * 1000;

interface ReleaseCache {
  etag: string | null;
  lastModified: string | null;
  savedAt: string;
  /** 시리즈 이름 → [기간, 값] (상태 "A" 만) */
  series: Record<string, [string, string][]>;
}

/** 요청별 기록 (cron 응답에 싣는다 — 용량·시간 측정용) */
export const originFetchLog: { rel: string; status: number; bytes: number; ms: number }[] = [];

const cacheKey = (rel: FedRelease) => `observatory:origin-cache:${rel}`;

export interface ReleaseLoadOptions {
  /** Redis 보관 키. null 이면 Redis 를 쓰지 않는다(GitHub Actions 처럼 Redis 가 없는 곳) */
  storeKey: string | null;
  /** 이 날짜(기간 문자열) 이전 관측치는 보관·반환하지 않는다 (Redis 값 크기를 줄이려고) */
  keepFrom?: string;
  /** originFetchLog 에 남길지 (관측소 cron 응답용이라 사이트 화면 요청은 남기지 않는다) */
  log?: boolean;
}

/**
 * 발표 묶음에서 시리즈 몇 개를 꺼낸다. ETag 조건부 요청 + Redis 보관(미션 6)을 그대로 쓴다.
 * 관측소는 loadRelease(아래)로, 사이트 다른 화면은 lib/site-origin.ts 에서 자기 보관 키로 부른다.
 */
export async function loadReleaseSeries(
  rel: FedRelease,
  names: string[],
  opts: ReleaseLoadOptions
): Promise<Map<string, { t: string; v: string }[]>> {
  const memKey = opts.storeKey ?? `nostore:${rel}:${names.join(",")}`;
  const log = opts.log ?? true;
  const hit = releaseCache.get(memKey);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    if (log) originFetchLog.push({ rel, status: 0, bytes: 0, ms: 0 }); // status 0 = 같은 프로세스의 10분 메모리 캐시 (요청 없음)
    return hit.p;
  }
  const p = (async () => {
    // @upstash/redis 는 직렬화/역직렬화를 자동 처리한다 (JSON.parse 금지)
    const cached = opts.storeKey ? await redis.get<ReleaseCache>(opts.storeKey) : null;
    const usable = cached && names.every((n) => Array.isArray(cached.series?.[n]) && cached.series[n].length > 0);
    const headers: Record<string, string> = { "User-Agent": UA };
    if (usable && cached.etag) headers["If-None-Match"] = cached.etag;
    if (usable && cached.lastModified) headers["If-Modified-Since"] = cached.lastModified;
    const t0 = Date.now();
    const res = await fetch(RELEASE_ZIP[rel], { cache: "no-store", signal: AbortSignal.timeout(40000), headers });
    if (res.status === 304 && usable) {
      if (log) originFetchLog.push({ rel, status: 304, bytes: 0, ms: Date.now() - t0 });
      return new Map(names.map((n) => [n, cached.series[n].map(([t, v]) => ({ t, v }))]));
    }
    if (!res.ok) throw new Error(`연준 ${rel} 묶음: ${res.status}`);
    const zip = Buffer.from(await res.arrayBuffer());
    if (log) originFetchLog.push({ rel, status: res.status, bytes: zip.length, ms: Date.now() - t0 });
    const extracted = await extractSeries(zip, `${rel}_data.xml`, names);
    const out = opts.keepFrom
      ? new Map([...extracted].map(([n, obs]) => [n, obs.filter((o) => o.t >= opts.keepFrom!)]))
      : extracted;
    if (opts.storeKey) {
      const save: ReleaseCache = {
        etag: res.headers.get("etag"),
        lastModified: res.headers.get("last-modified"),
        savedAt: new Date().toISOString(),
        series: Object.fromEntries([...out].map(([n, obs]) => [n, obs.map((o) => [o.t, o.v] as [string, string])])),
      };
      await redis.set(opts.storeKey, save);
    }
    return out;
  })();
  releaseCache.set(memKey, { at: Date.now(), p });
  p.catch(() => releaseCache.delete(memKey)); // 실패는 기억하지 않는다
  return p;
}

/** 관측소용 — FED_MAPPING 의 시리즈를 observatory:origin-cache:{REL} 에 보관 (미션 6 그대로) */
function loadRelease(rel: FedRelease): Promise<Map<string, { t: string; v: string }[]>> {
  return loadReleaseSeries(rel, namesFor(rel), { storeKey: cacheKey(rel) });
}

/** "2026-06-30" → "2026-04-01" */
export function toQuarterStart(d: string): string {
  const y = d.slice(0, 4);
  const m = Number(d.slice(5, 7));
  return `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
}

/** "567255.3" → "567.2553" (소수점을 왼쪽으로 세 자리) — 부동소수 나눗셈 오차 없이 FRED 문자열과 같은 값 */
export function shiftDecimal3(v: string): string {
  const neg = v.startsWith("-");
  const s = neg ? v.slice(1) : v;
  const [ip, fp = ""] = s.split(".");
  const padded = ip.padStart(4, "0");
  const intPart = padded.slice(0, -3).replace(/^0+(?=\d)/, "");
  const frac = (padded.slice(-3) + fp).replace(/0+$/, "");
  return (neg ? "-" : "") + intPart + (frac ? "." + frac : "");
}

/* ────────────────────────────────────────────────────────────
 * 뉴욕 연은 SOFR
 * ──────────────────────────────────────────────────────────── */

/** log: originFetchLog(관측소 cron 응답)에 남길지 — 사이트 다른 화면(lib/site-origin.ts)은 false (미션 8) */
export async function fetchSofr(observationStart: string, log = true): Promise<OriginObs[]> {
  const startYear = Number(observationStart.slice(0, 4));
  const endYear = new Date().getUTCFullYear();
  const out: OriginObs[] = [];
  for (let y = Math.max(startYear, 2018); y <= endYear; y++) {
    const t0 = Date.now();
    const res = await fetch(
      `https://markets.newyorkfed.org/api/rates/secured/sofr/search.json?startDate=${y}-01-01&endDate=${y}-12-31`,
      { cache: "no-store", signal: AbortSignal.timeout(15000), headers: { "User-Agent": UA } }
    );
    if (!res.ok) throw new Error(`뉴욕 연은 SOFR: ${res.status}`);
    const body = await res.text();
    if (log) originFetchLog.push({ rel: `NYFED-SOFR(${y})`, status: res.status, bytes: Buffer.byteLength(body), ms: Date.now() - t0 });
    const json = JSON.parse(body) as { refRates?: { effectiveDate: string; percentRate: number }[] }; // 외부 API 응답 (Redis 아님)
    for (const r of json.refRates ?? []) {
      if (r.effectiveDate >= observationStart && Number.isFinite(r.percentRate)) {
        out.push({ date: r.effectiveDate, value: String(r.percentRate) });
      }
    }
  }
  return out;
}

/* ────────────────────────────────────────────────────────────
 * 뉴욕 연은 역레포·레포 운영 결과 (미션 6) — FRED RRPONTSYD·RPONTTLD 대신
 *
 * 정의 (2026-10-19 FRED 와 전 기간 대조로 정함, 결정 로그 18장):
 *  - 결제일(settlementDate) 기준으로 묶는다 (FRED 도 결제일 기준).
 *  - 뉴욕 연은이 "Overnight" 로 분류한 결과(auctionStatus "Results")만.
 *  - 역레포: 국채(Treasury) 구간의 낙찰액(amtAccepted) 합. 국채 구간이 없는 날(MBS 만 쓴 시험 운영)은 값이 없다 —
 *    FRED 도 그날을 "." 로 둔다.
 *  - 레포: 모든 증권 구간 낙찰액 합. FRED 와 같게 평일마다 행을 만들고 운영이 없는 날은 "." (수집기가 0 으로 저장).
 *    원자료 첫날(2000-07-07) 전은 만들지 않는다 — 운영이 있었는데 자료가 없을 뿐이라 0 으로 채우면 거짓이다.
 *  - 같은 결제일에 운영이 여러 건이면 모두 더한다(FRED 는 한 건만 싣는 날이 있었다: 2020-02-19, 2019-12-31).
 *  - 금액은 달러 정수 → 십억 달러 문자열로 바꾼다(소수점 이동, 부동소수 오차 없음).
 *  - 검색 API 는 결제일이 아니라 운영일(operationDate)로 거른다. 전날 운영·당일 결제 건이 빠져 첫날 합계가
 *    일부만 잡히지 않도록 RP_QUERY_LEAD_DAYS 만큼 앞에서부터 받고, 돌려줄 때는 observationStart 이후만 남긴다.
 * ──────────────────────────────────────────────────────────── */

interface RpOperation {
  operationType: string;
  auctionStatus?: string;
  settlementDate: string;
  term?: string;
  details?: { securityType: string; amtAccepted?: number }[];
}

/** 달러 정수 → 십억 달러 문자열 ("95000000" → "0.095") */
export function dollarsToBillions(dollars: bigint): string {
  const neg = dollars < BigInt(0);
  const abs = neg ? -dollars : dollars;
  const unit = BigInt(1000000000);
  const whole = abs / unit;
  const frac = (abs % unit).toString().padStart(9, "0").replace(/0+$/, "");
  return (neg ? "-" : "") + whole.toString() + (frac ? "." + frac : "");
}

function* weekdays(from: string, to: string): Generator<string> {
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) yield d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

/** 운영일과 결제일이 다른 건(주말·휴일을 낀 익일물 등)을 놓치지 않으려고 앞당겨 받는 날수 */
const RP_QUERY_LEAD_DAYS = 7;

/** log: fetchSofr 와 같다 (미션 8) */
export async function fetchNyFedRp(kind: "rrp" | "repo", observationStart: string, log = true): Promise<OriginObs[]> {
  const today = new Date().toISOString().slice(0, 10);
  const lead = new Date(`${observationStart}T00:00:00Z`);
  lead.setUTCDate(lead.getUTCDate() - RP_QUERY_LEAD_DAYS);
  const queryStart = lead.toISOString().slice(0, 10);
  const t0 = Date.now();
  const res = await fetch(
    `https://markets.newyorkfed.org/api/rp/results/search.json?startDate=${queryStart}&endDate=${today}`,
    { cache: "no-store", signal: AbortSignal.timeout(30000), headers: { "User-Agent": UA } }
  );
  if (!res.ok) throw new Error(`뉴욕 연은 RP: ${res.status}`);
  const text = await res.text();
  if (log) originFetchLog.push({ rel: `NYFED-RP(${kind})`, status: res.status, bytes: Buffer.byteLength(text), ms: Date.now() - t0 });
  const json = JSON.parse(text) as { repo?: { operations?: RpOperation[] } }; // 외부 API 응답 파싱 (Redis 아님)
  const ops = json.repo?.operations ?? [];
  const sums = new Map<string, bigint>();
  const type = kind === "rrp" ? "Reverse Repo" : "Repo";
  for (const o of ops) {
    if (o.auctionStatus !== "Results" || o.operationType !== type || o.term !== "Overnight") continue;
    const parts = (o.details ?? []).filter((x) => (kind === "rrp" ? x.securityType === "Treasury" : true));
    if (parts.length === 0) continue; // 역레포인데 국채 구간이 없으면 그날 값은 없다
    let sum = sums.get(o.settlementDate) ?? BigInt(0);
    for (const x of parts) sum += BigInt(Math.round(x.amtAccepted ?? 0));
    sums.set(o.settlementDate, sum);
  }
  if (sums.size === 0) throw new Error(`뉴욕 연은 RP(${kind}): 운영 결과 0건`);
  const dates = [...sums.keys()].sort();
  if (kind === "rrp") {
    // observationStart 앞 날짜는 fetchOriginObservations 끝의 필터가 버린다
    return dates.map((d) => ({ date: d, value: dollarsToBillions(sums.get(d)!) }));
  }
  const out: OriginObs[] = [];
  const from = observationStart > dates[0] ? observationStart : dates[0];
  for (const d of weekdays(from, dates[dates.length - 1])) {
    const v = sums.get(d);
    out.push({ date: d, value: v === undefined ? "." : dollarsToBillions(v) });
  }
  return out;
}

/* ────────────────────────────────────────────────────────────
 * 공용 입구 — FRED 시리즈 ID 로 원출처 관측치를 돌려준다 (observationStart 이후, 날짜 오름차순)
 * ──────────────────────────────────────────────────────────── */

export async function fetchOriginObservations(fredSeriesId: string, observationStart = "1900-01-01"): Promise<OriginObs[]> {
  let obs: OriginObs[];
  if (fredSeriesId === "SOFR") {
    obs = await fetchSofr(observationStart);
  } else if (fredSeriesId === "RRPONTSYD") {
    obs = await fetchNyFedRp("rrp", observationStart);
  } else if (fredSeriesId === "RPONTTLD") {
    obs = await fetchNyFedRp("repo", observationStart);
  } else {
    const m = FED_MAPPING[fredSeriesId];
    if (!m) throw new Error(`원출처 대응이 없는 시리즈: ${fredSeriesId}`);
    const rel = await loadRelease(m.rel);
    const raw = rel.get(m.name);
    if (!raw || raw.length === 0) throw new Error(`연준 ${m.rel} ${m.name}: 관측치 0건`);
    obs = raw.map(({ t, v }) => ({
      date: m.quarterStart ? toQuarterStart(t) : t,
      value: m.millionsToBillions ? shiftDecimal3(v) : v,
    }));
  }
  return obs.filter((o) => o.date >= observationStart).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * cron 시작 때 부르면 연준 발표 묶음 6개를 동시에 받기 시작한다. 각 수집기는 같은 약속(promise)을 기다리므로
 * 차례로 받을 때보다 빨리 끝난다. 결과는 기다리지 않는다(실패는 각 수집기에서 errors 로 드러난다).
 */
export function warmOriginReleases(isOrigin: (fredId: string) => boolean, skip: FedRelease[] = []): void {
  const rels = new Set<FedRelease>();
  for (const [id, m] of Object.entries(FED_MAPPING)) if (isOrigin(id) && !skip.includes(m.rel)) rels.add(m.rel);
  for (const rel of rels) loadRelease(rel).catch(() => undefined);
}

/** 화면에 적을 시리즈 번호 — 원출처에서 받으면 원출처 시리즈 이름, FRED 면 FRED 번호 (미션 5 독립 검증 지적) */
export function displaySeriesId(fredId: string, isOrigin: boolean): string {
  if (!isOrigin) return `${fredId} (FRED)`;
  if (fredId === "SOFR") return "SOFR";
  if (fredId === "RRPONTSYD") return "역레포 운영 결과(국채, 익일물)";
  if (fredId === "RPONTTLD") return "레포 운영 결과(전체 증권, 익일물)";
  return FED_MAPPING[fredId]?.name ?? fredId;
}
