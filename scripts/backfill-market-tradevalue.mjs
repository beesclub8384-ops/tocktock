/**
 * 백필: 코스피/코스닥 시장 일별 거래대금 (KRX 정규장 기준, NXT 미포함)
 * → Redis 키 market-tradevalue:history 에 [{ date, kospi, kosdaq, total }] (원 단위) 저장
 *
 * 데이터 출처: KIS 국내업종 기간별시세 (inquire-daily-indexchartprice, tr_id=FHPUP02120000)
 *   - KIS는 한 번에 약 100거래일까지 반환 → 종료일을 과거로 당겨가며 페이지네이션
 *   - acml_tr_pbmn 단위 백만원 → 원 환산 (× 1_000_000)
 *
 * 사용:
 *   node scripts/backfill-market-tradevalue.mjs --dry-run        # 저장 없이 검증만
 *   node scripts/backfill-market-tradevalue.mjs --years=3        # 3년치 저장
 *
 * .mjs 는 lib/*.ts 를 직접 import 할 수 없어, lib/market-tradevalue.ts 와 동일한
 * 로직(토큰 발급/fetchIndexHistory/save)을 인라인으로 재현한다. (기존 kis-*.mjs 관례)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Redis } from "@upstash/redis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");

const KIS_BASE = "https://openapi.koreainvestment.com:9443";
const HISTORY_KEY = "market-tradevalue:history";
const KOSPI = "0001";
const KOSDAQ = "1001";
const DELAY_MS = 250; // KIS rate limit 완충

// ---- env 로드 (.env.local 우선, 없으면 .env.vercel.local) ----
function loadEnv(name) {
  for (const f of [".env.local", ".env.vercel.local", ".env"]) {
    try {
      const m = fs
        .readFileSync(path.join(REPO, f), "utf8")
        .match(new RegExp(`^${name}=(.*)$`, "m"));
      if (m) return m[1].trim().replace(/^["']|["']$/g, "").replace(/\r/g, "");
    } catch {}
  }
  return null;
}

const APP_KEY = loadEnv("KIS_APP_KEY");
const APP_SECRET = loadEnv("KIS_APP_SECRET");
const redis = new Redis({
  url: loadEnv("UPSTASH_REDIS_REST_URL"),
  token: loadEnv("UPSTASH_REDIS_REST_TOKEN"),
});

// ---- 인자 파싱 ----
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const yearsArg = args.find((a) => a.startsWith("--years="));
const years = yearsArg ? Number(yearsArg.split("=")[1]) : 3;
if (!Number.isFinite(years) || years <= 0) {
  console.error(`[에러] --years 값이 올바르지 않음: ${yearsArg}`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 날짜 유틸 ----
function ymd(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
function toDashDate(yyyymmdd) {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}
function shiftYmd(yyyymmdd, daysBefore) {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - daysBefore);
  return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, "0")}${String(
    dt.getUTCDate()
  ).padStart(2, "0")}`;
}

// ---- KIS 토큰 (인라인) ----
async function getToken() {
  const res = await fetch(`${KIS_BASE}/oauth2/tokenP`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: APP_KEY,
      appsecret: APP_SECRET,
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`토큰 발급 실패: ${data.error_description ?? JSON.stringify(data)}`);
  }
  return data.access_token;
}

// ---- 국내업종 기간별시세 (인라인, lib/market-tradevalue.ts 와 동일 로직) ----
async function fetchIndexHistory(token, iscd, endDate) {
  // ⚠ FID_INPUT_DATE_1 = 종료일(최신) 앵커, DATE_2 는 무시됨 (probe-kis-daterange.mjs 실측)
  const beginDate = shiftYmd(endDate, 150);
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: "U",
    FID_INPUT_ISCD: iscd,
    FID_INPUT_DATE_1: endDate, // 종료일(최신) 앵커
    FID_INPUT_DATE_2: beginDate,
    FID_PERIOD_DIV_CODE: "D",
  });
  const url = `${KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice?${params.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: APP_KEY,
      appsecret: APP_SECRET,
      tr_id: "FHPUP02120000",
      custtype: "P",
    },
  });
  if (!res.ok) throw new Error(`KIS index history HTTP ${res.status}`);
  const j = await res.json();
  if (j.rt_cd !== "0") {
    throw new Error(`KIS index history failed: rt_cd=${j.rt_cd} msg=${j.msg1}`);
  }
  const rows = Array.isArray(j.output2) ? j.output2 : [];
  const out = [];
  for (const r of rows) {
    const d = r.stck_bsop_date;
    if (!d || d.length !== 8) continue;
    const pbmn = Number(r.acml_tr_pbmn); // 백만원
    if (!Number.isFinite(pbmn)) continue;
    out.push({ date: toDashDate(d), tradeValue: pbmn * 1_000_000 }); // 원
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/** 한 시장(iscd)을 종료일을 과거로 당겨가며 targetStart 까지 수집 → Map(date → 원) */
async function collectMarket(token, iscd, label, targetStart, todayYmd) {
  const map = new Map();
  let cursor = todayYmd;
  let page = 0;
  while (true) {
    page++;
    const recs = await fetchIndexHistory(token, iscd, cursor);
    if (recs.length === 0) {
      console.log(`  [${label}] p${page} cursor=${cursor} → 0건, 중단`);
      break;
    }
    for (const r of recs) map.set(r.date, r.tradeValue);
    const oldest = recs[0].date; // 오름차순 정렬됨
    console.log(
      `  [${label}] p${page} cursor=${cursor} → ${recs.length}건 (oldest ${oldest}), 누적 ${map.size}일`
    );
    if (oldest <= targetStart) break;
    // 다음 종료일 = 가장 오래된 날짜 하루 전
    const oldestYmd = oldest.replace(/-/g, "");
    const next = shiftYmd(oldestYmd, 1);
    if (next >= cursor) {
      console.log(`  [${label}] 진행 없음(cursor 동일) → 중단`);
      break;
    }
    cursor = next;
    await sleep(DELAY_MS);
  }
  return map;
}

