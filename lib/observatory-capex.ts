/**
 * 관측소 6 — 신참 결절점: AI 설비투자의 대리 지표(대형 기술기업 5곳 설비투자 합계) 수집
 *
 * 출처: SEC XBRL companyconcept API (data.sec.gov, 인증 없음, User-Agent 필요)
 *   MSFT 0000789019 · GOOGL 0001652044 · META 0001326801 · ORCL 0001341439 :
 *     us-gaap/PaymentsToAcquirePropertyPlantAndEquipment
 *   AMZN 0001018724 : us-gaap/PaymentsToAcquireProductiveAssets
 *   SEC 사이트 고지: "sec.gov 의 정보는 공공 정보이며 허락 없이 복사·배포할 수 있다(출처 표기 권장)".
 *
 * 실측으로 확인한 사실 (2026-10-18):
 *  - 아마존은 태그를 세 번 썼다(독립 검증에서 companyfacts 로 확인):
 *      PaymentsToAcquirePropertyPlantAndEquipment(~2017-04 제출) → PaymentsForProceedsFromProductiveAssets
 *      (2017-07~2018-07 제출) → PaymentsToAcquireProductiveAssets(2018-10~ 제출).
 *    정의가 바뀐 것은 태그 변경이 아니라 2018-02 제출 2017년 10-K 부터다: 인센티브 차감 순액 → 총액,
 *    2016년 연간 6.737 → 7.804십억 달러로 재작성. 지금 태그만 쓰면 총액 기준 분기 값은 2017Q3 부터 나온다.
 *    2017Q1·Q2 총액 값은 가운데 태그에만 있어 이어 붙이지 않았다(태그를 섞는 이득이 두 분기뿐이라).
 *  - 같은 기간이 여러 번 공시되면 **처음 공시된 값**을 쓴다. 가장 늦은 값을 쓰면 연간 값만 나중에
 *    재작성되고 9개월 누적은 그대로라, 재작성 차이가 전부 4분기에 몰리고 해마다 기준이 섞인다
 *    (독립 검증: 메타 2022Q4 8.798 vs 처음 공시 기준 9.043).
 *  - 현금흐름표는 10-Q 에 누적(연초부터) 값으로 실린다. 3개월짜리는 그대로 쓰고, 나머지는
 *    같은 시작일의 바로 앞 분기 누적을 빼서 분기 값을 만든다. 시험 결과 음수 분기 0건.
 *  - 오라클은 회계분기가 2·5·8·11월 말에 끝난다. 분기 말일이 속한 달력 분기로 묶는다(한 달 어긋남).
 *  - 5곳을 동시에 받는다. 차례로 받으면 SEC 가 느린 날 cron 60초 한도를 넘을 수 있다.
 *  - 한 회사가 태그를 바꾸거나 공시가 멈추면 "5곳 모두 있는 분기" 가 늘지 않아 지표가 조용히 멈춘다.
 *    그래서 저장한 뒤 (1) 회사별 마지막 분기가 2분기 이상 벌어졌거나 (2) 마지막 공통 분기의 다음 분기가
 *    끝나고 75일이 지났는데도 없으면 에러를 던져 cron errors 에 남긴다.
 *  - SEC 는 User-Agent 에 연락처를 권한다. 개인 연락처를 코드에 넣지 않으려고 사이트 주소를 넣었고,
 *    2026-10-18 시험에서 정상 응답(200)을 받았다. 막히면 cron errors 에 403 으로 남는다.
 *
 * ⚠ 6-B 스테이블코인(발행 잔액 · 디페그)은 만들지 않았다. 초안에 쓴 DefiLlama 이용약관 8조가
 *   "허락 없이 어떤 형태로든 데이터 재게시 금지"다 (docs/observatory-decision-log.md 8장 10번).
 */
import { redis } from "@/lib/redis";
import type { CapexQuarter } from "@/lib/observatory-constants";
import { assertReplaceable, nextQuarter } from "@/lib/observatory-series-guard";

const SEC_UA = "TockTock/1.0 (observatory data collector; +https://tocktock.kr)";

export const CAPEX_KEY = "observatory:bigtech-capex";

/** 회사 → [CIK, 태그] (이름이 아니라 CIK 로 조회한다) */
export const CAPEX_COMPANIES: Record<string, { cik: string; tag: string; name: string }> = {
  MSFT: { cik: "0000789019", tag: "PaymentsToAcquirePropertyPlantAndEquipment", name: "마이크로소프트" },
  GOOGL: { cik: "0001652044", tag: "PaymentsToAcquirePropertyPlantAndEquipment", name: "알파벳" },
  AMZN: { cik: "0001018724", tag: "PaymentsToAcquireProductiveAssets", name: "아마존" },
  META: { cik: "0001326801", tag: "PaymentsToAcquirePropertyPlantAndEquipment", name: "메타" },
  ORCL: { cik: "0001341439", tag: "PaymentsToAcquirePropertyPlantAndEquipment", name: "오라클" },
};

interface SecFact {
  start?: string;
  end: string;
  val: number;
  form: string;
  filed: string;
}

