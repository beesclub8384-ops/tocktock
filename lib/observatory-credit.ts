/**
 * 관측소 5 — 신용의 벽: GZ 신용 스프레드, 은행 기업대출 상각률 수집
 *
 *  - GZ 신용 스프레드: 연준 이사회 FEDS Notes 공개 CSV (월간, %p, 1973-01 ~)
 *      https://www.federalreserve.gov/econres/notes/feds-notes/ebp_csv.csv
 *      열: date(YYYY-MM-01), gz_spread, ebp, est_prob — gz_spread 만 쓴다.
 *      연준 사이트 고지: "별도 표시가 없으면 공공 영역이며 허락 없이 복사·배포 가능, 출처 표기 요청".
 *  - CORBLACBS: Charge-Off Rate on Business Loans, All Commercial Banks (FRED, %, 분기, 계절조정)
 *      원출처는 연준 이사회. FRED_API_KEY 필요.
 *
 * 실측으로 확인한 사실 (2026-10-18):
 *  - FEDS Note 원문: "매월 넷째 영업일 오전 10시(미 동부) 이후 게시하도록 하겠다"(FOMC 발언 자제 기간과
 *    겹치면 그 뒤). 실측 Last-Modified 2026-10-06 14:00 GMT = 10월 넷째 영업일 10시. cron(13:00 UTC)보다
 *    늦어 보통 다음 평일 수집에서 반영된다. 공식 통계가 아니라 연구 산출물이라 예고 없이 늦거나 바뀔 수 있다.
 *  - 2026-09 발표분부터 일부 채권 특성 자료의 상용 제공사가 바뀌었다(방법론 동일, 그 전 값은 고치지 않음).
 *  - 2018-07-06 게시 파일에 2017-10~2018-03 값이 빠졌던 선례가 있다 → 아래 검사로 막는다.
 *  - 두 시리즈 모두 과거 값이 고쳐질 수 있어(GZ 는 모형 재추정, CORBLACBS 는 사후 개정)
 *    매번 전체를 받아 덮어쓴다.
 *  - 결측(빈 칸, FRED ".")은 건너뛴다. 0 으로 채우면 스프레드·상각률이 사라진 것처럼 보인다.
 *
 * ⚠ 하이일드·CCC 원지수(FRED 의 ICE BofA 시리즈)는 쓰지 않는다. notes 에 "ICE 사전 서면 승인 없이
 *   제3자에게 공개·배포 금지" 조건이 있어, 승인을 받을지는 사람이 정할 일이다
 *   (docs/observatory-decision-log.md 8장 8번).
 */
import { redis } from "@/lib/redis";
import type { MonthSpreadPoint, QuarterRatePoint } from "@/lib/observatory-constants";
import { assertReplaceable, nextMonth, nextQuarter } from "@/lib/observatory-series-guard";

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

export const GZ_CSV_URL = "https://www.federalreserve.gov/econres/notes/feds-notes/ebp_csv.csv";
export const CHARGEOFF_SERIES_ID = "CORBLACBS";

export const GZ_KEY = "observatory:gz-spread";
export const CHARGEOFF_KEY = "observatory:business-chargeoffs";

/** 이보다 적게 읽히면 파일 형식이 바뀐 것으로 보고 저장하지 않는다 (2026-10 실측 645개월) */
const GZ_MIN_ROWS = 600;

export async function loadGz(): Promise<MonthSpreadPoint[]> {
  // @upstash/redis 는 직렬화/역직렬화를 자동 처리한다 (JSON.parse 금지)
  const stored = await redis.get<MonthSpreadPoint[]>(GZ_KEY);
  return Array.isArray(stored) ? stored : [];
}

export interface GzCollectResult {
  total: number;
  added: number;
  latestMonth: string | null;
}

export async function collectGz(): Promise<GzCollectResult> {
  const existing = await loadGz();
  const res = await fetch(GZ_CSV_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    headers: { "User-Agent": "TockTock/1.0 (observatory data collector)" },
  });
  if (!res.ok) throw new Error(`연준 GZ CSV: ${res.status}`);
  const lines = (await res.text()).trim().split(/\r?\n/);
  // 열 위치를 이름으로 찾는다. 열 순서가 바뀌어도 엉뚱한 열을 읽지 않게
  const header = lines[0].split(",").map((h) => h.trim());
  const di = header.indexOf("date");
  const gi = header.indexOf("gz_spread");
  if (di < 0 || gi < 0) throw new Error(`연준 GZ CSV: 열 이름이 바뀜 (${header.join(",")})`);
  const series: MonthSpreadPoint[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    const m = /^(\d{4}-\d{2})-\d{2}$/.exec((cols[di] ?? "").trim());
    const v = parseFloat(cols[gi] ?? "");
    if (m && Number.isFinite(v)) series.push({ month: m[1], spreadPct: v });
  }
  if (series.length < GZ_MIN_ROWS) throw new Error(`연준 GZ CSV: ${series.length}개월만 읽힘 — 형식 확인 필요`);
  series.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
  assertReplaceable("연준 GZ CSV", series.map((p) => p.month), existing.map((p) => p.month), nextMonth);
  await redis.set(GZ_KEY, series);
  return { total: series.length, added: series.length - existing.length, latestMonth: series[series.length - 1].month };
}

async function fetchFred(seriesId: string): Promise<{ date: string; value: string }[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error("FRED_API_KEY not set");
  const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`FRED ${seriesId}: ${res.status}`);
  const json = (await res.json()) as { observations?: { date: string; value: string }[] };
  return json.observations ?? [];
}

export async function loadChargeOffs(): Promise<QuarterRatePoint[]> {
  const stored = await redis.get<QuarterRatePoint[]>(CHARGEOFF_KEY);
  return Array.isArray(stored) ? stored : [];
}

/** FRED 분기 관측일(분기 시작월 1일) → "2026Q2" */
function toQuarter(date: string): string | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(date);
  if (!m) return null;
  return `${m[1]}Q${Math.floor((Number(m[2]) - 1) / 3) + 1}`;
}

export interface ChargeOffCollectResult {
  total: number;
  added: number;
  latestQuarter: string | null;
}

export async function collectChargeOffs(): Promise<ChargeOffCollectResult> {
  const existing = await loadChargeOffs();
  const obs = await fetchFred(CHARGEOFF_SERIES_ID);
  const series: QuarterRatePoint[] = [];
  for (const o of obs) {
    if (o.value === "." || o.value === "") continue;
    const q = toQuarter(o.date);
    const v = parseFloat(o.value);
    if (q && Number.isFinite(v)) series.push({ quarter: q, ratePct: v });
  }
  if (series.length === 0) throw new Error(`FRED ${CHARGEOFF_SERIES_ID}: 관측치 0건`);
  assertReplaceable(`FRED ${CHARGEOFF_SERIES_ID}`, series.map((p) => p.quarter), existing.map((p) => p.quarter), nextQuarter);
  await redis.set(CHARGEOFF_KEY, series);
  return { total: series.length, added: series.length - existing.length, latestQuarter: series[series.length - 1].quarter };
}
