/**
 * FreeSIS 신용공여 잔고 데이터 수집 스크립트
 *
 * freesis.kofia.or.kr 내부 API를 사용하여
 * 1998-07-01 ~ 2021-11-08 신용거래융자 잔고 데이터를 수집합니다.
 *
 * 사용법: node scripts/fetch-freesis-credit.mjs
 * 출력: data/freesis-credit-balance.csv
 */

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUTPUT_PATH = join(PROJECT_ROOT, "data", "freesis-credit-balance.csv");

const API_URL = "https://freesis.kofia.or.kr/meta/getMetaDataList.do";
const START_DATE = "19980701";
const END_DATE = "20211108";
const CHUNK_MONTHS = 6;
const REQUEST_DELAY_MS = 1000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const CSV_HEADER = "date,totalLoan,kospiLoan,kosdaqLoan";

// ── 날짜 유틸 ──

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function toIsoDate(yyyymmdd) {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function parseDate(yyyymmdd) {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6)) - 1;
  const d = Number(yyyymmdd.slice(6, 8));
  return new Date(y, m, d);
}

function addMonths(d, months) {
  const result = new Date(d);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * 날짜 범위를 6개월 단위 청크로 분할
 */
function buildDateChunks(startStr, endStr) {
  const chunks = [];
  const end = parseDate(endStr);
  let cursor = parseDate(startStr);

  while (cursor <= end) {
    const chunkEnd = addMonths(cursor, CHUNK_MONTHS);
    chunkEnd.setDate(chunkEnd.getDate() - 1); // 6개월 후 -1일

    const actualEnd = chunkEnd > end ? end : chunkEnd;
    chunks.push({
      start: formatDate(cursor),
      end: formatDate(actualEnd),
    });

    // 다음 청크 시작 = actualEnd + 1일
    const next = new Date(actualEnd);
    next.setDate(next.getDate() + 1);
    cursor = next;
  }

  return chunks;
}

// ── API 호출 ──

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchChunk(startDate, endDate, attempt = 1) {
  const body = {
    dmSearch: {
      tmpV40: "1000000", // 백만원 단위
      tmpV41: "1",
      tmpV1: "D", // 일간
      tmpV45: startDate,
      tmpV46: endDate,
      OBJ_NM: "STATSCU0100000070BO",
    },
  };

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const json = await res.json();
    return json;
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      console.warn(
        `  ⚠ ${startDate}~${endDate} 요청 실패 (${err.message}), ${attempt}/${MAX_RETRIES} 재시도...`
      );
      await sleep(RETRY_DELAY_MS);
      return fetchChunk(startDate, endDate, attempt + 1);
    }
    throw err;
  }
}

/**
 * API 응답에서 필요한 데이터를 추출
 */
function extractRows(json) {
  // 응답 구조: { ds1: [...] }
  const list = json?.ds1 ?? json?.result?.list ?? json?.list ?? [];

  if (!Array.isArray(list)) {
    console.warn("  ⚠ 응답에서 리스트를 찾을 수 없음:", Object.keys(json));
    return [];
  }

  const rows = [];
  for (const item of list) {
    const date = (item.TMPV1 || "").trim();
    const totalLoan = Number(item.TMPV2 || 0);
    const kospiLoan = Number(item.TMPV3 || 0);
    const kosdaqLoan = Number(item.TMPV4 || 0);

    // 날짜 형식 검증 & 데이터 없는 날 제거
    if (!date.match(/^\d{8}$/) || totalLoan === 0) continue;

    rows.push({ date, totalLoan, kospiLoan, kosdaqLoan });
  }

  return rows;
}

// ── CSV 저장 ──

function saveCSV(rows) {
  const dir = dirname(OUTPUT_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const lines = [CSV_HEADER];
  for (const r of rows) {
    lines.push(
      `${toIsoDate(r.date)},${r.totalLoan},${r.kospiLoan},${r.kosdaqLoan}`
    );
  }

  writeFileSync(OUTPUT_PATH, lines.join("\n") + "\n", "utf-8");
}

// ── 메인 ──

async function main() {
  console.log("FreeSIS 신용공여 잔고 데이터 수집");
  console.log(`기간: ${toIsoDate(START_DATE)} ~ ${toIsoDate(END_DATE)}`);
  console.log(`출력: ${OUTPUT_PATH}\n`);

  const chunks = buildDateChunks(START_DATE, END_DATE);
  console.log(`총 ${chunks.length}개 구간으로 분할하여 요청합니다.\n`);

  const allRows = [];

  for (let i = 0; i < chunks.length; i++) {
    const { start, end } = chunks[i];
    const label = `[${i + 1}/${chunks.length}]`;
    console.log(`${label} ${toIsoDate(start)} ~ ${toIsoDate(end)} 요청 중...`);

    try {
      const json = await fetchChunk(start, end);
      const rows = extractRows(json);
      allRows.push(...rows);
      console.log(`${label} → ${rows.length}건 수집 (누적: ${allRows.length}건)`);

      // 중간 저장 (크래시 대비)
      if (rows.length > 0) {
        const sorted = [...allRows].sort((a, b) => a.date.localeCompare(b.date));
        saveCSV(sorted);
      }
    } catch (err) {
      console.error(`${label} ✗ 최종 실패: ${err.message}`);
      console.error(`  수집된 ${allRows.length}건까지 저장합니다.`);
      break;
    }

    // 마지막 요청이 아니면 딜레이
    if (i < chunks.length - 1) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  // 최종 정렬 & 중복 제거 & 저장
  const deduped = new Map();
  for (const row of allRows) {
    deduped.set(row.date, row); // 같은 날짜면 마지막 값으로 덮어씀
  }

  const finalRows = [...deduped.values()].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  saveCSV(finalRows);

  console.log(`\n완료! 총 ${finalRows.length}건 저장됨`);
  if (finalRows.length > 0) {
    console.log(`첫 행: ${toIsoDate(finalRows[0].date)}`);
    console.log(`끝 행: ${toIsoDate(finalRows[finalRows.length - 1].date)}`);
  }
}

main().catch((err) => {
  console.error("치명적 오류:", err);
  process.exit(1);
});
