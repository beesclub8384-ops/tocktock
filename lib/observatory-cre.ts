/**
 * 관측소 2 — 은행: CRE(상업용 부동산) 익스포저 수집 및 저장
 *
 * 세 갈래를 모은다. 출처가 둘이라 Redis 키도 둘이다.
 *
 *  FRED (observatory:cre-delinquency)
 *    DRCRELEXFT100S  CRE 연체율, 상위 100대 은행 (분기, %, 계절조정)
 *    DRCRELEXFOBS    CRE 연체율, 100대 밖 은행
 *    DRCRELEXFACBS   CRE 연체율, 전체 상업은행
 *    셋 다 SA 로 맞췄다. 한쪽만 원계열이면 격차가 조정치 때문에 흔들린다.
 *
 *  FDIC QBP 워크북 (observatory:cre-concentration)
 *    Loan Performance 시트 — 임대용/자가사용 비주거 CRE 연체율
 *    Ratios by Asset Size Groups 시트 — 자산 규모별 CRE 집중도
 *
 * ⚠ 워크북은 채권 미실현손실·예금 유출과 **같은 파일**이다. cron 이
 *   fetchLatestWorkbook 으로 한 번만 받아 셋에 나눠 준다.
 *
 * ⚠ 오피스만 뗀 공개 통계는 없다 (콜리포트가 물건 유형으로 안 나눈다).
 *   비주거 상업용을 자가사용 / 임대용으로 가른 분류를 쓰고, 임대용을
 *   투자 목적 CRE 의 대용치로 삼는다. 화면에도 그렇게 적는다.
 */
import * as XLSX from "xlsx";
import { redis } from "@/lib/redis";
import { isOriginSource } from "@/lib/observatory-source-config";
import { fetchOriginObservations } from "@/lib/observatory-origin";
import {
  expectedLatestQuarter,
  fetchLatestWorkbook,
  quarterOrder,
  type WorkbookProvider,
} from "@/lib/observatory-banks";
import type {
  CreConcentrationPoint,
  CreDelinquencyPoint,
  CreSizeSplitPoint,
} from "@/lib/observatory-constants";

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

export const CRE_DELINQ_KEY = "observatory:cre-delinquency";
export const CRE_CONCENTRATION_KEY = "observatory:cre-concentration";

export const CRE_SERIES_TOP100 = "DRCRELEXFT100S";
export const CRE_SERIES_OTHER = "DRCRELEXFOBS";
export const CRE_SERIES_ALL = "DRCRELEXFACBS";

/** FRED 연체율 시리즈 시작일 */
export const CRE_FRED_START = "1991-01-01";

/**
 * 워크북 라벨.
 *
 * ⚠ 완전일치로 찾는다. Loan Performance 시트에는 "…Nonfarm Nonresidential
 *   Properties" 로 끝나는 라벨이 셋(전체 / 자가사용 / 임대용) 나란히 있어,
 *   부분일치면 행 순서에 따라 엉뚱한 쪽을 집는다. 값이 그럴듯해서
 *   눈치채기 어렵다.
 */
const LABEL_INVESTOR_CRE =
  "real estate loans secured by other nonfarm nonresidential properties";
const LABEL_OWNER_CRE =
  "real estate loans secured by owner-occupied nonfarm nonresidential properties";
const LABEL_NONCURRENT_RATE = "noncurrent rate";
const LABEL_SIZE_BLOCK = "commercial real estate loans as a % of total assets";
const LABEL_SIZE_HEADER = "asset size group";

interface FredObs {
  date: string;
  value: string;
}

/* ────────────────────────────────────────────────────────────
 * 공통
 * ──────────────────────────────────────────────────────────── */

/** FRED 분기 관측일(분기 시작월 1일) → "2026Q2" */
function toQuarter(date: string): string | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(date);
  if (!m) return null;
  return `${m[1]}Q${Math.floor((Number(m[2]) - 1) / 3) + 1}`;
}

