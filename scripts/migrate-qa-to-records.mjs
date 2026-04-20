import { readFileSync, existsSync } from "fs";
import { Redis } from "@upstash/redis";

// 환경변수 로드 (.env.vercel.local 우선, 없으면 .env.local)
const envFile = existsSync(".env.vercel.local") ? ".env.vercel.local" : ".env.local";
const envRaw = readFileSync(envFile, "utf8");
const env = Object.fromEntries(
  envRaw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [
        l.slice(0, idx).trim(),
        l.slice(idx + 1).trim().replace(/^"|"$/g, ""),
      ];
    })
);
console.log(`[env] ${envFile} 로드`);

const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

const QA_KEY = "futures-trading:qa";
const RECORDS_KEY = "futures-trading:records";
const BACKUP_KEY = "futures-trading:qa:backup-20260420";

// ── (1) 백업 ──
console.log("\n[1/6] Q&A 원본 백업 중…");
const qaRaw = await redis.get(QA_KEY);
if (!qaRaw || !Array.isArray(qaRaw.qa)) {
  console.error("  ✗ Q&A 데이터가 비어있습니다. 중단.");
  process.exit(1);
}
const qaItems = qaRaw.qa;
console.log(`  Q&A 원본 ${qaItems.length}건 확인`);

// 이미 존재하면 덮어쓰지 않음 (멱등성)
const existingBackup = await redis.get(BACKUP_KEY);
if (existingBackup) {
  console.log(`  ⚠ 백업 키 이미 존재 (항목 ${existingBackup?.qa?.length ?? "?"}개). 덮어쓰지 않음.`);
} else {
  await redis.set(BACKUP_KEY, qaRaw);
  console.log(`  ✓ ${BACKUP_KEY} 에 ${qaItems.length}건 백업 완료`);
}

// ── (2) 매매 기록 로드 ──
console.log("\n[2/6] 매매 기록 로드 중…");
const recRaw = await redis.get(RECORDS_KEY);
if (!recRaw || !Array.isArray(recRaw.records)) {
  console.error("  ✗ 매매 기록 데이터가 비어있습니다. 중단.");
  process.exit(1);
}
const records = recRaw.records;
console.log(`  매매 기록 ${records.length}건 확인`);

// ── (3) 매칭 규칙 ──
console.log("\n[3/6] 매칭 규칙 적용 중…");

function findRecord(pred) {
  return records.find(pred);
}

const rec_0406_long_1023 = findRecord(
  (r) => r.date === "2026-04-06" && r.entryTime === "10:23"
);
const rec_0413_short = findRecord(
  (r) => r.date === "2026-04-13" && r.direction === "short"
);

console.log(`  · 2026-04-06 10:23 롱 매매: ${rec_0406_long_1023 ? "✓" : "✗ 없음"}`);
console.log(`  · 2026-04-13 숏 매매: ${rec_0413_short ? "✓" : "✗ 없음"}`);

/**
 * 매칭 규칙: 각 Q&A 제목에서 키워드 검색
 * - "쌍봉" 또는 "868.60" → 2026-04-13 숏
 * - "강하게 상승" → 2026-04-06 10:23 롱
 * - "조정" → 2026-04-06 10:23 롱
 * - "이격도" 또는 "과도" → 2026-04-06 10:23 롱
 */
function targetFor(qa) {
  const t = qa.title ?? qa.question ?? "";
  if (t.includes("쌍봉") || t.includes("868.60")) return rec_0413_short;
  if (t.includes("강하게 상승")) return rec_0406_long_1023;
  if (t.includes("조정")) return rec_0406_long_1023;
  if (t.includes("이격도") || t.includes("과도")) return rec_0406_long_1023;
  return null;
}

// ── (4) qaThreads 배열에 복사 추가 ──
console.log("\n[4/6] qaThreads 병합 중…");

function normalizeQA(raw) {
  // 옛 구조 → 새 구조로 정규화 (route.ts와 동일 로직)
  if (Array.isArray(raw.replies) && typeof raw.title === "string") {
    return {
      id: raw.id,
      title: raw.title,
      replies: raw.replies,
      createdAt: raw.createdAt,
    };
  }
  const replies = [];
  if (raw.answer && raw.answer.trim()) {
    replies.push({
      id: crypto.randomUUID(),
      author: "용태",
      content: raw.answer,
      createdAt: raw.answeredAt || raw.createdAt,
    });
  }
  return {
    id: raw.id,
    title: raw.question ?? raw.title ?? "",
    replies,
    createdAt: raw.createdAt,
  };
}

const addedCounts = new Map(); // recordId -> count
const unmatched = [];

for (const qaRawItem of qaItems) {
  const target = targetFor(qaRawItem);
  if (!target) {
    unmatched.push(qaRawItem);
    continue;
  }
  const normalized = normalizeQA(qaRawItem);

  if (!Array.isArray(target.qaThreads)) target.qaThreads = [];

  // 중복 방지: 같은 id가 이미 붙어있으면 스킵
  if (target.qaThreads.some((t) => t.id === normalized.id)) {
    console.log(`  · 스킵 (중복 id): ${normalized.id}`);
    continue;
  }

  target.qaThreads.push(normalized);
  addedCounts.set(target.id, (addedCounts.get(target.id) ?? 0) + 1);
}

// ── (5) 저장 ──
console.log("\n[5/6] 매매 기록 저장 중…");
await redis.set(RECORDS_KEY, { records });
console.log(`  ✓ ${RECORDS_KEY} 업데이트 완료`);

// ── (6) 결과 리포트 ──
console.log("\n[6/6] 마이그레이션 결과");
let idx = 0;
for (const r of records) {
  idx += 1;
  const count = addedCounts.get(r.id) ?? 0;
  if (count > 0) {
    console.log(
      `  매매 #${idx} (${r.date} ${r.entryTime} ${r.direction === "long" ? "롱" : "숏"})에 Q&A ${count}개 추가됨`
    );
    (r.qaThreads ?? []).forEach((t, i) => {
      const titlePreview = (t.title || "").slice(0, 40).replace(/\n/g, " ");
      console.log(`      ${i + 1}) ${titlePreview}${t.title.length > 40 ? "…" : ""}`);
    });
  }
}

console.log("\n── 요약 ──");
console.log(`  백업 키: ${BACKUP_KEY} (${qaItems.length}건)`);
console.log(`  원본 ${QA_KEY}: 유지 (삭제 안 함)`);
console.log(`  매칭된 Q&A: ${qaItems.length - unmatched.length} / ${qaItems.length}`);
console.log(`  매칭 실패: ${unmatched.length}건`);
unmatched.forEach((u, i) => {
  const t = u.title ?? u.question ?? "";
  console.log(`    · ${i + 1}) ${t.slice(0, 60)}${t.length > 60 ? "…" : ""}`);
});
