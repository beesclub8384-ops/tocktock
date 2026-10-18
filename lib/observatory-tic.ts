/**
 * 관측소 4 — 국채시장: 해외 보유 국채(TIC) 수집 및 저장
 *
 * 출처: 미 재무부 TIC "Major Foreign Holders of Treasury Securities" (십억 달러, 월말 기준)
 *   - 최근 13개월: .../tic/Documents/slt_table5.txt   (SLT Table 5)
 *   - 과거 연도:   .../tic/Documents/mfhhis01.txt     (연도별 블록)
 *   인증 없음. 2026-10-18 실측: Table 5 는 2026-08 까지(파일 갱신 2026-10-16),
 *   과거 파일은 2025-12 까지. 예전 위치의 mfh.txt 는 2023-01 에서 멈춘 옛 파일이라 쓰지 않는다.
 *
 * 2012-01 이후만 쓴다 (constants 의 TIC_START_MONTH 주석 참고 — 마지막 시리즈 단절이 2011-12).
 * 같은 달이 두 파일에 다 있으면 **Table 5 값을 쓴다** (나중에 개정된 값이다. 예: 2025-12 영국
 * 863.1 → 863.2). 연례 조사로 과거 값이 바뀌므로 매번 전체를 받아 덮어쓴다.
 *
 * 국가가 아니라 합계 행("Grand Total")만 쓴다. 행은 이름으로 찾지만, 합계 행 이름은
 * 두 파일 모두 "Grand Total" 로 고정이다 — 못 찾으면 던진다.
 */
import { redis } from "@/lib/redis";
import { TIC_START_MONTH, type TicPoint } from "@/lib/observatory-constants";

const BASE = "https://ticdata.treasury.gov/resource-center/data-chart-center/tic/Documents";
export const TIC_TABLE5_URL = `${BASE}/slt_table5.txt`;
export const TIC_HISTORY_URL = `${BASE}/mfhhis01.txt`;

export const TIC_KEY = "observatory:tic-foreign-holdings";

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    headers: { "User-Agent": "TockTock/1.0 (observatory data collector)" },
  });
  if (!res.ok) throw new Error(`TIC ${url}: ${res.status}`);
  return res.text();
}

const cells = (line: string) => line.split("\t").map((c) => c.trim().replace(/^"|"$/g, ""));

/** Table 5: "Country | 2026-08 | 2026-07 ..." 머리행과 "Grand Total" 행 */
export function parseTable5(text: string): TicPoint[] {
  const lines = text.split(/\r?\n/);
  const head = lines.map(cells).find((c) => c[0] === "Country" && /^\d{4}-\d{2}$/.test(c[1] ?? ""));
  const total = lines.map(cells).find((c) => c[0] === "Grand Total");
  if (!head || !total) throw new Error("TIC Table 5: 머리행 또는 Grand Total 행 없음");
  const out: TicPoint[] = [];
  for (let k = 1; k < head.length; k++) {
    if (!/^\d{4}-\d{2}$/.test(head[k])) continue;
    const v = Number(total[k]);
    if (Number.isFinite(v) && total[k] !== "") out.push({ month: head[k], totalBillions: v });
  }
  return out;
}

/**
 * 과거 파일: 연도 블록마다 "월 이름 행" 바로 다음에 "Country | 2025 | 2025 ..." 연도 행,
 * 그 아래 어딘가에 "Grand Total" 행이 있다. 2012 이후 블록은 12개 열이 Dec → Jan 순서로 고르다.
 * 2011 이전 블록은 단절 비교 열 때문에 구조가 달라서 읽지 않는다.
 */
export function parseHistory(text: string): TicPoint[] {
  const rows = text.split(/\r?\n/).map(cells);
  const out: TicPoint[] = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] !== "Country") continue;
    const monthsRow = rows[i - 1];
    const yearsRow = rows[i];
    const year = yearsRow[1];
    if (!/^\d{4}$/.test(year) || `${year}-12` < TIC_START_MONTH) continue;
    // 이 블록의 Grand Total — 다음 "Country" 행 전까지
    let total: string[] | null = null;
    for (let k = i + 1; k < rows.length && rows[k][0] !== "Country"; k++) {
      if (rows[k][0] === "Grand Total") {
        total = rows[k];
        break;
      }
    }
    if (!total) throw new Error(`TIC history ${year}: Grand Total 행 없음`);
    for (let c = 1; c < yearsRow.length; c++) {
      const mm = MONTHS[monthsRow[c]];
      if (!mm || yearsRow[c] !== year) continue;
      const v = Number(total[c]);
      if (Number.isFinite(v) && total[c] !== "") out.push({ month: `${year}-${mm}`, totalBillions: v });
    }
  }
  return out;
}

export async function loadTic(): Promise<TicPoint[]> {
  // @upstash/redis 는 직렬화/역직렬화를 자동 처리한다 (JSON.parse 금지)
  const stored = await redis.get<TicPoint[]>(TIC_KEY);
  return Array.isArray(stored) ? stored : [];
}

export interface TicCollectResult {
  total: number;
  added: number;
  fromTable5: number;
  fromHistory: number;
  latestMonth: string | null;
}

export async function collectTic(): Promise<TicCollectResult> {
  const existing = await loadTic();
  const [t5, hist] = await Promise.all([fetchText(TIC_TABLE5_URL), fetchText(TIC_HISTORY_URL)]);
  const a = parseTable5(t5);
  const b = parseHistory(hist);
  // 둘 다 읽혀야 한다 — 한쪽만 읽히면 구멍 난 시계열이 조용히 저장된다
  if (a.length < 12) throw new Error(`TIC Table 5: ${a.length}개월만 읽힘`);
  if (b.length < 12 * 10) throw new Error(`TIC history: ${b.length}개월만 읽힘`);

  const byMonth = new Map<string, TicPoint>();
  for (const p of b) if (p.month >= TIC_START_MONTH) byMonth.set(p.month, p);
  for (const p of a) if (p.month >= TIC_START_MONTH) byMonth.set(p.month, p); // Table 5 우선
  const series = [...byMonth.values()].sort((x, y) => (x.month < y.month ? -1 : 1));

  // 달이 빠진 곳이 있으면 증가율이 엉뚱한 달과 비교된다 — 구멍을 막는다
  for (let k = 1; k < series.length; k++) {
    const [y0, m0] = series[k - 1].month.split("-").map(Number);
    const [y1, m1] = series[k].month.split("-").map(Number);
    if ((y1 * 12 + m1) - (y0 * 12 + m0) !== 1) {
      throw new Error(`TIC: ${series[k - 1].month} 와 ${series[k].month} 사이가 비어 있음`);
    }
  }

  await redis.set(TIC_KEY, series);
  return {
    total: series.length,
    added: series.length - existing.length,
    fromTable5: a.length,
    fromHistory: b.length,
    latestMonth: series[series.length - 1].month,
  };
}