function fmtWon(n) {
  return n.toLocaleString("en-US");
}
function toJoWon(n) {
  return (n / 1e12).toFixed(2); // 원 → 조원
}

async function main() {
  if (!APP_KEY || !APP_SECRET) throw new Error("KIS_APP_KEY / KIS_APP_SECRET 없음");

  const now = new Date();
  const todayYmd = ymd(now);
  const startDt = new Date(now);
  startDt.setFullYear(startDt.getFullYear() - years);
  const targetStart = `${startDt.getFullYear()}-${String(startDt.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(startDt.getDate()).padStart(2, "0")}`;

  console.log(
    `[백필] years=${years} 목표시작=${targetStart} 오늘=${toDashDate(todayYmd)} dryRun=${dryRun}`
  );

  const token = await getToken();
  console.log("[토큰] 발급 성공 (값 미표시)\n");

  console.log("[수집] 코스피(0001)");
  const kospiMap = await collectMarket(token, KOSPI, "코스피", targetStart, todayYmd);
  await sleep(DELAY_MS);
  console.log("\n[수집] 코스닥(1001)");
  const kosdaqMap = await collectMarket(token, KOSDAQ, "코스닥", targetStart, todayYmd);

  // 날짜별 병합
  const dateSet = new Set([...kospiMap.keys(), ...kosdaqMap.keys()]);
  const records = [];
  for (const date of dateSet) {
    if (date < targetStart) continue; // 목표 구간만
    const kospi = kospiMap.get(date) ?? 0;
    const kosdaq = kosdaqMap.get(date) ?? 0;
    records.push({ date, kospi, kosdaq, total: kospi + kosdaq });
  }
  records.sort((a, b) => a.date.localeCompare(b.date));

  console.log(
    `\n[병합] 총 ${records.length}일 (${records[0]?.date ?? "-"} ~ ${
      records[records.length - 1]?.date ?? "-"
    })`
  );

  // 최근 5일 검증 표
  const last5 = records.slice(-5);
  console.log("\n================ 최근 5일 (검증) ================");
  console.log("날짜        | 코스피(원)              | 코스피(조원) | 코스닥(원)              | 코스닥(조원)");
  console.log("-".repeat(92));
  for (const r of last5) {
    console.log(
      `${r.date} | ${fmtWon(r.kospi).padStart(22)} | ${toJoWon(r.kospi).padStart(10)} | ${fmtWon(
        r.kosdaq
      ).padStart(22)} | ${toJoWon(r.kosdaq).padStart(10)}`
    );
  }

  // 이상치 자동 판정 (가장 최근일 기준)
  const latest = records[records.length - 1];
  if (!latest || latest.kospi <= 0 || latest.kosdaq <= 0) {
    throw new Error(
      `[비정상] 최근일 거래대금이 0 또는 없음 (kospi=${latest?.kospi}, kosdaq=${latest?.kosdaq})`
    );
  }

  if (dryRun) {
    console.log("\n[dry-run] Redis 저장 생략. 위 값이 정상(코스피 20~30조, 코스닥 4~8조)인지 확인하세요.");
    return;
  }

  // 저장 (lib saveTradeValueHistory 와 동일: 기존과 날짜 병합 후 정렬 저장)
  const existing = (await redis.get(HISTORY_KEY)) ?? [];
  const byDate = new Map();
  for (const p of existing) byDate.set(p.date, p);
  for (const p of records) byDate.set(p.date, p);
  const merged = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  await redis.set(HISTORY_KEY, merged);

  console.log(
    `\n[저장 완료] ${HISTORY_KEY} 총 ${merged.length}일 (${merged[0].date} ~ ${
      merged[merged.length - 1].date
    })`
  );
}

main().catch((e) => {
  console.error("[백필 실패]", e.message);
  process.exit(1);
});
