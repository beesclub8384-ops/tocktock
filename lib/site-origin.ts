/**
 * 사이트 전체(관측소 밖) 원출처 수집 — FRED observations API 와 같은 모양으로 돌려준다 (2026-10-19 미션 8).
 *
 * 각 화면은 FRED 응답을 가공하던 코드를 그대로 쓰므로, 여기서 FRED 와 같은 행을 만들면 화면 숫자도 같다.
 * 단 원자료가 FRED 와 다른 곳은 정해 둔 차이로 남는다(T10Y2Y 최신일, RRPONTSYD 5일 — lib/site-source-config.ts, 결정 로그 20-3).
 * 그래서 FRED API 의 동작을 그대로 흉내 낸다:
 *  - 날짜 격자: FRED 는 주기마다 빈 날을 "." 로 채운다(영업일 시리즈는 평일마다, 월 시리즈는 달마다 행이 있다).
 *    limit 은 이 "." 행까지 세므로, 격자를 똑같이 만들어야 "최근 N개"가 같은 기간이 된다.
 *  - observation_start/end → 정렬 → limit 순서.
 *  - units=pc1(전년 동월 대비 %): ((이번 값 / 12개월 전 값) − 1) × 100 을 소수 다섯째 자리로 반올림(FRED 출력과 800개
 *    전부 같음을 확인, 결정 로그 20-3). 어느 한쪽이 없으면 ".".
 *
 * 출처와 이용 조건 (원문, 2026-10-19 확인):
 *  - 연준 이사회(H.4.1·H.15·H.6): "Unless otherwise indicated, information on Board's website is in the public domain and may be
 *    copied and distributed without permission. Please cite to the Board as the source" (federalreserve.gov/disclaimer.htm)
 *    → 관측소의 발표 묶음 수집·ETag 보관(lib/observatory-origin.ts)을 그대로 쓰되 보관 키는 따로(site-origin:fed:{REL}).
 *  - BLS 시계열 파일(download.bls.gov): "everything that we publish, both in hard copy and electronically, is in the public
 *    domain ... You are free to use our public domain material without specific permission, although we do ask that you cite
 *    the Bureau of Labor Statistics as the source." (bls.gov/opub/copyright-information.htm)
 *    BLS 는 이름 없는 요청을 막으므로(403) 사이트 주소를 넣은 User-Agent 를 보낸다.
 *  - BEA NIPA 월별 파일(apps.bea.gov/national/Release/TXT/NipaDataM.txt): "unless stated otherwise, the information posted on
 *    the BEA Web site is in the public domain and may be used or reproduced without specific permission. A citation such as
 *    "Source: U.S. Bureau of Economic Analysis" would be appreciated." (bea.gov/about/policies-and-information/linking)
 *  - 뉴욕 연은(역레포 운영 결과·SOFR): 약관의 출처 표기 문장과 SOFR 고지문이 필요하다(나오는 화면·API 에 넣는다).
 */
import {
  loadReleaseSeries,
  fetchNyFedRp,
  fetchSofr,
  type FedRelease,
  type OriginObs,
} from "@/lib/observatory-origin";
import { redis } from "@/lib/redis";

export interface FredLikeObs {
  date: string;
  value: string;
}

/** FRED 날짜 격자: D5 평일, D7 매일, W 매주(첫 관측 요일 기준), M 매달 1일 */
type Grid = "D5" | "D7" | "W" | "M";

const SITE_UA = "TockTock/1.0 (https://tocktock.vercel.app)";

/* ────────────────────────────────────────────────────────────
 * 연준 이사회 발표 묶음
 * ──────────────────────────────────────────────────────────── */

interface FedDef {
  rel: FedRelease;
  name: string;
  grid: Grid;
  /** 월말 날짜 → 달 첫날 (H.6) */
  monthStart?: boolean;
  /** Redis 보관에 넣지 않는다 — Redis 없이 받는 곳(GitHub Actions 글 수집)만 쓰는 시리즈. 보관 값 크기를 줄이려고 */
  noStore?: boolean;
}

