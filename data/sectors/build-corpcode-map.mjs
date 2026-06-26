/**
 * 전체 상장종목(코드+종목명)에 DART 고유번호(corp_code)를 매핑.
 *
 * 입력:
 *   - data/krx-history/krx-daily-all.json (날짜별 kospi/kosdaq 종목 시세) → 고유 종목 추출
 *   - DART corpCode.xml (OPENDART_API_KEY로 다운로드, 임시폴더에서 압축해제)
 * 출력:
 *   - data/sectors/stock-corpcode-map.json
 *     [{ "code":"005930", "name":"삼성전자", "corp_code":"00126380" }, ...]
 *     (매칭 실패 종목은 corp_code: null 로 포함)
 *
 * 사용법: node data/sectors/build-corpcode-map.mjs
 * 재실행 시 corpCode.xml을 새로 받아 매핑을 갱신한다.
 */

import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const KRX_JSON = path.join(REPO, "data", "krx-history", "krx-daily-all.json");
const OUTPUT = path.join(__dirname, "stock-corpcode-map.json");

// ── 키 로드 (값 출력 금지) ─────────────────────────────────
function loadKey() {
  for (const f of [".env.vercel.local", ".env.local", ".env"]) {
    try {
      const t = fs.readFileSync(path.join(REPO, f), "utf8");
      const m = t.match(/^OPENDART_API_KEY=(.*)$/m);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "").replace(/\r/g, "");
    } catch {
      /* skip */
    }
  }
  return null;
}

// ── 1) krx-daily-all.json에서 고유 종목 추출(최신 종목명 우선) ──
function extractStocks() {
  const buf = fs.readFileSync(KRX_JSON, "utf8");
  const re = /"code":"(\d{6})","name":"([^"]*)"/g;
  const map = new Map(); // code -> name (마지막=최신 날짜 우선)
  let m;
  while ((m = re.exec(buf))) map.set(m[1], m[2]);
  return [...map.entries()].map(([code, name]) => ({ code, name }));
}

