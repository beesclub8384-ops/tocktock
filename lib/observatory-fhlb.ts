/**
 * 관측소 2 — 은행: FHLB(연방주택대출은행) 차입 잔액 수집 및 저장
 *
 * 출처는 FRED 하나만 사용한다.
 *  - BOGZ1FL403069330Q: Government-Sponsored Enterprises; FHLB Advances;
 *    Asset, Level (백만 달러, 분기 말 기준)
 *
 * GSE 의 **자산** 쪽 시리즈를 쓴다. FHLB 가 빌려준 돈의 총액이라, 은행뿐
 * 아니라 보험사·신용조합까지 포함한 시스템 전체의 차입을 한 숫자로 본다.
 * (은행만 보려면 BOGZ1FL763169330Q 가 있지만, 이 관측소는 "누가 목말라졌나"
 *  를 넓게 보는 자리라 총액 쪽이 맞다)
 *
 * 실측으로 확인한 사실 (2026-09-15):
 *  - 월간·주간 FHLB 차입 시리즈는 FRED 에 **없다**. 검색에 걸리는 월/주
 *    시리즈는 전부 Revolving Home Equity Loans(RHE…) 로, 이름만 겹치는
 *    무관한 지표다. 그래서 분기로 확정했다.
 *  - 관측치 323건 중 결측(".") 18건은 전부 1946~1951 년 Q1~Q3 다
 *    (그 시절엔 연간 집계만 있었다). 1951Q4 이후로는 결측이 없다.
 */
import { redis } from "@/lib/redis";
import type { FhlbPoint } from "@/lib/observatory-constants";

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

export const FHLB_KEY = "observatory:fhlb";

/** 사용하는 FRED 시리즈 id */
export const FHLB_SERIES_ID = "BOGZ1FL403069330Q";

/** 시리즈 시작일 (첫 유효 관측치) */
export const FHLB_START = "1945-10-01";

interface FredObs {
  date: string;
  value: string;
}

/**
 * 분기 관측치의 날짜를 분기 문자열로 바꾼다.
 *
 * FRED 는 분기 관측치를 **분기 시작월 1일**로 적는다 (2026-04-01 = 2026Q2).
 * 분기 말일로 오해하면 전체가 한 분기씩 밀린다.
 */
function toQuarter(date: string): string | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(date);
  if (!m) return null;
  const month = Number(m[2]);
  const q = Math.floor((month - 1) / 3) + 1;
  return `${m[1]}Q${q}`;
}

/** 정렬·인접 판정용 숫자 키 (2026Q2 → 8105 처럼 분기 단위 일련번호) */
function quarterIndex(quarter: string): number {
  const m = /^(\d{4})Q([1-4])$/.exec(quarter);
  if (!m) return Number.NaN;
  return Number(m[1]) * 4 + (Number(m[2]) - 1);
}

/** Redis 에 저장된 시계열 (분기 오름차순). 없으면 빈 배열 */
export async function loadFhlb(): Promise<FhlbPoint[]> {
  // @upstash/redis 는 직렬화/역직렬화를 자동 처리한다 (JSON.parse 금지)
  const stored = await redis.get<FhlbPoint[]>(FHLB_KEY);
  return Array.isArray(stored) ? stored : [];
}

/**
 * FRED 관측치를 분기 시계열로 바꾼다.
 *
 * ⚠ 결측(".")은 **건너뛴다. 0 으로 넣지 않는다.**
 *   SRF 사용량은 "."이 "그날 레포 운영이 없었다 = 사용액 0" 이라 0 이 맞지만,
 *   FHLB 는 **잔액 레벨**이라 "."은 "값이 발표되지 않았다" 는 뜻이다.
 *   0 으로 채우면 1945Q4(205백만) → 1946Q1(0) 이 가짜 −100%가 되고,
 *   다음 유효값에서 가짜 폭등이 나와 없는 경보가 켜진다.
 *
 * ⚠ 증가율은 직전 관측치가 **바로 앞 분기일 때만** 낸다. 구멍을 건너뛴 채
 *   계산하면 1년치 변화가 "전분기 대비" 로 둔갑한다 (1946~1951 구간).
 */
export function buildSeries(observations: FredObs[]): FhlbPoint[] {
  const parsed: { quarter: string; advancesBillions: number }[] = [];

  for (const o of observations) {
    if (!o.date || o.value === "." || o.value === "") continue;
    const quarter = toQuarter(o.date);
    if (!quarter) continue;
    const millions = parseFloat(o.value);
    if (!Number.isFinite(millions)) continue;
    // 백만 달러 → 십억 달러
    parsed.push({ quarter, advancesBillions: millions / 1000 });
  }

  parsed.sort((a, b) => quarterIndex(a.quarter) - quarterIndex(b.quarter));

  return parsed.map((p, i) => {
    const prev = i > 0 ? parsed[i - 1] : null;
    const adjacent =
      prev !== null &&
      quarterIndex(p.quarter) - quarterIndex(prev.quarter) === 1 &&
      prev.advancesBillions > 0;

    return {
      quarter: p.quarter,
      advancesBillions: p.advancesBillions,
      qoqChangePct: adjacent
        ? ((p.advancesBillions - prev.advancesBillions) / prev.advancesBillions) * 100
        : null,
    };
  });
}

export interface FhlbCollectResult {
  /** 이번 실행이 전체 백필이었는지 */
  backfill: boolean;
  /** 저장 후 전체 분기 수 */
  total: number;
  /** 이번 실행으로 늘어난 분기 수 */
  added: number;
  latestQuarter: string | null;
  latestAdvancesBillions: number | null;
  latestQoqChangePct: number | null;
}

/**
 * FRED 에서 FHLB 차입 잔액을 가져와 Redis 에 저장한다.
 *
 * 분기 시리즈라 전체가 323건뿐이다. 증분 병합으로 얻을 게 없고 오히려
 * 구멍 판정이 꼬일 수 있어, 매번 전체를 받아 통째로 다시 만든다.
 * (FRED 는 직전 관측치를 사후 정정하기도 하는데 그것도 같이 반영된다)
 */
export async function collectFhlb(): Promise<FhlbCollectResult> {
  const existing = await loadFhlb();
  const backfill = existing.length === 0;

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error("FRED_API_KEY not set");

  const url = `${FRED_BASE}?series_id=${FHLB_SERIES_ID}&api_key=${apiKey}&file_type=json&observation_start=${FHLB_START}`;
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`FRED ${FHLB_SERIES_ID}: ${res.status}`);

  const json = (await res.json()) as { observations?: FredObs[] };
  const series = buildSeries(json.observations ?? []);

  // 수집 결과가 비면 기존 데이터를 지우지 않는다 (FRED 일시 장애로 인한 유실 방지)
  if (series.length === 0) {
    return {
      backfill,
      total: existing.length,
      added: 0,
      latestQuarter: null,
      latestAdvancesBillions: null,
      latestQoqChangePct: null,
    };
  }

  await redis.set(FHLB_KEY, series);

  const latest = series[series.length - 1];
  return {
    backfill,
    total: series.length,
    added: series.length - existing.length,
    latestQuarter: latest.quarter,
    latestAdvancesBillions: latest.advancesBillions,
    latestQoqChangePct: latest.qoqChangePct,
  };
}
