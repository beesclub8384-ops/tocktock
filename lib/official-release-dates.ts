/**
 * 미국 경제지표 공식 발표 일정 — FRED release/dates 대신 각 기관이 직접 낸 일정표를 읽는다 (2026-10-19 미션 8).
 *
 *  - BLS 일정표(ics): https://www.bls.gov/schedule/news_release/bls.ics — CPI, 고용보고서(Employment Situation), PPI
 *  - BEA 일정표(ics): https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics — GDP, 개인소득·지출(PCE)
 *  - 인구조사국 경제지표 일정표: https://www.census.gov/economic-indicators/calendar-listview-{연도}.html 과
 *    calendar-listview.html (다음 해) — 소매판매(Advance Monthly Sales for Retail and Food Services)
 *
 * FRED 와의 대조(2025-01 ~ 2026-12, 결정 로그 20-4): 앞으로의 날짜(2026-10-19 이후)는 6개 발표 모두 같다. 지난 날짜에서
 * FRED 에만 있는 날 2개(개인소득·지출 2025-12-23, 소매판매 2026-09-28)는 일정표에 없는 자료 갱신일로 보인다. 사이트는
 * 오늘 이후 날짜만 쓰므로 영향이 없다.
 * 날짜는 모두 미 동부 기준 YYYY-MM-DD. 일정표가 정한 시각은 모두 오전 8:30(미 동부)이다.
 * 이용 조건: 미국 연방 기관 자료(공공 영역). BLS 는 이름 없는 요청을 막아(403) 사이트 주소를 넣은 User-Agent 를 보낸다.
 */

export type ReleaseKey = "cpi" | "jobs" | "ppi" | "gdp" | "pce" | "retail";

const UA = "TockTock/1.0 (https://tocktock.vercel.app)";

async function getText(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000), headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${new URL(url).hostname}${new URL(url).pathname}: ${res.status}`);
  return res.text();
}

interface IcsEvent {
  summary: string;
  date: string; // 미 동부 YYYY-MM-DD
}

/** UTC 시각 → 미 동부 날짜 */
function utcToEasternDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso)
  );
}

function parseIcs(text: string): IcsEvent[] {
  const unfolded = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  const out: IcsEvent[] = [];
  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const s = /^SUMMARY:(.*)$/m.exec(block);
    const d = /^DTSTART([^:\n]*):(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/m.exec(block);
    if (!s || !d) continue;
    const [, , y, mo, da, h, mi, se, z] = d;
    const date = z === "Z" ? utcToEasternDate(`${y}-${mo}-${da}T${h}:${mi}:${se}Z`) : `${y}-${mo}-${da}`; // TZID=US-Eastern 은 현지 날짜 그대로
    out.push({ summary: s[1].replace(/\\,/g, ",").replace(/\\;/g, ";").trim(), date });
  }
  return out;
}

/**
 * 최소 기준: 발표마다 날짜가 하나 이상 있어야 한다. 일정표의 제목 문구나 HTML 이 바뀌어 하나도 못 찾으면 빈 배열로 조용히
 * 넘어가지 않고 에러로 남긴다(미션 8 독립 검증 지적 5). "앞으로의 날짜"로 검사하지 않는 이유: 연말에 다음 해 일정이
 * 아직 안 올라온 정상 상태(예: BLS 일정표는 지금 2026-12 까지)를 오류로 만들기 때문.
 */
function assertSome(source: string, groups: Record<string, string[]>): void {
  const empty = Object.entries(groups)
    .filter(([, d]) => d.length === 0)
    .map(([k]) => k);
  // 메시지 앞머리(기관 이름)는 fetchOfficialReleaseDates 의 catch 가 붙인다 (source 는 호출 위치 표시용)
  if (empty.length > 0) throw new Error(`발표일을 하나도 찾지 못함 — ${empty.join(", ")}`);
}

async function blsDates(): Promise<Record<"cpi" | "jobs" | "ppi", string[]>> {
  const ev = parseIcs(await getText("https://www.bls.gov/schedule/news_release/bls.ics"));
  const pick = (title: string) => [...new Set(ev.filter((e) => e.summary === title).map((e) => e.date))].sort();
  const out = { cpi: pick("Consumer Price Index"), jobs: pick("Employment Situation"), ppi: pick("Producer Price Index") };
  assertSome("BLS 일정표", out);
  return out;
}

async function beaDates(): Promise<Record<"gdp" | "pce", string[]>> {
  const ev = parseIcs(await getText("https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics"));
  // 전국 GDP 발표만: "GDP (Advance Estimate), …", "Gross Domestic Product, 3rd Quarter 2025 (Initial Estimate) …".
  // 주·카운티·푸에르토리코 GDP("GDP by County", "Gross Domestic Product for Puerto Rico", "… by State")는 뺀다
  const isGdp = (s: string) => s.startsWith("GDP (") || s.startsWith("Gross Domestic Product, ");
  const gdp = [...new Set(ev.filter((e) => isGdp(e.summary)).map((e) => e.date))].sort();
  const pce = [...new Set(ev.filter((e) => e.summary.startsWith("Personal Income and Outlays")).map((e) => e.date))].sort();
  assertSome("BEA 일정표", { gdp, pce });
  return { gdp, pce };
}

async function censusRetailDates(): Promise<string[]> {
  const year = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric" }).format(new Date()));
  const pages = [
    `https://www.census.gov/economic-indicators/calendar-listview-${year}.html`,
    `https://www.census.gov/economic-indicators/calendar-listview-${year + 1}.html`,
    "https://www.census.gov/economic-indicators/calendar-listview.html",
  ];
  const dates = new Set<string>();
  let okPages = 0;
  for (const url of pages) {
    let html: string;
    try {
      html = await getText(url);
    } catch {
      continue; // 다음 해 페이지는 아직 없을 수 있다
    }
    okPages++;
    const re = /<a[^>]*>\s*Advance Monthly Sales for Retail and Food Services\s*<\/a>\s*<\/td>\s*<td[^>]*sorttable_customkey="(\d{4})(\d{2})(\d{2})\d{4}"/g;
    for (const m of html.matchAll(re)) dates.add(`${m[1]}-${m[2]}-${m[3]}`);
  }
  if (okPages === 0) throw new Error("페이지를 하나도 받지 못함"); // 기관 이름은 fetchOfficialReleaseDates 의 catch 가 붙인다
  assertSome("인구조사국 일정표", { retail: [...dates] });
  return [...dates].sort();
}