const FED_SITE: Record<string, FedDef> = {
  WALCL: { rel: "H41", name: "RESPPMA_N.WW", grid: "W" },
  WTREGEN: { rel: "H41", name: "RESPPLLDT_XAW_N.WW", grid: "W" },
  DGS2: { rel: "H15", name: "RIFLGFCY02_N.B", grid: "D5" },
  DFII10: { rel: "H15", name: "RIFLGFCY10_XII_N.B", grid: "D5" },
  DGS10: { rel: "H15", name: "RIFLGFCY10_N.B", grid: "D5" },
  DFF: { rel: "H15", name: "RIFSPFF_N.D", grid: "D7", noStore: true },
  M2SL: { rel: "H6", name: "M2.M", grid: "M", monthStart: true },
};

/**
 * 사이트용 보관은 묶음마다 필요한 시리즈만, H.15 는 2000년 이후만 둔다(Redis 값 크기 — 영업일 2,600개 ≈ 10년이면
 * 충분하다). 그보다 앞을 요구하면 아래 siteObservations 가 에러를 낸다(조용히 짧은 기간을 돌려주지 않게).
 */
const FED_KEEP_FROM: Partial<Record<FedRelease, string>> = { H15: "2000-01-01" };

function fedNames(rel: FedRelease, useStore: boolean): string[] {
  return Object.values(FED_SITE)
    .filter((d) => d.rel === rel && !(useStore && d.noStore))
    .map((d) => d.name);
}

async function loadFed(id: string, useStore: boolean): Promise<OriginObs[]> {
  const d = FED_SITE[id];
  if (useStore && d.noStore) throw new Error(`${id}: Redis 보관 대상이 아님 — useStore: false 로 부를 것`);
  const series = await loadReleaseSeries(d.rel, fedNames(d.rel, useStore), {
    storeKey: useStore ? `site-origin:fed:${d.rel}` : null,
    keepFrom: FED_KEEP_FROM[d.rel],
    log: false,
  });
  const raw = series.get(d.name);
  if (!raw || raw.length === 0) throw new Error(`연준 ${d.rel} ${d.name}: 관측치 0건`);
  return raw.map(({ t, v }) => ({ date: d.monthStart ? `${t.slice(0, 8)}01` : t, value: v }));
}

/**
 * 장단기 금리차: H.15 10년물 − 2년물 (둘 다 있는 날), 소수 둘째 자리. 값을 1000배 정수로 바꿔 빼서 부동소수 오차를 없앤다.
 * FRED T10Y2Y 는 재무부 수익률 곡선에서 바로 계산해 H.15 보다 하루 먼저 최신일이 생길 수 있다(결정 로그 20-3).
 */
function spread(a: OriginObs[], b: OriginObs[]): OriginObs[] {
  const bm = new Map(b.map((o) => [o.date, o.value]));
  const toCents = (v: string) => Math.round(Number(v) * 1000); // 원자료는 소수 둘째 자리까지
  const out: OriginObs[] = [];
  for (const o of a) {
    const v2 = bm.get(o.date);
    if (v2 === undefined) continue;
    const diff = (toCents(o.value) - toCents(v2)) / 1000;
    out.push({ date: o.date, value: diff.toFixed(2) });
  }
  return out;
}

/* ────────────────────────────────────────────────────────────
 * BLS·BEA 파일 (ETag·Last-Modified 조건부 요청 + Redis 보관)
 * ──────────────────────────────────────────────────────────── */

interface FlatDef {
  url: string;
  /** 이 파일에서 꺼낼 원출처 시리즈 코드 */
  codes: string[];
  parse: (text: string, codes: Set<string>) => Map<string, OriginObs[]>;
}

/** BLS 시계열 파일: "series_id \t year \t period \t value \t footnote" (탭 구분, 앞뒤 공백). 값이 "-" 인 달(예: 2025년 10월 CPI,
 *  정부 업무 중단으로 미수집)은 건너뛴다 — FRED 도 그 달을 "." 로 둔다 */
