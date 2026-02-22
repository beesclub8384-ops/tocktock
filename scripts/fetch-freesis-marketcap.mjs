/**
 * FreeSIS 시가총액 히스토리컬 데이터 수집 스크립트
 *
 * freesis.kofia.or.kr 내부 API를 사용하여
 * 2001-01-02 ~ 2021-11-08 KOSPI/KOSDAQ 시가총액 데이터를 수집합니다.
 *
 * 사용법: node scripts/fetch-freesis-marketcap.mjs
 * 출력: data/freesis-market-cap.csv
 */

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUTPUT_PATH = join(PROJECT_ROOT, "data", "freesis-market-cap.csv");

const API_URL = "https://freesis.kofia.or.kr/meta/getMetaDataList.do";
const START_DATE = "20010102";
const END_DATE = "20211108";
const CHUNK_MONTHS = 6;
const REQUEST_DELAY_MS = 1000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// KOSPI: STATSCU0100000020BO, KOSDAQ: STATSCU0100000030BO
// TMPV1 = 날짜, TMPV5 = 시가총액(원)
const MARKETS = [
  { name: "KOSPI", objNm: "STATSCU0100000020BO" },
  { name: "KOSDAQ", objNm: "STATSCU0100000030BO" },
];

const CSV_HEADER = "date,kospiMarketCap,kosdaqMarketCap";

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
    chunkEnd.setDate(chunkEnd.getDate() - 1);

    const actualEnd = chunkEnd > end ? end : chunkEnd;
    chunks.push({
      start: formatDate(cursor),
      end: formatDate(actualEnd),
    });

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

async function fetchChunk(objNm, startDate, endDate, attempt = 1) {
  const body = {
    dmSearch: {
      tmpV40: "1", // 원 단위
      tmpV41: "1",
      tmpV1: "D", // 일간
      tmpV45: startDate,
      tmpV46: endDate,
      OBJ_NM: objNm,
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

    return await res.json();
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      console.warn(
        `  ⚠ ${startDate}~${endDate} 요청 실패 (${err.message}), ${attempt}/${MAX_RETRIES} 재시도...`
      );
      await sleep(RETRY_DELAY_MS);
      return fetchChunk(objNm, startDate, endDate, attempt + 1);
    }
    throw err;
  }
}

/**
 * API 응답에서 날짜 → 시가총액(원) Map 추출
 */
function extractMarketCapMap(json) {
  const list = json?.ds1 ?? json?.result?.list ?? json?.list ?? [];

  if (!Array.isArray(list)) {
    console.warn("  ⚠ 응답에서 리스트를 찾을 수 없음:", Object.keys(json));
    return new Map();
  }

  const map = new Map();
  for (const item of list) {
    const date = (item.TMPV1 || "").trim();
    const marketCap = Number(item.TMPV5 || 0);

    if (!date.match(/^\d{8}$/) || marketCap === 0) continue;
    map.set(date, marketCap);
  }

  return map;
}

// ── CSV 저장 ──

function saveCSV(rows) {
  const dir = dirname(OUTPUT_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const lines = [CSV_HEADER];
  for (const r of rows) {
    lines.push(`${toIsoDate(r.date)},${r.kospiMarketCap},${r.kosdaqMarketCap}`);
  }

  writeFileSync(OUTPUT_PATH, lines.join("\n") + "\n", "utf-8");
}

// ── 메인 ──

async function main() {
  console.log("FreeSIS 시가총액 히스토리컬 데이터 수집");
  console.log(`기간: ${toIsoDate(START_DATE)} ~ ${toIsoDate(END_DATE)}`);
  console.log(`출력: ${OUTPUT_PATH}\n`);

  const chunks = buildDateChunks(START_DATE, END_DATE);
  console.log(`총 ${chunks.length}개 구간으로 분할하여 요청합니다.\n`);

  // 날짜 → { kospiMarketCap, kosdaqMarketCap } (억원)
  const allData = new Map();

  for (let i = 0; i < chunks.length; i++) {
    const { start, end } = chunks[i];
    const label = `[${i + 1}/${chunks.length}]`;
    console.log(`${label} ${toIsoDate(start)} ~ ${toIsoDate(end)} 요청 중...`);

    try {
      // KOSPI, KOSDAQ 순차 호출 (서버 부하 방지)
      const kospiJson = await fetchChunk(MARKETS[0].objNm, start, end);
      await sleep(REQUEST_DELAY_MS);
      const kosdaqJson = await fetchChunk(MARKETS[1].objNm, start, end);

      const kospiMap = extractMarketCapMap(kospiJson);
      const kosdaqMap = extractMarketCapMap(kosdaqJson);

      // 날짜별 join (두 시장 모두 데이터가 있는 날만)
      let chunkCount = 0;
      for (const [date, kospiWon] of kospiMap) {
        if (kosdaqMap.has(date)) {
          // 원 → 억원 변환
          const kospiEok = Math.round(kospiWon / 100_000_000);
          const kosdaqEok = Math.round(kosdaqMap.get(date) / 100_000_000);
          allData.set(date, { kospiMarketCap: kospiEok, kosdaqMarketCap: kosdaqEok });
          chunkCount++;
        }
      }

      console.log(
        `${label} → KOSPI ${kospiMap.size}건, KOSDAQ ${kosdaqMap.size}건, 교집합 ${chunkCount}건 (누적: ${allData.size}건)`
      );

      // 중간 저장
      if (chunkCount > 0) {
        const sorted = [...allData.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, caps]) => ({ date, ...caps }));
        saveCSV(sorted);
      }
    } catch (err) {
      console.error(`${label} ✗ 최종 실패: ${err.message}`);
      console.error(`  수집된 ${allData.size}건까지 저장합니다.`);
      break;
    }

    // 마지막 요청이 아니면 딜레이
    if (i < chunks.length - 1) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  // 최종 정렬 & 저장
  const finalRows = [...allData.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, caps]) => ({ date, ...caps }));

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
