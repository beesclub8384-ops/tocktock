/**
 * 백필: 코스피 지수 종가(kospiIndex, 포인트)를 기존 거래대금 히스토리에 병합 추가.
 * → Redis 키 market-tradevalue:history 의 각 날짜 레코드에 kospiIndex 필드만 얹음.
 *   ⚠ 기존 kospi/kosdaq/total(거래대금) 필드는 절대 건드리지 않는다.
 *
 * 데이터 출처: KIS 국내업종 기간별시세 (inquire-daily-indexchartprice, tr_id=FHPUP02120000)
 *   - output2 각 행의 bstp_nmix_prpr = 지수 종가(포인트)
 *   - 한 번에 약 100거래일 → 종료일을 과거로 당겨가며 페이지네이션
 *
 * 사용:
 *   node scripts/backfill-market-index-value.mjs --since=19960701 --dry-run
 *   node scripts/backfill-market-index-value.mjs --since=19960701
 *
 * .mjs 는 lib/*.ts 를 직접 import 못해, lib/market-tradevalue.ts 와 동일 로직을 인라인 재현.
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
const DELAY_MS = 300; // KIS rate limit 완충

// ---- env 로드 ----
function loadEnv(name) {
  for (const f of [".env.local", ".env.vercel.local", ".env"]) {
    try {
      const m = fs.readFileSync(path.join(REPO, f), "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
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

// ---- 인자 파싱 (기본 since=19960701) ----
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const sinceArg = args.find((a) => a.startsWith("--since="));
const sinceYmd = sinceArg ? sinceArg.split("=")[1].replace(/-/g, "") : "19960701";
if (!/^\d{8}$/.test(sinceYmd)) {
  console.error(`[에러] --since 형식이 올바르지 않음(YYYYMMDD): ${sinceArg}`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 날짜 유틸 ----
const kstFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const todayKST = kstFmt.format(new Date());

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

// ---- KIS 토큰 ----
async function getToken() {
  const res = await fetch(`${KIS_BASE}/oauth2/tokenP`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey: APP_KEY, appsecret: APP_SECRET }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`토큰 발급 실패: ${data.error_description ?? JSON.stringify(data)}`);
  return data.access_token;
}

// ---- 국내업종 기간별시세 → { date, indexValue } (bstp_nmix_prpr 지수 종가) ----
async function fetchIndexHistory(token, iscd, endDate) {
  const beginDate = shiftYmd(endDate, 150);
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: "U",
    FID_INPUT_ISCD: iscd,
    FID_INPUT_DATE_1: endDate, // 종료일(최신) 앵커, DATE_2 무시됨
    FID_INPUT_DATE_2: beginDate,
    FID_PERIOD_DIV_CODE: "D",
  });
  const url = `${KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice?${params}`;
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
  if (j.rt_cd !== "0") throw new Error(`KIS index history failed: rt_cd=${j.rt_cd} msg=${j.msg1}`);
  const rows = Array.isArray(j.output2) ? j.output2 : [];
  const out = [];
  for (const r of rows) {
    const d = r.stck_bsop_date;
    if (!d || d.length !== 8) continue;
    const idx = Number(r.bstp_nmix_prpr); // 지수 종가(포인트)
    if (!Number.isFinite(idx)) continue;
    out.push({ date: toDashDate(d), indexValue: idx });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/** 코스피 지수 종가를 종료일 과거로 당겨가며 targetStart 까지 수집 → Map(date → indexValue) */
async function collectIndex(token, targetStart, todayYmd) {
  const map = new Map();
  let cursor = todayYmd;
  let page = 0;
  while (true) {
    page++;
    const recs = await fetchIndexHistory(token, KOSPI, cursor);
    if (recs.length === 0) {
      console.log(`  [코스피지수] p${page} cursor=${cursor} → 0건(소진), 중단`);
      break;
    }
    for (const r of recs) map.set(r.date, r.indexValue);
    const oldest = recs[0].date;
    console.log(`  [코스피지수] p${page} cursor=${cursor} → ${recs.length}건 (oldest ${oldest}), 누적 ${map.size}일`);
    if (oldest <= targetStart) break;
    const next = shiftYmd(oldest.replace(/-/g, ""), 1);
    if (next >= cursor) {
      console.log(`  [코스피지수] 진행 없음 → 중단`);
      break;
    }
    cursor = next;
    await sleep(DELAY_MS);
  }
  return map;
}

