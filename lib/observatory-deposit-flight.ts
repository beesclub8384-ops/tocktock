/**
 * 관측소 2 — 은행: 예금 유출 수집 및 저장
 *
 * 두 파트가 출처도 주기도 다르다. Redis 키도 따로 둔다.
 *
 *  주간 — FRED (매주 수요일 기준)
 *    DPSSCBW027NBOG  소형 국내 상업은행 예금 (십억 달러, 계절조정 없음)
 *    DPSLCBW027NBOG  대형 국내 상업은행 예금 (십억 달러, 계절조정 없음)
 *    둘 다 NSA(계절조정 없음)로 맞췄다. 한쪽만 조정된 값을 쓰면 비중이
 *    조정치 때문에 흔들려 실제 자금 이동과 구분되지 않는다.
 *
 *  분기 — FDIC QBP 워크북 (채권 미실현손실과 같은 파일)
 *    Domestic office deposits / Estimated insured deposits
 *
 * ⚠ 워크북 내려받기는 lib/observatory-banks.ts 의 findLatestWorkbookUrl 을
 *   그대로 쓴다. 파싱 규칙(라벨로 찾기, 백만→십억)도 같은 방식이지만,
 *   공통 모듈로 묶지 않고 필요한 만큼만 가져다 쓴다 — 두 지표가 서로 다른
 *   행을 보고 앞으로도 따로 움직일 여지가 크기 때문이다.
 */
import * as XLSX from "xlsx";
import { redis } from "@/lib/redis";
import {
  expectedLatestQuarter,
  fetchLatestWorkbook,
  quarterOrder,
  type WorkbookProvider,
} from "@/lib/observatory-banks";
import type {
  DepositFlightQuarterlyPoint,
  DepositFlightWeeklyPoint,
} from "@/lib/observatory-constants";

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

export const DF_WEEKLY_KEY = "observatory:deposit-flight-weekly";
export const DF_QUARTERLY_KEY = "observatory:deposit-flight-quarterly";

/** 소형 국내 상업은행 예금 */
export const DF_SMALL_SERIES_ID = "DPSSCBW027NBOG";

/** 대형 국내 상업은행 예금 */
export const DF_LARGE_SERIES_ID = "DPSLCBW027NBOG";

/**
 * 주간 수집 시작일.
 *
 * 소형 시리즈는 1973년부터 있지만 대형이 1985-04-03 부터라, 비중을 낼 수
 * 있는 첫 주가 여기다. 2023년 3월 SVB 구간은 당연히 포함된다.
 */
export const DF_WEEKLY_START = "1985-04-03";

/**
 * 분기 무보험 비중에 정의 변경으로 인한 단절이 있는 구간.
 *
 * ⚠ 1984Q1 은 71%, 2010Q4 는 −10%p, 2013Q1 은 +14.8%p 처럼 실제 자금
 *   이동으로 설명되지 않는 점프가 있다. 예금보험 한도 인상(10만→25만 달러)과
 *   TAG(무이자 거래계좌 전액 보증, 2008~2012) 개시·종료 때문이다.
 *   판정은 최신 분기 값만 보므로 영향이 없지만, 차트는 기본적으로 이 이후만
 *   보여준다.
 */
export const DF_QUARTERLY_COMPARABLE_FROM = "2013Q2";

/** 워크북에서 찾을 행 라벨 (완전일치로 찾는다) */
const LABEL_DOMESTIC_DEPOSITS = "domestic office deposits";
const LABEL_INSURED_DEPOSITS = "estimated insured deposits";

interface FredObs {
  date: string;
  value: string;
}

/* ────────────────────────────────────────────────────────────
 * 주간 파트
 * ──────────────────────────────────────────────────────────── */

