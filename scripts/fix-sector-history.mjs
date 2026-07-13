/**
 * 일회성: sector-history:정유 에서 오염된 점(2026-07-13, 금요일 등락률 중복 반영) 제거 후 전체 재계산.
 * 사용: node scripts/fix-sector-history.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Redis } from "@upstash/redis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const SECTOR = "정유";
const BAD_DATE = "2026-07-13";

function loadEnv(name) {
  for (const f of [".env.vercel.local", ".env.local", ".env"]) {
    try {
      const m = fs.readFileSync(path.join(REPO, f), "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
      if (m) return m[1].trim().replace(/^["']|["']$/g, "").replace(/\r/g, "");
    } catch {}
  }
  return null;
}
const redis = new Redis({
  url: loadEnv("UPSTASH_REDIS_REST_URL"),
  token: loadEnv("UPSTASH_REDIS_REST_TOKEN"),
});
const round4 = (n) => Math.round(n * 1e4) / 1e4;

async function main() {
  const raw = await redis.get(`sector-history:${SECTOR}`);
  const h = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!h || !Array.isArray(h.points)) throw new Error(`sector-history:${SECTOR} 없음`);

  const before = h.points.length;

  // 오염 점 제거 + 날짜 오름차순
  const points = h.points
    .filter((p) => p.date !== BAD_DATE)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // 전체 지수 재계산 (첫날 100)
  let idx = 100;
  for (let i = 0; i < points.length; i++) {
    idx = i === 0 ? 100 : idx * (1 + points[i].ret / 100);
    points[i].index = round4(idx);
  }

  const next = { ...h, points, updatedAt: new Date().toISOString() };
  await redis.set(`sector-history:${SECTOR}`, next);

  const final = points[points.length - 1];
  console.log("===== fix-sector-history 결과 =====");
  console.log(`제거 전 points: ${before}`);
  console.log(`제거 후 points: ${points.length} (제거: ${before - points.length}개, 대상 ${BAD_DATE})`);
  console.log("마지막 5개 점:");
  for (const p of points.slice(-5)) console.log(`  ${p.date}  ret ${p.ret}  index ${p.index}`);
  console.log(`최종 지수값: ${final?.index}`);
  console.log(`5년 누적수익률: ${round4((final?.index / 100 - 1) * 100)}%`);
  console.log(`Redis 저장: sector-history:${SECTOR}`);
}

main().catch((e) => {
  console.error("fix 실패:", e);
  process.exit(1);
});