function parseBls(text: string, codes: Set<string>): Map<string, OriginObs[]> {
  const out = new Map<string, OriginObs[]>();
  for (const line of text.split("\n")) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const id = line.slice(0, tab).trim();
    if (!codes.has(id)) continue;
    const [, year, period, value] = line.split("\t").map((s) => s.trim());
    if (!/^M(0[1-9]|1[0-2])$/.test(period) || !/^-?\d+(\.\d+)?$/.test(value)) continue; // M13(연평균)·"-" 제외
    if (!out.has(id)) out.set(id, []);
    out.get(id)!.push({ date: `${year}-${period.slice(1)}-01`, value });
  }
  return out;
}

/** BEA NIPA 월별 파일: SeriesCode,Period(YYYYMmm),"Value" — 값의 천 단위 쉼표를 뺀다 */
function parseBea(text: string, codes: Set<string>): Map<string, OriginObs[]> {
  const out = new Map<string, OriginObs[]>();
  for (const line of text.split("\n")) {
    const c1 = line.indexOf(",");
    if (c1 < 0) continue;
    const code = line.slice(0, c1);
    if (!codes.has(code)) continue;
    const c2 = line.indexOf(",", c1 + 1);
    const period = line.slice(c1 + 1, c2);
    const value = line.slice(c2 + 1).trim().replace(/"/g, "").replace(/,/g, "");
    if (!/^\d{4}M\d{2}$/.test(period) || !/^-?\d+(\.\d+)?$/.test(value)) continue;
    if (!out.has(code)) out.set(code, []);
    out.get(code)!.push({ date: `${period.slice(0, 4)}-${period.slice(5, 7)}-01`, value });
  }
  return out;
}

const FLAT: Record<string, FlatDef> = {
  "bls-cu-allitems": {
    url: "https://download.bls.gov/pub/time.series/cu/cu.data.1.AllItems",
    codes: ["CUSR0000SA0", "CUUR0000SA0"],
    parse: parseBls,
  },
  "bls-cu-special": {
    url: "https://download.bls.gov/pub/time.series/cu/cu.data.20.USCommoditiesServicesSpecial",
    codes: ["CUSR0000SA0L1E"],
    parse: parseBls,
  },
  "bls-ce-nonfarm": {
    url: "https://download.bls.gov/pub/time.series/ce/ce.data.00a.TotalNonfarm.Employment",
    codes: ["CES0000000001"],
    parse: parseBls,
  },
  "bea-nipa-monthly": {
    url: "https://apps.bea.gov/national/Release/TXT/NipaDataM.txt",
    codes: ["DPCERG", "DPCCRG"],
    parse: parseBea,
  },
};

const FLAT_SERIES: Record<string, { file: keyof typeof FLAT; code: string }> = {
  CPIAUCSL: { file: "bls-cu-allitems", code: "CUSR0000SA0" },
  // 비조정(NSA) — BLS 가 공표하는 헤드라인 12개월 변동률의 기준 (미션 10, FRED CPIAUCNS 와 1,364개월 불일치 0)
  CPIAUCNS: { file: "bls-cu-allitems", code: "CUUR0000SA0" },
  CPILFESL: { file: "bls-cu-special", code: "CUSR0000SA0L1E" },
  PAYEMS: { file: "bls-ce-nonfarm", code: "CES0000000001" },
  PCEPI: { file: "bea-nipa-monthly", code: "DPCERG" },
  PCEPILFE: { file: "bea-nipa-monthly", code: "DPCCRG" },
};

interface FlatCache {
  etag: string | null;
  lastModified: string | null;
  savedAt: string;
  series: Record<string, [string, string][]>;
}

const flatMem = new Map<string, { at: number; p: Promise<Map<string, OriginObs[]>> }>();
const FLAT_MEM_MS = 10 * 60 * 1000;

async function loadFlat(file: string, useStore: boolean): Promise<Map<string, OriginObs[]>> {
  const hit = flatMem.get(file);
  if (hit && Date.now() - hit.at < FLAT_MEM_MS) return hit.p;
  const def = FLAT[file];
  const p = (async () => {
    const key = `site-origin:file:${file}`;
    // @upstash/redis 는 직렬화/역직렬화를 자동 처리한다 (JSON.parse 금지)
    const cached = useStore ? await redis.get<FlatCache>(key) : null;
    const usable = cached && def.codes.every((c) => Array.isArray(cached.series?.[c]) && cached.series[c].length > 0);
    const headers: Record<string, string> = { "User-Agent": SITE_UA };
    if (usable && cached.etag) headers["If-None-Match"] = cached.etag;
    if (usable && cached.lastModified) headers["If-Modified-Since"] = cached.lastModified;
    const fromCache = () => new Map(def.codes.map((c) => [c, cached!.series[c].map(([date, value]) => ({ date, value }))]));
    let res: Response;
    try {
      res = await fetch(def.url, { cache: "no-store", signal: AbortSignal.timeout(40000), headers });
    } catch (err) {
      // 받기 실패(시간 초과 등)면 보관해 둔 값을 쓴다 — BLS 는 클라우드 IP 를 막는 일이 있어, 막혀도 화면이 비지 않게
      // (미션 8 독립 검증 지적 6). 보관값도 없으면 에러를 던진다(조용히 빈 값을 주지 않는다)
      if (usable) {
        console.error(`[site-origin] ${file} 받기 실패 — 보관값(${cached.savedAt}) 사용: ${err}`);
        return fromCache();
      }
      throw err;
    }
    if (res.status === 304 && usable) return fromCache();
    if (!res.ok) {
      if (usable) {
        console.error(`[site-origin] ${file}: ${res.status} — 보관값(${cached.savedAt}) 사용`);
        return fromCache();
      }
      throw new Error(`${file}: ${res.status}`);
    }
    const parsed = def.parse(await res.text(), new Set(def.codes));
    for (const c of def.codes) {
      if (!parsed.get(c)?.length) throw new Error(`${file}: 시리즈 ${c} 없음`);
    }
    if (useStore) {
      const save: FlatCache = {
        etag: res.headers.get("etag"),
        lastModified: res.headers.get("last-modified"),
        savedAt: new Date().toISOString(),
        series: Object.fromEntries([...parsed].map(([c, obs]) => [c, obs.map((o) => [o.date, o.value] as [string, string])])),
      };
      await redis.set(key, save);
    }
    return parsed;
  })();
  flatMem.set(file, { at: Date.now(), p });
  p.catch(() => flatMem.delete(file));
  return p;
}

/* ────────────────────────────────────────────────────────────
 * FRED 모양으로 바꾸기
 * ──────────────────────────────────────────────────────────── */

const GRID: Record<string, Grid> = {
  ...Object.fromEntries(Object.entries(FED_SITE).map(([id, d]) => [id, d.grid])),
  T10Y2Y: "D5",
  CPIAUCSL: "M",
  CPIAUCNS: "M",
  CPILFESL: "M",
  PAYEMS: "M",
  PCEPI: "M",
  PCEPILFE: "M",
  RRPONTSYD: "D5",
  SOFR: "D5",
};

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function* gridDates(grid: Grid, from: string, to: string): Generator<string> {
  if (grid === "M") {
    let y = Number(from.slice(0, 4));
    let m = Number(from.slice(5, 7));
    for (;;) {
      const d = `${y}-${String(m).padStart(2, "0")}-01`;
      if (d > to) return;
      yield d;
      if (++m > 12) {
        m = 1;
        y++;
      }
    }
  }
  const step = grid === "W" ? 7 : 1;
  for (let d = from; d <= to; d = addDays(d, step)) {
    if (grid === "D5") {
      const w = new Date(`${d}T00:00:00Z`).getUTCDay();
      if (w === 0 || w === 6) continue;
    }
    yield d;
  }
}

/** 값이 있는 관측치(오름차순) → FRED 격자 행 (빈 칸은 "."). 격자는 첫 관측일부터 마지막 관측일까지 */
function toGrid(grid: Grid, obs: OriginObs[]): FredLikeObs[] {
  if (obs.length === 0) return [];
  const m = new Map(obs.map((o) => [o.date, o.value]));
  const out: FredLikeObs[] = [];
  for (const d of gridDates(grid, obs[0].date, obs[obs.length - 1].date)) out.push({ date: d, value: m.get(d) ?? "." });
  return out;
}

/** units=pc1 (월 시리즈만): 12개월 전 값 대비 %, 소수 다섯째 자리 반올림 후 끝자리 0 제거 (FRED 출력 문자열과 같은 수) */
function toPc1(rows: FredLikeObs[]): FredLikeObs[] {
  const m = new Map(rows.map((r) => [r.date, r.value]));
  return rows.map((r) => {
    const prev = m.get(`${Number(r.date.slice(0, 4)) - 1}${r.date.slice(4)}`);
    if (r.value === "." || prev === undefined || prev === ".") return { date: r.date, value: "." };
    const pct = (Number(r.value) / Number(prev) - 1) * 100;
    return { date: r.date, value: String(Number(pct.toFixed(5))) };
  });
}

/**
 * 달마다 마지막 유효값 (FRED frequency=m, aggregation_method=eop). FRED 와 대조해 확인한 규칙(결정 로그 20-3):
 *  - 유효값이 하나도 없는 달은 행을 만들지 않는다(FRED 도 그 달 행이 없다 — 예: 역레포 2007-06 ~ 2008-02).
 *  - 아직 끝나지 않은 마지막 달은 "." (FRED 도 진행 중인 달을 "." 로 준다). 끝났는지는 격자의 다음 날짜가
 *    다음 달로 넘어가는지로 본다(예: 평일 시리즈의 마지막 관측이 그달 마지막 평일이면 끝난 달).
 *  - 월 시리즈(M)는 원래 달마다 한 행이라 그대로다.
 */
function toMonthlyEop(rows: FredLikeObs[], grid: Grid): FredLikeObs[] {
  const last = new Map<string, string>();
  const months: string[] = [];
  for (const r of rows) {
    if (r.value === ".") continue;
    const m = `${r.date.slice(0, 7)}-01`;
    if (!last.has(m)) months.push(m);
    last.set(m, r.value);
  }
  const out = months.map((m) => ({ date: m, value: last.get(m)! }));
  if (grid !== "M" && rows.length > 0 && out.length > 0) {
    const lastDate = rows[rows.length - 1].date;
    let next = addDays(lastDate, grid === "W" ? 7 : 1);
    if (grid === "D5") while ([0, 6].includes(new Date(`${next}T00:00:00Z`).getUTCDay())) next = addDays(next, 1);
    const lastMonth = `${lastDate.slice(0, 7)}-01`;
    if (next.slice(0, 7) === lastDate.slice(0, 7) && out[out.length - 1].date === lastMonth) {
      out[out.length - 1] = { date: lastMonth, value: "." };
    }
  }
  return out;
}

export interface SiteObsOptions {
  sortOrder?: "asc" | "desc";
  limit?: number;
  observationStart?: string;
  observationEnd?: string;
  units?: "pc1";
  /** frequency=m&aggregation_method=eop: 달마다 마지막 값(빈 칸 "." 은 건너뜀), 날짜는 달 첫날 */
  frequency?: "m";
  aggregation?: "eop";
  /** Redis 보관을 쓸지 (GitHub Actions 처럼 Redis 가 없는 곳은 false) */
  useStore?: boolean;
}

/** 뉴욕 연은 자료를 받을 시작일 — limit 이 영업일 N 개면 그만큼(여유 포함) 앞에서부터 */
function nyFedStart(opts: SiteObsOptions): string {
  if (opts.observationStart) return opts.observationStart;
  const today = new Date().toISOString().slice(0, 10);
  const n = opts.limit ?? 2600;
  return addDays(today, -Math.ceil((n * 7) / 5) - 30);
}

async function loadValued(id: string, opts: SiteObsOptions): Promise<OriginObs[]> {
  const useStore = opts.useStore ?? true;
  if (id === "T10Y2Y") {
    const [a, b] = await Promise.all([loadFed("DGS10", useStore), loadFed("DGS2", useStore)]);
    return spread(a, b);
  }
  if (FED_SITE[id]) return loadFed(id, useStore);
  if (FLAT_SERIES[id]) {
    const { file, code } = FLAT_SERIES[id];
    return (await loadFlat(file, useStore)).get(code) ?? [];
  }
  // 관측소 cron 의 요청 기록(originFetchLog)에 섞이지 않게 log=false
  if (id === "RRPONTSYD") return fetchNyFedRp("rrp", nyFedStart(opts), false);
  if (id === "SOFR") return fetchSofr(nyFedStart(opts), false);
  throw new Error(`원출처 대응이 없는 시리즈: ${id}`);
}

/**
 * FRED observations API 대신 — 같은 인자, 같은 모양({date, value} 행, 빈 칸은 ".").
 * 원출처에서 받는 시리즈만 부른다(lib/site-source-config.ts 의 isSiteOriginSeries).
 */
export async function siteObservations(id: string, opts: SiteObsOptions = {}): Promise<FredLikeObs[]> {
  const grid = GRID[id];
  if (!grid) throw new Error(`원출처 대응이 없는 시리즈: ${id}`);
  // 보관 시작일(H.15 는 2000년)보다 앞을 요구하면 짧은 기간을 조용히 돌려주지 않고 에러 (미션 8 독립 검증 지적 9)
  const fedDef = FED_SITE[id] ?? (id === "T10Y2Y" ? FED_SITE.DGS10 : undefined);
  const keepFrom = fedDef ? FED_KEEP_FROM[fedDef.rel] : undefined;
  if (keepFrom && opts.observationStart && opts.observationStart < keepFrom) {
    throw new Error(`${id}: 보관 기간(${keepFrom}~)보다 앞(${opts.observationStart})을 요구함`);
  }
  const valued = (await loadValued(id, opts))
    .filter((o) => Number.isFinite(Number(o.value)))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let rows = toGrid(grid, valued);
  if (opts.units === "pc1") rows = toPc1(rows);
  // 월 집계일 때 FRED 는 시작일이 든 달 전체를 포함한다(월 시리즈 M2SL 의 2005-10-01 행이 시작일 2005-10-19 에도 나온다)
  const start = opts.observationStart && opts.frequency === "m" ? `${opts.observationStart.slice(0, 7)}-01` : opts.observationStart;
  if (start) rows = rows.filter((r) => r.date >= start);
  if (opts.observationEnd) rows = rows.filter((r) => r.date <= opts.observationEnd!);
  if (opts.frequency === "m") rows = toMonthlyEop(rows, grid);
  if (opts.sortOrder === "desc") rows.reverse();
  if (opts.limit !== undefined) {
    // 보관 기간이 짧아(H.15 는 2000년부터) 요청한 개수를 못 채우면 조용히 짧게 주지 않고 에러를 낸다
    const fed = FED_SITE[id] ?? (id === "T10Y2Y" ? FED_SITE.DGS10 : undefined);
    if (rows.length < opts.limit && fed && FED_KEEP_FROM[fed.rel]) {
      throw new Error(`${id}: 보관 기간(${FED_KEEP_FROM[fed.rel]}~)으로 ${opts.limit}개를 채우지 못함`);
    }
    rows = rows.slice(0, opts.limit);
  }
  return rows;
}

/** 화면 출처 표기 (원출처 기준) */
export const SITE_SOURCE_LABEL: Record<string, string> = {
  WALCL: "연준 이사회 H.4.1",
  WTREGEN: "연준 이사회 H.4.1",
  DGS2: "연준 이사회 H.15",
  DFII10: "연준 이사회 H.15",
  DGS10: "연준 이사회 H.15",
  DFF: "연준 이사회 H.15",
  T10Y2Y: "연준 이사회 H.15(10년물−2년물 계산)",
  M2SL: "연준 이사회 H.6",
  CPIAUCSL: "미국 노동통계국(BLS)",
  CPIAUCNS: "미국 노동통계국(BLS)",
  CPILFESL: "미국 노동통계국(BLS)",
  PAYEMS: "미국 노동통계국(BLS)",
  PCEPI: "미국 경제분석국(BEA)",
  PCEPILFE: "미국 경제분석국(BEA)",
  RRPONTSYD: "뉴욕 연방준비은행",
  SOFR: "뉴욕 연방준비은행",
};