/** Redis 에 저장된 주간 시계열 (날짜 오름차순). 없으면 빈 배열 */
export async function loadDepositFlightWeekly(): Promise<DepositFlightWeeklyPoint[]> {
  // @upstash/redis 는 직렬화/역직렬화를 자동 처리한다 (JSON.parse 금지)
  const stored = await redis.get<DepositFlightWeeklyPoint[]>(DF_WEEKLY_KEY);
  return Array.isArray(stored) ? stored : [];
}

async function fetchSeries(seriesId: string, apiKey: string): Promise<FredObs[]> {
  const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${DF_WEEKLY_START}`;
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`FRED ${seriesId}: ${res.status}`);
  const json = (await res.json()) as { observations?: FredObs[] };
  return json.observations ?? [];
}

/** 주 단위 일련번호 (인접 주 판정용). 1970-01-01 기준 주 수 */
function weekIndex(date: string): number {
  const t = Date.parse(`${date}T00:00:00Z`);
  return Math.round(t / (7 * 24 * 60 * 60 * 1000));
}

/**
 * 두 시리즈를 날짜로 맞춰 비중 시계열을 만든다.
 *
 * ⚠ 결측(".")은 **건너뛴다. 0 으로 넣지 않는다.**
 *   SRF 는 "."이 "그날 운영 없음 = 사용액 0" 이라 0 이 맞았지만, 예금은
 *   **잔액**이라 "."은 "값이 없다" 는 뜻이다. 0 으로 채우면 비중이 0% 나
 *   100% 로 튀어 가짜 경보가 켜진다.
 *   한쪽만 있는 날짜도 비중을 낼 수 없으므로 함께 버린다.
 */
export function buildWeeklySeries(
  smallObs: FredObs[],
  largeObs: FredObs[]
): DepositFlightWeeklyPoint[] {
  const smallMap = new Map<string, number>();
  for (const o of smallObs) {
    if (!o.date || o.value === "." || o.value === "") continue;
    const v = parseFloat(o.value);
    if (Number.isFinite(v)) smallMap.set(o.date, v);
  }

  const paired: { date: string; small: number; large: number }[] = [];
  for (const o of largeObs) {
    if (!o.date || o.value === "." || o.value === "") continue;
    const large = parseFloat(o.value);
    if (!Number.isFinite(large)) continue;
    const small = smallMap.get(o.date);
    if (small === undefined) continue;
    if (small + large <= 0) continue;
    paired.push({ date: o.date, small, large });
  }

  paired.sort((a, b) => a.date.localeCompare(b.date));

  return paired.map((p, i) => {
    const share = (p.small / (p.small + p.large)) * 100;
    const prev = i > 0 ? paired[i - 1] : null;
    const adjacent =
      prev !== null && weekIndex(p.date) - weekIndex(prev.date) === 1;
    const prevShare = prev ? (prev.small / (prev.small + prev.large)) * 100 : 0;

    return {
      date: p.date,
      smallBillions: p.small,
      largeBillions: p.large,
      smallSharePct: share,
      weeklyChangePp: adjacent ? share - prevShare : null,
    };
  });
}

export interface DepositFlightWeeklyResult {
  backfill: boolean;
  total: number;
  added: number;
  latestDate: string | null;
  latestSharePct: number | null;
  latestChangePp: number | null;
}

/**
 * FRED 에서 소형·대형 은행 예금을 받아 비중 시계열을 Redis 에 저장한다.
 *
 * 주간 시리즈 2개를 합쳐도 2,100여 건이라 가볍다. 증분 병합으로 얻을 게
 * 없고 오히려 인접 주 판정이 꼬일 수 있어, 매번 전체를 받아 다시 만든다.
 */
export async function collectDepositFlightWeekly(): Promise<DepositFlightWeeklyResult> {
  const existing = await loadDepositFlightWeekly();
  const backfill = existing.length === 0;

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error("FRED_API_KEY not set");

  const [smallObs, largeObs] = await Promise.all([
    fetchSeries(DF_SMALL_SERIES_ID, apiKey),
    fetchSeries(DF_LARGE_SERIES_ID, apiKey),
  ]);

  const series = buildWeeklySeries(smallObs, largeObs);

  // 수집 결과가 비면 기존 데이터를 지우지 않는다 (FRED 일시 장애 대비)
  if (series.length === 0) {
    return {
      backfill,
      total: existing.length,
      added: 0,
      latestDate: null,
      latestSharePct: null,
      latestChangePp: null,
    };
  }

  await redis.set(DF_WEEKLY_KEY, series);

  const latest = series[series.length - 1];
  return {
    backfill,
    total: series.length,
    added: series.length - existing.length,
    latestDate: latest.date,
    latestSharePct: latest.smallSharePct,
    latestChangePp: latest.weeklyChangePp,
  };
}

/* ────────────────────────────────────────────────────────────
 * 분기 파트
 * ──────────────────────────────────────────────────────────── */

/** Redis 에 저장된 분기 시계열 (분기 오름차순). 없으면 빈 배열 */
export async function loadDepositFlightQuarterly(): Promise<
  DepositFlightQuarterlyPoint[]
> {
  const stored = await redis.get<DepositFlightQuarterlyPoint[]>(DF_QUARTERLY_KEY);
  return Array.isArray(stored) ? stored : [];
}

/** 셀이 숫자면 숫자, "N/A" 같은 값이면 null */
function cellNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

/**
 * 라벨이 **완전일치**하는 행을 찾는다. 못 찾으면 던진다.
 *
 * ⚠ 부분일치(includes)를 쓰면 안 된다. 이 시트에는 "Deposits",
 *   "Foreign office deposits", "Domestic office deposits",
 *   "Time deposits", "Brokered deposits" 가 나란히 있어 부분일치는
 *   행 순서에 따라 엉뚱한 쪽을 집는다 — 값이 그럴듯해서 눈치채기 어렵다.
 */
function findRow(grid: unknown[][], label: string): unknown[] {
  const row = grid.find((r) =>
    r.some((c) => typeof c === "string" && c.trim().toLowerCase() === label)
  );
  if (!row) {
    throw new Error(`FDIC 워크북에서 행을 찾지 못했습니다: "${label}" (양식 변경?)`);
  }
  return row;
}

/**
 * QBP 워크북에서 무보험 예금 비중 시계열을 뽑는다.
 *
 * ⚠ 분모는 **Domestic office deposits** 다. 총예금(Deposits)이 아니다.
 *   예금보험은 국내 사무소 예금만 다루고 해외 사무소 예금은 애초에 보험
 *   대상이 아니라, 총예금으로 나누면 "보험 밖 돈" 에 해외 예금까지 섞여
 *   비중이 부풀려진다. 실측으로도 2022Q4 기준
 *     국내 기준 = 7,493십억 (42.3%)  ← FDIC 공표 "약 7.7조, 국내 예금의 43%" 와 일치
 *     총액 기준 = 8,982십억 (46.7%)  ← 공표치와 어긋남
 *   이라 국내 기준이 맞다.
 *
 * ⚠ 원본 단위는 백만 달러라 여기서 한 번만 십억으로 나눈다 (/1000).
 */
export function parseQuarterlyWorkbook(
  buf: ArrayBuffer
): DepositFlightQuarterlyPoint[] {
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets["Balance Sheet"];
  if (!sheet) {
    throw new Error("FDIC 워크북에 'Balance Sheet' 시트가 없습니다 (양식 변경?)");
  }

  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: true,
  });

  const headerRow = grid.find(
    (r) =>
      r.filter((c) => typeof c === "string" && /^\d{4}Q[1-4]$/.test(c.trim()))
        .length > 4
  );
  if (!headerRow) {
    throw new Error("FDIC 워크북에서 분기 헤더 행을 찾지 못했습니다 (양식 변경?)");
  }

  const domesticRow = findRow(grid, LABEL_DOMESTIC_DEPOSITS);
  const insuredRow = findRow(grid, LABEL_INSURED_DEPOSITS);

  const series: DepositFlightQuarterlyPoint[] = [];

  for (let col = 0; col < headerRow.length; col++) {
    const head = headerRow[col];
    if (typeof head !== "string") continue;
    const m = /^(\d{4})Q([1-4])$/.exec(head.trim());
    if (!m) continue;

    const domesticM = cellNum(domesticRow[col]);
    const insuredM = cellNum(insuredRow[col]);
    if (domesticM === null || insuredM === null || domesticM <= 0) continue;

    // 백만 달러 → 십억 달러
    const domesticDepositsBillions = domesticM / 1000;
    const insuredDepositsBillions = insuredM / 1000;

    series.push({
      quarter: `${Number(m[1])}Q${Number(m[2])}`,
      domesticDepositsBillions,
      insuredDepositsBillions,
      uninsuredSharePct: (1 - insuredM / domesticM) * 100,
    });
  }

  series.sort((a, b) => a.quarter.localeCompare(b.quarter));
  return series;
}

export interface DepositFlightQuarterlyResult {
  /** HTTP 를 아예 걸지 않고 건너뛰었는지 */
  skipped: boolean;
  /** 건너뛴 이유 (skipped 일 때만) */
  reason?: string;
  sourceUrl?: string;
  total: number;
  latestQuarter: string | null;
  latestUninsuredSharePct: number | null;
}

/**
 * FDIC 워크북에서 무보험 예금 비중을 받아 Redis 에 저장한다.
 *
 * ⚠ 채권 미실현손실(observatory-banks)과 **같은 2.6MB 파일**을 본다.
 *   그쪽과 똑같이, 저장된 분기가 "나와 있어야 할 분기" 에 이미 도달했으면
 *   HTTP 요청 없이 끝낸다. 이 가드가 없으면 분기에 한 번 바뀌는 값 때문에
 *   매일 2.6MB 를 두 번씩 받게 된다.
 *   분기 판단 함수는 observatory-banks 것을 그대로 가져다 쓴다.
 *
 * @param force 분기 판단을 무시하고 무조건 받아온다 (수동 점검용)
 */
export async function collectDepositFlightQuarterly(
  force = false,
  getWorkbook: WorkbookProvider = fetchLatestWorkbook
): Promise<DepositFlightQuarterlyResult> {
  const existing = await loadDepositFlightQuarterly();
  const storedPoint =
    existing.length > 0 ? existing[existing.length - 1] : null;
  const storedLatest = storedPoint?.quarter ?? null;
  const expected = expectedLatestQuarter();

  if (
    !force &&
    storedLatest !== null &&
    quarterOrder(storedLatest) >= quarterOrder(expected)
  ) {
    return {
      skipped: true,
      reason: `저장된 ${storedLatest} 가 예상 최신 분기 ${expected} 이상 — 내려받지 않음`,
      total: existing.length,
      latestQuarter: storedLatest,
      latestUninsuredSharePct: storedPoint?.uninsuredSharePct ?? null,
    };
  }

  const { buf, sourceUrl } = await getWorkbook();
  const series = parseQuarterlyWorkbook(buf);

  // 파싱 결과가 비면 기존 데이터를 지우지 않는다.
  // 지난 분기 파일 URL 은 전부 404 라 한 번 날리면 되받을 곳이 없다.
  if (series.length === 0) {
    throw new Error("FDIC 워크북 파싱 결과가 비었습니다 — 기존 데이터 유지");
  }

  await redis.set(DF_QUARTERLY_KEY, series);

  const latest = series[series.length - 1];
  return {
    skipped: false,
    sourceUrl,
    total: series.length,
    latestQuarter: latest.quarter,
    latestUninsuredSharePct: latest.uninsuredSharePct,
  };
}