/** 기관별로 읽은 발표일 수 (cron 응답용, 미션 9) */
export type AgencyCounts = Record<"BLS" | "BEA" | "인구조사국", number>;

/** 발표별 공식 발표일 (오름차순). 기관 하나가 실패하면 그 기관 발표는 빈 배열이고 errors 에 남는다 */
export async function fetchOfficialReleaseDates(): Promise<{ dates: Record<ReleaseKey, string[]>; errors: string[]; counts: AgencyCounts }> {
  const errors: string[] = [];
  const empty = { cpi: [], jobs: [], ppi: [], gdp: [], pce: [], retail: [] } as Record<ReleaseKey, string[]>;
  const [bls, bea, retail] = await Promise.all([
    blsDates().catch((e) => (errors.push(`BLS 일정표: ${e instanceof Error ? e.message : e}`), null)),
    beaDates().catch((e) => (errors.push(`BEA 일정표: ${e instanceof Error ? e.message : e}`), null)),
    censusRetailDates().catch((e) => (errors.push(`인구조사국 일정표: ${e instanceof Error ? e.message : e}`), null)),
  ]);
  const counts: AgencyCounts = {
    BLS: bls ? bls.cpi.length + bls.jobs.length + bls.ppi.length : 0,
    BEA: bea ? bea.gdp.length + bea.pce.length : 0,
    인구조사국: retail ? retail.length : 0,
  };
  return { dates: { ...empty, ...(bls ?? {}), ...(bea ?? {}), retail: retail ?? [] }, errors, counts };
}

/** BLS CPI 발표일만 (리포트 수집용) */
export async function fetchBlsCpiDates(): Promise<string[]> {
  // 기관 이름을 붙여 리포트 오류 목록에서 어디가 실패했는지 보이게 한다 (미션 9 독립 검증 지적 3)
  const { cpi } = await blsDates().catch((e) => {
    throw new Error(`BLS 일정표: ${e instanceof Error ? e.message : e}`);
  });
  if (cpi.length === 0) throw new Error("BLS 일정표에 CPI 발표일이 없음");
  return cpi;
}
