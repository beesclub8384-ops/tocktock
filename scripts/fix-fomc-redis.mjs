// Redis fomc-dot-plot 키 즉시 교정 스크립트
// 실행: node scripts/fix-fomc-redis.mjs

import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const correctData = {
  value: "연내 1회 인하 전망",
  change: 0,
  updatedAt: "2025-12-10",
};

await redis.set("fomc-dot-plot", correctData);

const saved = await redis.get("fomc-dot-plot");
console.log("교정 완료:", JSON.stringify(saved, null, 2));