async function main() {
  if (!APP_KEY || !APP_SECRET) throw new Error("KIS_APP_KEY / KIS_APP_SECRET 없음");

  const todayYmd = ymd(new Date());
  const targetStart = toDashDate(sinceYmd);
  console.log(`[지수백필] since=${targetStart} 오늘=${toDashDate(todayYmd)} dryRun=${dryRun}\n`);

  const token = await getToken();
  console.log("[토큰] 발급 성공 (값 미표시)\n");

  console.log("[수집] 코스피 지수 종가(0001)");
  const idxMap = await collectIndex(token, targetStart, todayYmd);

  // 오늘(KST) 미확정 제외
  if (idxMap.has(todayKST)) {
    idxMap.delete(todayKST);
    console.log(`\n[제외] 오늘(${todayKST}) 미확정 지수값 제외됨`);
  }
  console.log(`\n[수집 완료] 지수 종가 ${idxMap.size}일`);

  // 기존 거래대금 히스토리 로드
  const existing = (await redis.get(HISTORY_KEY)) ?? [];
  console.log(`[기존] market-tradevalue:history ${existing.length}일 로드`);

  // 병합 미리보기: 기존 레코드가 있는 날짜에만 kospiIndex 얹기
  const bd = (dash) => dash; // 날짜 키 그대로
  const existingByDate = new Map(existing.map((r) => [r.date, r]));
  let willFill = 0;
  let noTradeValueSkip = 0;
  for (const date of idxMap.keys()) {
    if (existingByDate.has(date)) willFill++;
    else noTradeValueSkip++;
  }
  console.log(
    `[병합 예정] 거래대금 있는 날짜에 kospiIndex 채움: ${willFill}건 / 거래대금 없는 지수날짜(스킵): ${noTradeValueSkip}건`
  );

  // 검증 표 (기존 거래대금 레코드 기준, 지수가 있는 것만)
  const merged = existing
    .map((r) => (idxMap.has(r.date) ? { ...r, kospiIndex: idxMap.get(r.date) } : r))
    .sort((a, b) => a.date.localeCompare(b.date));
  const withIdx = merged.filter((r) => Number.isFinite(r.kospiIndex));

  const jo = (won) => (won / 1e12).toFixed(2) + "조";
  const row = (r) =>
    `  ${r.date} | kospiIndex ${String(r.kospiIndex ?? "-").padStart(9)} | kospi거래대금 ${jo(r.kospi).padStart(9)}`;
  console.log("\n[가장 오래된 3일 (지수 채워진 것)]");
  withIdx.slice(0, 3).forEach((r) => console.log(row(r)));
  console.log("[최근 3일 (지수 채워진 것)]");
  withIdx.slice(-3).forEach((r) => console.log(row(r)));

  // 이상치 자동 판정: 최근 지수 6700~6800, 옛날(1996 근처) 수백~1000
  const latestIdx = withIdx[withIdx.length - 1]?.kospiIndex;
  const oldestIdx = withIdx[0]?.kospiIndex;
  console.log(`\n[이상치 체크] 최근 지수=${latestIdx}, 가장 오래된 지수=${oldestIdx}`);
  if (!Number.isFinite(latestIdx) || latestIdx <= 0 || latestIdx > 20000) {
    throw new Error(`[비정상] 최근 코스피 지수값 이상: ${latestIdx}`);
  }
  if (!Number.isFinite(oldestIdx) || oldestIdx <= 0 || oldestIdx > 20000) {
    throw new Error(`[비정상] 옛날 코스피 지수값 이상: ${oldestIdx}`);
  }

  if (dryRun) {
    console.log("\n[dry-run] 저장 생략. 최근 지수 6700~6800, 옛날(1996) 수백~1000 인지 확인하세요.");
    return;
  }

  // 실제 저장: 기존 레코드에 kospiIndex 얹기(거래대금 필드 보존), 지수만 있고 거래대금 없는 날짜는 추가 안 함
  await redis.set(HISTORY_KEY, merged);
  const filled = merged.filter((r) => Number.isFinite(r.kospiIndex)).length;
  console.log(`\n[저장 완료] 전체 ${merged.length}일 중 kospiIndex 채워진 건수: ${filled}일`);
}

main().catch((e) => {
  console.error("[지수백필 실패]", e.message);
  process.exit(1);
});