/** 분기 단위 일련번호 (인접 판정용) */
function quarterIndex(quarter: string): number {
  const m = /^(\d{4})Q([1-4])$/.exec(quarter);
  return m ? Number(m[1]) * 4 + (Number(m[2]) - 1) : Number.NaN;
}

/* ────────────────────────────────────────────────────────────
 * FRED 파트 — 규모별 연체율
 * ──────────────────────────────────────────────────────────── */

export async function loadCreSizeSplit(): Promise<CreSizeSplitPoint[]> {
  // @upstash/redis 는 직렬화/역직렬화를 자동 처리한다 (JSON.parse 금지)
  const stored = await redis.get<CreSizeSplitPoint[]>(CRE_DELINQ_KEY);
  return Array.isArray(stored) ? stored : [];
}

async function fetchSeries(seriesId: string, apiKey: string): Promise<FredObs[]> {
  const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${CRE_FRED_START}`;
  // 원출처 전환 (lib/observatory-source-config.ts) — FRED 경로는 되돌릴 수 있게 그대로 둔다
  let json: { observations?: FredObs[] };
  if (isOriginSource(seriesId)) {
    json = { observations: await fetchOriginObservations(seriesId, CRE_FRED_START) };
  } else {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`FRED ${seriesId}: ${res.status}`);
    json = (await res.json()) as { observations?: FredObs[] };
  }
  return json.observations ?? [];
}

/**
 * 세 시리즈를 분기로 맞춰 합친다.
 *
 * ⚠ 결측(".")은 **건너뛴다. 0 으로 넣지 않는다.**
 *   연체율에서 0% 는 "완전히 건전하다" 는 강한 주장이다. 값이 없는 것을
 *   0 으로 채우면 없던 호황을 만들어 내고, 격차도 통째로 뒤집힌다.
 *   (SRF 의 "."은 "운영 없음 = 사용액 0" 이라 0 이 맞았던 것이고,
 *    이 지표는 성격이 다르다)
 *   실측상 세 시리즈 모두 1991Q1 이후 결측 0건이라 실제로 걸릴 일은
 *   드물지만, 한쪽만 비는 분기가 생기면 그 항목만 null 로 두고 격차는
 *   내지 않는다.
 */
export function buildSizeSplit(
  top100: FredObs[],
  other: FredObs[],
  all: FredObs[]
): CreSizeSplitPoint[] {
  const pick = (obs: FredObs[]) => {
    const m = new Map<string, number>();
    for (const o of obs) {
      if (!o.date || o.value === "." || o.value === "") continue;
      const q = toQuarter(o.date);
      const v = parseFloat(o.value);
      if (q && Number.isFinite(v)) m.set(q, v);
    }
    return m;
  };

  const t = pick(top100);
  const o = pick(other);
  const a = pick(all);

  const quarters = Array.from(
    new Set([...t.keys(), ...o.keys(), ...a.keys()])
  ).sort((x, y) => quarterIndex(x) - quarterIndex(y));

  return quarters.map((q) => {
    const top100Pct = t.get(q) ?? null;
    const otherPct = o.get(q) ?? null;
    return {
      quarter: q,
      top100Pct,
      otherPct,
      allBanksPct: a.get(q) ?? null,
      gapPp:
        top100Pct !== null && otherPct !== null ? top100Pct - otherPct : null,
    };
  });
}

export interface CreSizeSplitResult {
  backfill: boolean;
  total: number;
  added: number;
  latestQuarter: string | null;
  latestTop100Pct: number | null;
  latestOtherPct: number | null;
  latestGapPp: number | null;
}

/** FRED 에서 규모별 CRE 연체율을 받아 Redis 에 저장한다 */
export async function collectCreSizeSplit(): Promise<CreSizeSplitResult> {
  const existing = await loadCreSizeSplit();
  const backfill = existing.length === 0;

  // FRED 키는 FRED 경로를 쓸 때만 필요하다 (원출처 전환 — lib/observatory-source-config.ts)
  const apiKey = process.env.FRED_API_KEY ?? "";
  if (!apiKey && !["DRCRELEXFT100S", "DRCRELEXFOBS", "DRCRELEXFACBS"].every(isOriginSource)) throw new Error("FRED_API_KEY not set");

  const [top100, other, all] = await Promise.all([
    fetchSeries(CRE_SERIES_TOP100, apiKey),
    fetchSeries(CRE_SERIES_OTHER, apiKey),
    fetchSeries(CRE_SERIES_ALL, apiKey),
  ]);

  const series = buildSizeSplit(top100, other, all);

  // 수집 결과가 비면 기존 데이터를 지우지 않는다 (FRED 일시 장애 대비)
  if (series.length === 0) {
    return {
      backfill,
      total: existing.length,
      added: 0,
      latestQuarter: null,
      latestTop100Pct: null,
      latestOtherPct: null,
      latestGapPp: null,
    };
  }

  await redis.set(CRE_DELINQ_KEY, series);

  const latest = series[series.length - 1];
  return {
    backfill,
    total: series.length,
    added: series.length - existing.length,
    latestQuarter: latest.quarter,
    latestTop100Pct: latest.top100Pct,
    latestOtherPct: latest.otherPct,
    latestGapPp: latest.gapPp,
  };
}

/* ────────────────────────────────────────────────────────────
 * 워크북 파트 — 임대용 연체율 + 규모별 집중도
 * ──────────────────────────────────────────────────────────── */

export interface CreConcentrationStore {
  /** 임대용/자가사용 비주거 CRE 연체율 */
  delinquency: CreDelinquencyPoint[];
  /** 자산 규모별 CRE 집중도 */
  concentration: CreConcentrationPoint[];
  /** 규모 구간 라벨 (화면이 순서대로 그리는 데 쓴다) */
  buckets: string[];
}

export async function loadCreConcentration(): Promise<CreConcentrationStore> {
  const stored = await redis.get<CreConcentrationStore>(CRE_CONCENTRATION_KEY);
  if (stored && Array.isArray(stored.concentration)) return stored;
  return { delinquency: [], concentration: [], buckets: [] };
}

function cellNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

/** 라벨이 완전일치하는 행의 인덱스. 못 찾으면 -1 */
function findRowIndex(grid: unknown[][], label: string): number {
  return grid.findIndex((r) =>
    r.some((c) => typeof c === "string" && c.trim().toLowerCase() === label)
  );
}

/** 분기 헤더가 들어 있는 행 (같은 시트라도 블록마다 다를 수 있다) */
function findQuarterColumns(row: unknown[]): { col: number; quarter: string }[] {
  const out: { col: number; quarter: string }[] = [];
  for (let col = 0; col < row.length; col++) {
    const v = row[col];
    if (typeof v !== "string") continue;
    const m = /^(\d{4})Q([1-4])$/.exec(v.trim());
    if (m) out.push({ col, quarter: `${Number(m[1])}Q${Number(m[2])}` });
  }
  return out;
}

/**
 * Loan Performance 시트에서 비주거 CRE 연체율을 뽑는다.
 *
 * 각 대출 카테고리는 제목 행 아래에 "Noncurrent rate" 등 지표 행이 붙는
 * 블록 구조다. 제목 행을 찾고 그 아래에서 가장 가까운 "Noncurrent rate" 를
 * 집는다. 행 번호를 박지 않는 이유는 FDIC 가 항목을 끼워 넣으면 전부
 * 밀리기 때문이다.
 *
 * ⚠ 원본은 비율(0.0142)이라 100을 곱해 %로 만든다.
 */
function parseCreDelinquency(grid: unknown[][]): CreDelinquencyPoint[] {
  const headerRow = grid.find((r) => findQuarterColumns(r).length > 4);
  if (!headerRow) {
    throw new Error("FDIC 워크북에서 분기 헤더 행을 찾지 못했습니다 (양식 변경?)");
  }
  const cols = findQuarterColumns(headerRow);

  const rateRowAfter = (titleLabel: string): unknown[] | null => {
    const start = findRowIndex(grid, titleLabel);
    if (start === -1) return null;
    for (let i = start + 1; i < Math.min(start + 16, grid.length); i++) {
      const r = grid[i];
      if (
        r.some(
          (c) =>
            typeof c === "string" &&
            c.trim().toLowerCase() === LABEL_NONCURRENT_RATE
        )
      ) {
        return r;
      }
    }
    return null;
  };

  const investorRow = rateRowAfter(LABEL_INVESTOR_CRE);
  if (!investorRow) {
    throw new Error(
      `FDIC 워크북에서 임대용 비주거 CRE 연체율 행을 찾지 못했습니다 (양식 변경?)`
    );
  }
  // 자가사용은 대조용이라 없으면 null 로 둔다 (본 판정에는 안 쓴다)
  const ownerRow = rateRowAfter(LABEL_OWNER_CRE);

  const base: { quarter: string; investor: number; owner: number | null }[] = [];
  for (const { col, quarter } of cols) {
    const inv = cellNum(investorRow[col]);
    if (inv === null) continue;
    const own = ownerRow ? cellNum(ownerRow[col]) : null;
    base.push({
      quarter,
      investor: inv * 100,
      owner: own === null ? null : own * 100,
    });
  }
  base.sort((a, b) => quarterIndex(a.quarter) - quarterIndex(b.quarter));

  return base.map((p, i) => {
    // 정확히 4분기 전이 있을 때만 전년 대비를 낸다
    const prior = i >= 4 ? base[i - 4] : null;
    const adjacent =
      prior !== null &&
      quarterIndex(p.quarter) - quarterIndex(prior.quarter) === 4;
    return {
      quarter: p.quarter,
      investorNoncurrentPct: p.investor,
      ownerOccupiedNoncurrentPct: p.owner,
      yoyChangePp: adjacent ? p.investor - prior.investor : null,
    };
  });
}

/**
 * Ratios by Asset Size Groups 시트에서 규모별 CRE 집중도를 뽑는다.
 *
 * ⚠ 이 시트는 블록마다 **자체 헤더 행**을 갖는다. 시트 맨 위 헤더를 쓰면
 *   열이 어긋난다. CRE 블록 제목을 찾고, 그 아래 "Asset Size Group" 행을
 *   그 블록의 헤더로 삼는다.
 */
function parseCreConcentration(grid: unknown[][]): {
  points: CreConcentrationPoint[];
  buckets: string[];
} {
  const titleIdx = findRowIndex(grid, LABEL_SIZE_BLOCK);
  if (titleIdx === -1) {
    throw new Error(
      "FDIC 워크북에서 규모별 CRE 집중도 블록을 찾지 못했습니다 (양식 변경?)"
    );
  }

  let headerIdx = -1;
  for (let i = titleIdx + 1; i < Math.min(titleIdx + 6, grid.length); i++) {
    if (
      grid[i].some(
        (c) =>
          typeof c === "string" && c.trim().toLowerCase() === LABEL_SIZE_HEADER
      )
    ) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error(
      "FDIC 워크북 CRE 집중도 블록에서 헤더 행을 찾지 못했습니다 (양식 변경?)"
    );
  }

  const cols = findQuarterColumns(grid[headerIdx]);
  const buckets: string[] = [];
  const byQuarter = new Map<string, Record<string, number>>();

  // 헤더 다음 행부터 빈 행을 만날 때까지가 한 블록이다
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const row = grid[i];
    const label = row[1];
    if (typeof label !== "string" || !label.trim()) break;
    const name = label.trim();
    buckets.push(name);
    for (const { col, quarter } of cols) {
      const v = cellNum(row[col]);
      if (v === null) continue;
      const rec = byQuarter.get(quarter) ?? {};
      rec[name] = v;
      byQuarter.set(quarter, rec);
    }
  }

  const points = Array.from(byQuarter.entries())
    .map(([quarter, byBucket]) => ({ quarter, byBucket }))
    .sort((a, b) => quarterIndex(a.quarter) - quarterIndex(b.quarter));

  return { points, buckets };
}

/** 워크북 바이트에서 두 갈래를 한 번에 뽑는다 */
export function parseCreWorkbook(buf: ArrayBuffer): CreConcentrationStore {
  const wb = XLSX.read(buf, { type: "array" });

  const perfSheet = wb.Sheets["Loan Performance"];
  if (!perfSheet) {
    throw new Error("FDIC 워크북에 'Loan Performance' 시트가 없습니다 (양식 변경?)");
  }
  const ratioSheet = wb.Sheets["Ratios by Asset Size Groups"];
  if (!ratioSheet) {
    throw new Error(
      "FDIC 워크북에 'Ratios by Asset Size Groups' 시트가 없습니다 (양식 변경?)"
    );
  }

  const perfGrid = XLSX.utils.sheet_to_json<unknown[]>(perfSheet, {
    header: 1,
    blankrows: true,
  });
  const ratioGrid = XLSX.utils.sheet_to_json<unknown[]>(ratioSheet, {
    header: 1,
    blankrows: true,
  });

  const delinquency = parseCreDelinquency(perfGrid);
  const { points, buckets } = parseCreConcentration(ratioGrid);

  return { delinquency, concentration: points, buckets };
}

export interface CreConcentrationResult {
  /** HTTP 를 아예 걸지 않고 건너뛰었는지 */
  skipped: boolean;
  reason?: string;
  sourceUrl?: string;
  delinquencyTotal: number;
  concentrationTotal: number;
  latestQuarter: string | null;
  latestInvestorPct: number | null;
  latestRegionalConcentrationPct: number | null;
}

/**
 * FDIC 워크북에서 임대용 CRE 연체율과 규모별 집중도를 받아 저장한다.
 *
 * 분기 데이터라 저장된 분기가 "나와 있어야 할 분기" 에 도달했으면 받지
 * 않는다. 워크북을 이미 받아 둔 쪽(cron)은 getWorkbook 으로 넘겨 준다.
 */
export async function collectCreConcentration(
  force = false,
  getWorkbook: WorkbookProvider = fetchLatestWorkbook
): Promise<CreConcentrationResult> {
  const existing = await loadCreConcentration();
  const storedLatest =
    existing.concentration.length > 0
      ? existing.concentration[existing.concentration.length - 1].quarter
      : null;
  const expected = expectedLatestQuarter();

  if (
    !force &&
    storedLatest !== null &&
    quarterOrder(storedLatest) >= quarterOrder(expected)
  ) {
    const lastDelinq =
      existing.delinquency.length > 0
        ? existing.delinquency[existing.delinquency.length - 1]
        : null;
    const lastConc =
      existing.concentration[existing.concentration.length - 1];
    return {
      skipped: true,
      reason: `저장된 ${storedLatest} 가 예상 최신 분기 ${expected} 이상 — 내려받지 않음`,
      delinquencyTotal: existing.delinquency.length,
      concentrationTotal: existing.concentration.length,
      latestQuarter: storedLatest,
      latestInvestorPct: lastDelinq?.investorNoncurrentPct ?? null,
      latestRegionalConcentrationPct:
        lastConc.byBucket["Assets $1 Billion - $10 Billion"] ?? null,
    };
  }

  const { buf, sourceUrl } = await getWorkbook();
  const store = parseCreWorkbook(buf);

  // 파싱 결과가 비면 기존 데이터를 지우지 않는다.
  // 지난 분기 파일 URL 은 전부 404 라 한 번 날리면 되받을 곳이 없다.
  if (store.concentration.length === 0 || store.delinquency.length === 0) {
    throw new Error("FDIC 워크북 CRE 파싱 결과가 비었습니다 — 기존 데이터 유지");
  }

  await redis.set(CRE_CONCENTRATION_KEY, store);

  const lastDelinq = store.delinquency[store.delinquency.length - 1];
  const lastConc = store.concentration[store.concentration.length - 1];
  return {
    skipped: false,
    sourceUrl,
    delinquencyTotal: store.delinquency.length,
    concentrationTotal: store.concentration.length,
    latestQuarter: lastConc.quarter,
    latestInvestorPct: lastDelinq.investorNoncurrentPct,
    latestRegionalConcentrationPct:
      lastConc.byBucket["Assets $1 Billion - $10 Billion"] ?? null,
  };
}
