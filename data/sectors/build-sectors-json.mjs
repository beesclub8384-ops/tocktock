/**
 * TockTock 한국 섹터 분류 엑셀 → sectors.json 변환기.
 *
 * 사용법:
 *   node data/sectors/build-sectors-json.mjs [엑셀경로]
 *   - 인자 없으면 기본 경로(Downloads의 TockTock_한국섹터분류_v*.xlsx)를 사용.
 *   - 엑셀을 다시 깎았을 때 이 스크립트를 재실행하면 sectors.json이 갱신된다.
 *
 * 입력 시트: "분류체계" (헤더: 대분류 | 소분류 | 정의 | 대표종목 (초안·검증전) | 비고 / 논의필요)
 * 출력: data/sectors/sectors.json
 *   { version, 대분류: [ { name, 소분류: [ { name, 정의, 대표종목:[], 비고 } ] } ] }
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_INPUT =
  "C:/Users/beesc/Downloads/TockTock_한국섹터분류_v1.xlsx";
const INPUT = process.argv[2] || DEFAULT_INPUT;
const OUTPUT = path.join(__dirname, "sectors.json");
const SHEET = "분류체계";

function splitStocks(s) {
  if (!s) return [];
  // 쉼표(,) · 한국식 쉼표(，、) · 슬래시(/)는 중복표기라 콤마만 분리
  return String(s)
    .split(/[,，]/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function main() {
  if (!fs.existsSync(INPUT)) {
    console.error("입력 엑셀을 찾을 수 없음:", INPUT);
    process.exit(1);
  }
  const wb = XLSX.read(fs.readFileSync(INPUT), { type: "buffer" });
  if (!wb.SheetNames.includes(SHEET)) {
    console.error(`"${SHEET}" 시트가 없음. 시트 목록:`, wb.SheetNames);
    process.exit(1);
  }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[SHEET], {
    header: 1,
    defval: "",
  });

  // 1행 = 헤더. 컬럼 인덱스: 0 대분류 / 1 소분류 / 2 정의 / 3 대표종목 / 4 비고
  const groups = []; // 등장 순서 유지
  const byName = new Map();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const major = String(r[0] ?? "").trim();
    const minor = String(r[1] ?? "").trim();
    // 대분류·소분류가 모두 비면 스킵(빈 행)
    if (!major && !minor) continue;
    // 소분류명이 없으면 분류 항목으로 보지 않음(헤더성/주석 행 방지)
    if (!minor) continue;

    if (!byName.has(major)) {
      const g = { name: major, 소분류: [] };
      byName.set(major, g);
      groups.push(g);
    }
    byName.get(major).소분류.push({
      name: minor,
      정의: String(r[2] ?? "").trim(),
      대표종목: splitStocks(r[3]),
      비고: String(r[4] ?? "").trim(),
    });
  }

  const version = path.basename(INPUT).replace(/\.xlsx$/i, "");
  const result = { version, 대분류: groups };

  fs.mkdirSync(__dirname, { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2) + "\n", "utf8");

  // 검증 출력
  const totalMinor = groups.reduce((s, g) => s + g.소분류.length, 0);
  console.log("입력:", INPUT);
  console.log("출력:", OUTPUT);
  console.log("version:", version);
  console.log("대분류 수:", groups.length, "| 소분류 총합:", totalMinor);
  console.log("\n대분류별 소분류 수:");
  for (const g of groups) console.log(`  ${g.name}: ${g.소분류.length}개`);
  const ind = groups.find((g) => g.name === "산업재");
  console.log(
    "\n'산업재' 소분류 목록:",
    ind ? ind.소분류.map((s) => s.name).join(", ") : "(산업재 대분류 없음)"
  );
}

main();
