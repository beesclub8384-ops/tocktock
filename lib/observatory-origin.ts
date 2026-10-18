/**
 * 관측소 원출처 수집 — FRED 시리즈 대신 원출처에서 같은 값을 받아 FRED 와 같은 모양({date, value})으로 돌려준다.
 * 수집기들은 FRED 응답을 가공하던 코드를 그대로 쓰므로, 값이 같으면 판정도 같다.
 *
 * 출처 (2026-10-19 확인)
 *  - 연준 이사회 데이터 다운로드 프로그램(DDP)의 발표별 전체 묶음:
 *      https://www.federalreserve.gov/datadownload/Output.aspx?rel={H41|H8|CHGDEL|H15|Z1|PRATES}&filetype=zip
 *    안에 {rel}_data.xml(SDMX). 크기가 커서(H.4.1 XML 약 127MB, Z.1 약 620MB) 통째로 풀지 않고 스트리밍으로 읽어
 *    필요한 시리즈만 꺼내고 다 찾으면 멈춘다.
 *    이용 조건: "Unless otherwise indicated, information on Board's website is in the public domain and may be
 *    copied and distributed without permission. Please cite to the Board as the source"(federalreserve.gov/disclaimer.htm).
 *    ⚠ 연준은 DDP 를 언젠가 폐지한다고 예고했다(2026-11 둘째 주 "Build Your Package" 기능 제거). 이 주소가 사라지면
 *      수집이 실패해 cron errors 에 남는다 — 그때는 OBSERVATORY_SOURCE=fred 로 되돌리거나 새 주소로 바꾼다.
 *  - 뉴욕 연은 Markets Data API: SOFR https://markets.newyorkfed.org/api/rates/secured/sofr/search.json
 *    이용 조건: 뉴욕 연은 약관의 출처 표기와 SOFR 고지문(app/observatory/source-notices.tsx).
 *
 * FRED 와의 대조 (2026-10-19, 전 기간): 아래 연준 이사회 13개 + 뉴욕 연은 SOFR, 모두 14개 값·날짜 불일치 0.
 * FRED 가 바꿔 주던 것은 두 가지뿐이라 여기서 똑같이 바꾼다:
 *  - 분기 자료(Z.1, CHGDEL)의 날짜: 원출처는 분기 말일, FRED 는 분기 첫날 → 분기 첫날로.
 *  - H.8 의 단위: 원출처는 백만 달러, FRED 는 십억 달러 → 소수점을 세 자리 옮긴다(부동소수 나눗셈을 쓰지 않아 FRED 문자열과 같은 값).
 */
import { createInflateRaw } from "node:zlib";
import { StringDecoder } from "node:string_decoder";

export interface OriginObs {
  date: string;
  value: string;
}

type FedRelease = "H41" | "H8" | "CHGDEL" | "H15" | "Z1" | "PRATES";

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

/* 같은 cron 실행 안에서는 묶음을 한 번만 받는다 (예: H.8 은 예금 유출·NDFI 가 같이 쓴다) */
const releaseCache = new Map<FedRelease, { at: number; p: Promise<Map<string, { t: string; v: string }[]>> }>();
const CACHE_MS = 10 * 60 * 1000;

async function loadRelease(rel: FedRelease): Promise<Map<string, { t: string; v: string }[]>> {
  const hit = releaseCache.get(rel);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.p;
  const p = (async () => {
    const res = await fetch(`https://www.federalreserve.gov/datadownload/Output.aspx?rel=${rel}&filetype=zip`, {
      cache: "no-store",
      signal: AbortSignal.timeout(40000),
      headers: { "User-Agent": UA },
    });
    if (!res.ok) throw new Error(`연준 DDP ${rel}: ${res.status}`);
    const zip = Buffer.from(await res.arrayBuffer());
    return extractSeries(zip, `${rel}_data.xml`, namesFor(rel));
  })();
  releaseCache.set(rel, { at: Date.now(), p });
  p.catch(() => releaseCache.delete(rel)); // 실패는 기억하지 않는다
  return p;
}

/** "2026-06-30" → "2026-04-01" */
function toQuarterStart(d: string): string {
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

async function fetchSofr(observationStart: string): Promise<OriginObs[]> {
  const startYear = Number(observationStart.slice(0, 4));
  const endYear = new Date().getUTCFullYear();
  const out: OriginObs[] = [];
  for (let y = Math.max(startYear, 2018); y <= endYear; y++) {
    const res = await fetch(
      `https://markets.newyorkfed.org/api/rates/secured/sofr/search.json?startDate=${y}-01-01&endDate=${y}-12-31`,
      { cache: "no-store", signal: AbortSignal.timeout(15000), headers: { "User-Agent": UA } }
    );
    if (!res.ok) throw new Error(`뉴욕 연은 SOFR: ${res.status}`);
    const json = (await res.json()) as { refRates?: { effectiveDate: string; percentRate: number }[] };
    for (const r of json.refRates ?? []) {
      if (r.effectiveDate >= observationStart && Number.isFinite(r.percentRate)) {
        out.push({ date: r.effectiveDate, value: String(r.percentRate) });
      }
    }
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
export function warmOriginReleases(isOrigin: (fredId: string) => boolean): void {
  const rels = new Set<FedRelease>();
  for (const [id, m] of Object.entries(FED_MAPPING)) if (isOrigin(id)) rels.add(m.rel);
  for (const rel of rels) loadRelease(rel).catch(() => undefined);
}

/** 화면에 적을 시리즈 번호 — 원출처에서 받으면 원출처 시리즈 이름, FRED 면 FRED 번호 (미션 5 독립 검증 지적) */
export function displaySeriesId(fredId: string, isOrigin: boolean): string {
  if (!isOrigin) return `${fredId} (FRED)`;
  if (fredId === "SOFR") return "SOFR";
  return FED_MAPPING[fredId]?.name ?? fredId;
}
