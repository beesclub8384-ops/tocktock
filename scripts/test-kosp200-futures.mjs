import dotenv from "dotenv";
dotenv.config({ path: ".env.vercel.local" });

const required = ["KIS_APP_KEY", "KIS_APP_SECRET", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];
for (const k of required) {
  if (!process.env[k]) {
    console.log(`❌ 환경변수 ${k} 없음`);
    process.exit(1);
  }
}
console.log("✅ 환경변수 확인됨: KIS_APP_KEY / KIS_APP_SECRET / UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN");
console.log("ℹ️  Vercel 대시보드 → Settings → Environment Variables 에 KIS_APP_KEY / KIS_APP_SECRET 도 등록되어 있어야 배포 환경에서 작동합니다.");

const { fetchKosp200FuturesMinutes } = await import("../lib/kis-client.ts");

const now = new Date();
const kst = new Date(now.getTime() + 9 * 3600 * 1000);
const y = kst.getUTCFullYear();
const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
const d = String(kst.getUTCDate()).padStart(2, "0");
const today = `${y}-${m}-${d}`;

console.log(`\n[test-kosp200-futures] date=${today} 1분봉 조회`);
const t0 = Date.now();
const candles = await fetchKosp200FuturesMinutes(today);
const ms = Date.now() - t0;

console.log(`\n건수: ${candles.length} (소요: ${ms}ms)`);
if (candles.length === 0) {
  console.log("⚠️  데이터 없음 — 오늘이 휴장일이거나 장 시작 전일 수 있음");
} else {
  const first = candles.slice(0, 3);
  const last = candles.slice(-3);
  const fmt = (c) => {
    const d = new Date(c.time);
    const kstTime = new Date(d.getTime() + 9 * 3600 * 1000);
    const hhmm = `${String(kstTime.getUTCHours()).padStart(2, "0")}:${String(kstTime.getUTCMinutes()).padStart(2, "0")}`;
    return `${hhmm} KST | O=${c.open} H=${c.high} L=${c.low} C=${c.close} V=${c.volume}`;
  };
  console.log("\n첫 3건:");
  first.forEach((c, i) => console.log(`  [${i + 1}] ${fmt(c)}`));
  console.log("\n마지막 3건:");
  last.forEach((c, i) => console.log(`  [${i + 1}] ${fmt(c)}`));
}
