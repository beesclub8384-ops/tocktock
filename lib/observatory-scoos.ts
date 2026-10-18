/**
 * 관측소 3 — 헤지펀드 자금조달 조건(연준 SCOOS) 수집
 *
 * 출처: 연준 이사회 SCOOS(Senior Credit Officer Opinion Survey on Dealer Financing Terms) 공식 XML 묶음
 *   https://www.federalreserve.gov/releases/scoos/data/FRB_SCOOS_xml.zip (안에 SCOOS_data.xml)
 *   연준 사이트 고지: "별도 표시가 없으면 공공 영역, 허락 없이 복사·배포 가능, 출처 표기 요청".
 *   FRED(release 571)에도 있지만 FRED 약관이 재게시·저장에 제한을 두어 원출처에서 받는다.
 *   연준 데이터 다운로드 프로그램(DDP)은 폐지 예정이라 쓰지 않는다.
 *
 * 쓰는 시리즈: EXH_E1_C5.Q5.NP — 헤지펀드 대상 비가격 조건 순강화 비율(%), 분기, 2011-09-30 ~.
 *   TIME_PERIOD 는 조사 분기 말일이다(2026-09-30 = 2026년 9월 조사, 파일 시각 2026-09-23).
 *
 * 실측 (2026-10-18): zip 약 0.3MB, XML 약 13MB, 61분기 끊김 없음.
 */
import { inflateRawSync } from "node:zlib";
import { redis } from "@/lib/redis";
import type { ScoosPoint } from "@/lib/observatory-constants";
import { assertReplaceable, nextQuarter } from "@/lib/observatory-series-guard";

export const SCOOS_ZIP_URL = "https://www.federalreserve.gov/releases/scoos/data/FRB_SCOOS_xml.zip";
export const SCOOS_SERIES = "EXH_E1_C5.Q5.NP";
export const SCOOS_KEY = "observatory:scoos-hedge-fund";

/** zip 안의 파일 하나를 꺼낸다 (중앙 디렉터리를 읽는 최소 구현 — 저장(0)·deflate(8)만) */
function unzipEntry(buf: Buffer, name: string): Buffer {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("SCOOS zip: 끝 레코드를 찾지 못함");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("SCOOS zip: 중앙 디렉터리 형식 오류");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const entryName = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if (entryName === name) {
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(start, start + compSize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      throw new Error(`SCOOS zip: 지원하지 않는 압축 방식 ${method}`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`SCOOS zip: ${name} 없음`);
}

/** "2026-09-30" → "2026Q3" */
function toQuarter(date: string): string | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(date);
  return m ? `${m[1]}Q${Math.floor((Number(m[2]) - 1) / 3) + 1}` : null;
}

export async function loadScoos(): Promise<ScoosPoint[]> {
  // @upstash/redis 는 직렬화/역직렬화를 자동 처리한다 (JSON.parse 금지)
  const stored = await redis.get<ScoosPoint[]>(SCOOS_KEY);
  return Array.isArray(stored) ? stored : [];
}

export async function collectScoos(): Promise<{ total: number; added: number; latestQuarter: string | null }> {
  const existing = await loadScoos();
  const res = await fetch(SCOOS_ZIP_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    headers: { "User-Agent": "TockTock/1.0 (observatory data collector)" },
  });
  if (!res.ok) throw new Error(`연준 SCOOS zip: ${res.status}`);
  const xml = unzipEntry(Buffer.from(await res.arrayBuffer()), "SCOOS_data.xml").toString("utf8");
  const at = xml.indexOf(`SERIES_NAME="${SCOOS_SERIES}"`);
  if (at < 0) throw new Error(`연준 SCOOS: 시리즈 ${SCOOS_SERIES} 없음`);
  const end = xml.indexOf("</kf:Series>", at);
  const block = xml.slice(at, end < 0 ? undefined : end);
  const series: ScoosPoint[] = [];
  for (const m of block.matchAll(/<frb:Obs\b([^>]*)\/>/g)) {
    const attrs = m[1];
    const v = /OBS_VALUE="([^"]*)"/.exec(attrs)?.[1];
    const t = /TIME_PERIOD="([^"]*)"/.exec(attrs)?.[1];
    const q = t ? toQuarter(t) : null;
    const num = v === undefined ? NaN : parseFloat(v);
    if (q && Number.isFinite(num)) series.push({ quarter: q, netPct: num }); // 결측(빈 값·NaN)은 건너뛴다
  }
  if (series.length < 40) throw new Error(`연준 SCOOS: ${series.length}분기만 읽힘 — 형식 확인 필요`);
  series.sort((a, b) => (a.quarter < b.quarter ? -1 : a.quarter > b.quarter ? 1 : 0));
  assertReplaceable("연준 SCOOS", series.map((p) => p.quarter), existing.map((p) => p.quarter), nextQuarter);
  await redis.set(SCOOS_KEY, series);
  return { total: series.length, added: series.length - existing.length, latestQuarter: series[series.length - 1].quarter };
}
