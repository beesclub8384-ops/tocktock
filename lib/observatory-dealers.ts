/**
 * 관측소 4 — 프라이머리 딜러 국채 순포지션 수집 (뉴욕 연은 Markets Data API)
 *
 * 출처: https://markets.newyorkfed.org/api/pd/get/PDPOSGST-TOT.json (인증 없음)
 *   응답: {"pd":{"timeseries":[{"asofdate":"2013-04-03","keyid":"PDPOSGST-TOT","value":"108014"}, …]}}
 *   값은 문자열, 단위 백만 달러(응답에 단위 표기 없음), "*" 는 비공개 → 건너뛴다(잔액 성격).
 *   이용 조건: 뉴욕 연은 이용 약관(newyorkfed.org) — 출처 표기 문구를 페이지에 둔다(NyFedNotice).
 *
 * 실측 (2026-10-18): 706주, 2013-04-03 ~ 2026-10-07, 7일 간격 끊김 없음, "*" 0건.
 *   시리즈 구분(SBN2015·SBN2022·SBN2024) 경계에서도 같은 키로 이어서 나온다. 단절 처리는 판정 쪽
 *   (DEALER_SERIES_BREAKS)에서 한다.
 */
import { redis } from "@/lib/redis";
import type { DealerPoint } from "@/lib/observatory-constants";
import { assertReplaceable } from "@/lib/observatory-series-guard";

export const DEALER_API_URL = "https://markets.newyorkfed.org/api/pd/get/PDPOSGST-TOT.json";
export const DEALER_KEY = "observatory:dealer-treasury-positions";

/** 이보다 적게 읽히면 응답이 잘린 것으로 본다 (2026-10 실측 706주) */
const DEALER_MIN_ROWS = 600;

/** "2026-10-07" → 7일 뒤 */
function nextWeek(d: string): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 7);
  return t.toISOString().slice(0, 10);
}

export async function loadDealers(): Promise<DealerPoint[]> {
  // @upstash/redis 는 직렬화/역직렬화를 자동 처리한다 (JSON.parse 금지)
  const stored = await redis.get<DealerPoint[]>(DEALER_KEY);
  return Array.isArray(stored) ? stored : [];
}

export async function collectDealers(): Promise<{ total: number; added: number; latestDate: string | null }> {
  const existing = await loadDealers();
  const res = await fetch(DEALER_API_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    headers: { "User-Agent": "TockTock/1.0 (observatory data collector)" },
  });
  if (!res.ok) throw new Error(`뉴욕 연은 PD: ${res.status}`);
  const json = (await res.json()) as { pd?: { timeseries?: { asofdate: string; keyid: string; value: string }[] } };
  const rows = json.pd?.timeseries ?? [];
  const series: DealerPoint[] = [];
  for (const r of rows) {
    if (r.keyid !== "PDPOSGST-TOT" || !/^\d{4}-\d{2}-\d{2}$/.test(r.asofdate)) continue;
    const v = parseFloat(r.value);
    if (Number.isFinite(v)) series.push({ date: r.asofdate, netBillions: v / 1000 }); // 백만 → 십억 달러
  }
  if (series.length < DEALER_MIN_ROWS) throw new Error(`뉴욕 연은 PD: ${series.length}주만 읽힘 — 형식 확인 필요`);
  series.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  // 비공개("*") 주가 생기면 연속 검사에 걸린다 — 그때는 에러로 드러내고 사람이 본다
  assertReplaceable("뉴욕 연은 PD", series.map((p) => p.date), existing.map((p) => p.date), nextWeek);
  await redis.set(DEALER_KEY, series);
  return { total: series.length, added: series.length - existing.length, latestDate: series[series.length - 1].date };
}