// ── 2) 단일 엔트리 zip 해제 (중앙 디렉터리 기반, 외부 라이브러리 없음) ──
function unzipFirstXml(zipBuf) {
  // EOCD 찾기 (signature 0x06054b50)
  let eocd = -1;
  for (let i = zipBuf.length - 22; i >= 0; i--) {
    if (zipBuf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("EOCD 미발견(zip 아님)");
  let cdOff = zipBuf.readUInt32LE(eocd + 16);
  const cdCount = zipBuf.readUInt16LE(eocd + 10);
  for (let e = 0; e < cdCount; e++) {
    if (zipBuf.readUInt32LE(cdOff) !== 0x02014b50) break;
    const method = zipBuf.readUInt16LE(cdOff + 10);
    const compSize = zipBuf.readUInt32LE(cdOff + 20);
    const nameLen = zipBuf.readUInt16LE(cdOff + 28);
    const extraLen = zipBuf.readUInt16LE(cdOff + 30);
    const commentLen = zipBuf.readUInt16LE(cdOff + 32);
    const lho = zipBuf.readUInt32LE(cdOff + 42);
    const name = zipBuf.toString("utf8", cdOff + 46, cdOff + 46 + nameLen);
    if (/\.xml$/i.test(name)) {
      // 로컬 헤더에서 데이터 시작 위치 계산
      const lNameLen = zipBuf.readUInt16LE(lho + 26);
      const lExtraLen = zipBuf.readUInt16LE(lho + 28);
      const dataStart = lho + 30 + lNameLen + lExtraLen;
      const comp = zipBuf.subarray(dataStart, dataStart + compSize);
      return method === 0 ? comp : zlib.inflateRawSync(comp);
    }
    cdOff += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error("zip 내 .xml 미발견");
}

// ── 우선주 판별: 종목명이 우선주 패턴으로 끝나는가 ─────────
function isPreferredName(name) {
  const n = String(name).trim();
  // "...우", "...우B", "...1우", "...2우B", "... 우", "...우선주"
  return /(\d?\s?우[A-C]?)$/.test(n) || /우선주$/.test(n);
}

// ── 보통주 추정 코드 후보 (끝자리 규칙을 단정하지 않고 여러 개 시도) ──
function commonCandidates(code) {
  const set = new Set();
  const base5 = code.slice(0, 5);
  set.add(base5 + "0"); // 가장 흔한 형태: 끝자리 0
  const n = Number(code);
  // 끝자리만 줄여 보통주로: 1·5·7우(신형) 등 다양 → base5 유지되는 후보만 채택
  for (const d of [1, 2, 5, 6, 7]) {
    const c = String(n - d).padStart(6, "0");
    if (c.slice(0, 5) === base5) set.add(c);
  }
  set.delete(code);
  return [...set];
}

// ── 회사명 동일성 검증: 우선주명이 보통주명으로 시작하는가(공백 무시) ──
function sameCompany(prefName, commonName) {
  const norm = (s) => String(s).replace(/\s+/g, "");
  const p = norm(prefName);
  const c = norm(commonName);
  return c.length >= 2 && p.startsWith(c);
}

/**
 * 우선주→보통주 수동 연결 화이트리스트 (우선주코드 → 보통주코드).
 * 사람이 같은 회사임을 확인한 건만. 자동 이름검증을 건너뛰고 corp_code를 직접 상속한다.
 * 왜 수동인가: 한국 종목명은 길이 제한이 있어 우선주명이 잘려(예: "삼성중공업우"→"삼성중공우")
 * 보통주명으로 시작하지 않아 prefix 자동검증이 실패한다. 회사는 동일하므로 수동 확인 후 연결.
 */
const MANUAL_PREF_LINKS = {
  "008355": "008350", // 남선알미우  → 남선알미늄
  "010145": "010140", // 삼성중공우  → 삼성중공업
  "007815": "007810", // 코리아써우  → 코리아써키트
};

// ── 매칭 실패 유형 추정 ────────────────────────────────────
function guessReason(name) {
  if (/우[A-C]?$/.test(name) || /우선주/.test(name)) return "우선주(추정)";
  if (/스팩|제\d+호$/.test(name)) return "스팩(추정)";
  if (/리츠|REIT/i.test(name)) return "리츠(추정)";
  if (/ETF|ETN|KODEX|TIGER|KBSTAR|ACE|ARIRANG|HANARO|SOL|KOSEF|PLUS|RISE|TIMEFOLIO/i.test(name))
    return "ETF/ETN(추정)";
  if (/인프라|선물|인버스|레버리지/.test(name)) return "펀드/인프라/파생(추정)";
  return "상장폐지·신규상장·종목명 변경 등(추정)";
}

async function main() {
  const KEY = loadKey();
  if (!KEY) {
    console.error("OPENDART_API_KEY 없음");
    process.exit(1);
  }
  console.log("키 로드: OK");

  const stocks = extractStocks();
  console.log("krx-daily-all.json 고유 종목 수:", stocks.length);

  // corpCode.xml 다운로드 (임시폴더)
  const tmpZip = path.join(os.tmpdir(), "dart-corpcode.zip");
  const res = await fetch(
    `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${KEY}`
  );
  if (!res.ok) {
    console.error("corpCode 다운로드 실패: HTTP", res.status);
    process.exit(1);
  }
  const zipBuf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(tmpZip, zipBuf);
  const xml = unzipFirstXml(zipBuf).toString("utf8");
  console.log("corpCode.xml 길이:", xml.length);

  // stock_code -> corp_code 매핑
  const codeToCorp = new Map();
  const re = /<list>([\s\S]*?)<\/list>/g;
  let m;
  let listCount = 0;
  while ((m = re.exec(xml))) {
    listCount++;
    const blk = m[1];
    const sc = (blk.match(/<stock_code>([^<]*)<\/stock_code>/) || [])[1] || "";
    const cc = (blk.match(/<corp_code>([^<]*)<\/corp_code>/) || [])[1] || "";
    const scT = sc.trim();
    if (/^\d{6}$/.test(scT)) codeToCorp.set(scT, cc.trim());
  }
  console.log("corpCode 전체 list:", listCount, "| 상장(stock_code 보유):", codeToCorp.size);

  // ── 1차 매핑 (보통주 직접 매칭) ───────────────────────────
  const result = stocks.map((s) => ({
    code: s.code,
    name: s.name,
    corp_code: codeToCorp.get(s.code) ?? null,
    is_preferred: isPreferredName(s.name),
  }));
  const directMatched = result.filter((r) => r.corp_code).length;

  // ── 2차: 우선주 → 보통주 corp_code 상속 (검증 포함) ────────
  const byCode = new Map(result.map((r) => [r.code, r]));
  const linkedSamples = [];
  const nameMismatch = []; // 코드 후보는 있으나 회사명 불일치 → 연결 안 함
  const noCandidate = []; // 코드 후보 자체가 corp_code 보유 보통주에 없음
  let linkedCount = 0;

  let manualCount = 0;
  for (const r of result) {
    if (r.corp_code) continue; // 이미 매칭된 건 패스
    if (!r.is_preferred) continue; // 우선주만 시도

    // 0) 수동 화이트리스트: 이름검증 건너뛰고 보통주 corp_code 직접 상속
    const manualCommon = MANUAL_PREF_LINKS[r.code];
    if (manualCommon) {
      const common = byCode.get(manualCommon);
      if (common && common.corp_code) {
        r.corp_code = common.corp_code;
        r.linked_from_common = common.code;
        r.linked_manual = true; // 수동 연결 표시
        manualCount++;
        linkedCount++;
        linkedSamples.push({
          pref: `${r.code} ${r.name}`,
          common: `${common.code} ${common.name}`,
          corp_code: common.corp_code,
          manual: true,
        });
        continue;
      }
    }

    const cands = commonCandidates(r.code);
    // 후보 중 corp_code를 가진 보통주 항목들
    const codeHits = cands.map((c) => byCode.get(c)).filter((e) => e && e.corp_code);
    if (codeHits.length === 0) {
      noCandidate.push(r);
      continue;
    }
    // 회사명(공백 제거) prefix 일치로 검증
    const verified = codeHits.find((e) => sameCompany(r.name, e.name));
    if (verified) {
      r.corp_code = verified.corp_code;
      r.linked_from_common = verified.code; // 추적용
      linkedCount++;
      if (linkedSamples.length < 15)
        linkedSamples.push({ pref: `${r.code} ${r.name}`, common: `${verified.code} ${verified.name}`, corp_code: verified.corp_code });
    } else {
      // 코드는 매칭됐지만 이름이 다른 회사 → 잘못된 연결, null 유지
      nameMismatch.push({
        pref: `${r.code} ${r.name}`,
        codeHits: codeHits.map((e) => `${e.code} ${e.name}`),
      });
    }
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2) + "\n", "utf8");

  // ── 통계 ──────────────────────────────────────────────────
  const matchedNow = result.filter((r) => r.corp_code).length;
  const stillFailed = result.filter((r) => !r.corp_code);
  console.log("\n===== 통계 =====");
  console.log("전체 종목 수:", result.length);
  console.log("1차 직접 매칭(보통주):", directMatched);
  console.log("2차 우선주→보통주 연결 성공:", linkedCount, `(자동 ${linkedCount - manualCount} + 수동 ${manualCount})`);
  console.log("최종 매칭 성공:", matchedNow, `(${((matchedNow / result.length) * 100).toFixed(1)}%)`);
  console.log("여전히 실패:", stillFailed.length);
  console.log("  - 이름검증 실패(연결 안 함):", nameMismatch.length);
  console.log("  - 보통주 후보 없음:", noCandidate.length);
  console.log("출력:", OUTPUT);

  console.log("\n===== 연결 샘플 (우선주 → 보통주, corp_code) =====");
  for (const s of linkedSamples.slice(0, 18))
    console.log(`  ${s.pref.padEnd(24)} → ${s.common.padEnd(22)} ${s.corp_code}${s.manual ? "  [수동]" : ""}`);

  console.log("\n===== 이름 불일치(잘못 연결될 뻔 → null 유지) =====");
  if (nameMismatch.length === 0) console.log("  (없음)");
  else for (const s of nameMismatch) console.log(`  ${s.pref}  ↔ 코드후보: ${s.codeHits.join(", ")}`);

  console.log("\n===== 끝까지 실패(보통주 후보 없음) =====");
  if (noCandidate.length === 0) console.log("  (없음)");
  else for (const r of noCandidate) console.log(`  ${r.code} ${r.name}`);
}

main();