const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;
const calQuarter = (end: string) => `${end.slice(0, 4)}Q${Math.floor((Number(end.slice(5, 7)) - 1) / 3) + 1}`;

/** 누적(YTD) 현금흐름 → 분기 값 (분기 말일 → 십억 달러) */
export function toQuarterly(facts: SecFact[]): Map<string, number> {
  const FORMS = new Set(["10-Q", "10-K", "10-Q/A", "10-K/A"]);
  const by = new Map<string, SecFact>();
  for (const f of facts) {
    if (!f.start || !FORMS.has(f.form)) continue;
    const k = `${f.start}~${f.end}`;
    const old = by.get(k);
    if (!old || f.filed < old.filed) by.set(k, f); // 같은 기간은 처음 공시된 값 (위 주석)
  }
  const list = [...by.values()];
  const out = new Map<string, number>();
  for (const f of list) {
    const d = days(f.start!, f.end);
    if (d >= 80 && d <= 100) out.set(f.end, f.val / 1e9);
  }
  const byStart = new Map<string, SecFact[]>();
  for (const f of list) {
    const arr = byStart.get(f.start!) ?? [];
    arr.push(f);
    byStart.set(f.start!, arr);
  }
  for (const arr of byStart.values()) {
    arr.sort((a, b) => (a.end < b.end ? -1 : 1));
    for (let i = 1; i < arr.length; i++) {
      const gap = days(arr[i - 1].end, arr[i].end);
      if (gap < 80 || gap > 100) continue; // 바로 앞 분기 누적과만 뺀다
      if (!out.has(arr[i].end)) out.set(arr[i].end, (arr[i].val - arr[i - 1].val) / 1e9);
    }
  }
  return out;
}

export async function loadCapex(): Promise<CapexQuarter[]> {
  // @upstash/redis 는 직렬화/역직렬화를 자동 처리한다 (JSON.parse 금지)
  const stored = await redis.get<CapexQuarter[]>(CAPEX_KEY);
  return Array.isArray(stored) ? stored : [];
}

export async function collectCapex(): Promise<{ total: number; added: number; latestQuarter: string | null }> {
  const existing = await loadCapex();
  const per: Record<string, Map<string, number>> = {};
  await Promise.all(
    Object.entries(CAPEX_COMPANIES).map(async ([t, c]) => {
      const res = await fetch(`https://data.sec.gov/api/xbrl/companyconcept/CIK${c.cik}/us-gaap/${c.tag}.json`, {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
        headers: { "User-Agent": SEC_UA },
      });
      if (!res.ok) throw new Error(`SEC ${t} ${c.tag}: ${res.status}`);
      const json = (await res.json()) as { units?: { USD?: SecFact[] } };
      const q = toQuarterly(json.units?.USD ?? []);
      if (q.size === 0) throw new Error(`SEC ${t}: 분기 값 0건`);
      // 분기 말일 → 달력 분기 (같은 달력 분기에 두 값이 오면 늦은 말일을 쓴다)
      const m = new Map<string, number>();
      for (const end of [...q.keys()].sort()) m.set(calQuarter(end), q.get(end)!);
      per[t] = m;
    })
  );
  const quarters = [...new Set(Object.values(per).flatMap((m) => [...m.keys()]))].sort();
  const series: CapexQuarter[] = quarters
    .filter((q) => Object.values(per).every((m) => m.has(q)))
    .map((q) => {
      const byCompany = Object.fromEntries(Object.entries(per).map(([t, m]) => [t, m.get(q)!]));
      return { quarter: q, byCompany, totalBillions: Object.values(byCompany).reduce((s, v) => s + v, 0) };
    });
  if (series.length === 0) throw new Error("SEC 설비투자: 5곳이 모두 있는 분기 0건");
  assertReplaceable("SEC 설비투자", series.map((p) => p.quarter), existing.map((p) => p.quarter), nextQuarter);
  await redis.set(CAPEX_KEY, series);

  // 조용히 멈추는 경우를 에러로 드러낸다 (저장은 이미 했다 — 받은 값 자체는 정상이다)
  const lastByCompany = Object.entries(per).map(([t, m]) => [t, [...m.keys()].sort().pop()!] as const);
  const qi = (q: string) => Number(q.slice(0, 4)) * 4 + Number(q.slice(5)) - 1;
  const newest = Math.max(...lastByCompany.map(([, q]) => qi(q)));
  const behind = lastByCompany.filter(([, q]) => newest - qi(q) >= 2).map(([t, q]) => `${t} ${q}`);
  if (behind.length) throw new Error(`SEC 설비투자: 공시가 2분기 이상 뒤처진 회사 — ${behind.join(", ")} (태그 변경 확인 필요)`);
  const latest = series[series.length - 1].quarter;
  const next = nextQuarter(latest);
  const nextEnd = Date.UTC(Number(next.slice(0, 4)), Number(next.slice(5)) * 3, 0); // 다음 분기 말일
  if (Date.now() > nextEnd + 75 * 86_400_000) {
    throw new Error(`SEC 설비투자: ${next} 가 끝나고 75일이 지났는데 5곳 합계가 ${latest} 에서 멈춤`);
  }
  return { total: series.length, added: series.length - existing.length, latestQuarter: latest };
}
