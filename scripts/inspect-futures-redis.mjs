import { readFileSync } from "fs";
import { Redis } from "@upstash/redis";

// .env.local 로드
const envRaw = readFileSync(".env.local", "utf8");
const env = Object.fromEntries(
  envRaw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^"|"$/g, "")];
    })
);

const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

function fmt(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

const qa = await redis.get("futures-trading:qa");
const rec = await redis.get("futures-trading:records");
const msg = await redis.get("futures-trading:messages");

console.log("═══ Q&A (futures-trading:qa) ═══");
if (!qa?.qa?.length) {
  console.log("(없음)");
} else {
  qa.qa.forEach((item, i) => {
    console.log(`\n[${i + 1}] id=${item.id}`);
    console.log(`  createdAt: ${fmt(item.createdAt)}`);
    console.log(`  title/question: ${item.title ?? item.question ?? "(빈 값)"}`);
    if (Array.isArray(item.replies)) {
      console.log(`  replies(${item.replies.length}):`);
      item.replies.forEach((r, j) => {
        console.log(`    ${j + 1}) [${r.author}] ${fmt(r.createdAt)} - ${r.content}`);
      });
    } else {
      console.log(`  answer: ${item.answer || "(미답변)"}`);
      console.log(`  answeredAt: ${fmt(item.answeredAt)}`);
    }
  });
}

console.log("\n═══ 매매 기록 (futures-trading:records) ═══");
if (!rec?.records?.length) {
  console.log("(없음)");
} else {
  const sorted = [...rec.records].sort((a, b) => {
    const c = a.date.localeCompare(b.date);
    return c !== 0 ? c : a.entryTime.localeCompare(b.entryTime);
  });
  sorted.forEach((r, i) => {
    const dir = r.direction === "long" ? "롱" : "숏";
    const pnlStr = r.pnl >= 0 ? `+${r.pnl.toLocaleString()}` : r.pnl.toLocaleString();
    console.log(
      `[${i + 1}] ${r.date} ${r.entryTime}→${r.exitTime} ${dir} ${r.entryPoint}→${r.exitPoint} (${r.contracts}계약, ${pnlStr}원) id=${r.id}`
    );
    if (r.memo) console.log(`     memo: ${r.memo}`);
    console.log(`     createdAt: ${fmt(r.createdAt)}`);
  });
}

console.log("\n═══ 자유전달판 메시지 수 ═══");
console.log(`futures-trading:messages: ${msg?.messages?.length ?? 0}건`);

// 시간 근접도 매칭 후보 출력
console.log("\n═══ Q&A ↔ 매매 기록 시간 근접도 (Q&A 작성일 기준 ±1일) ═══");
if (!qa?.qa?.length || !rec?.records?.length) {
  console.log("(매칭 불가 - 한쪽 데이터 없음)");
} else {
  for (const item of qa.qa) {
    const qDate = new Date(item.createdAt);
    const qDateStr = qDate.toISOString().slice(0, 10);
    const title = item.title ?? item.question ?? "(빈 제목)";
    console.log(`\n▶ Q&A [${fmt(item.createdAt)}] "${title}"`);

    const candidates = rec.records
      .map((r) => {
        const rDate = new Date(`${r.date}T${r.entryTime}:00+09:00`);
        const diffHours = Math.abs(qDate.getTime() - rDate.getTime()) / 3_600_000;
        return { r, diffHours };
      })
      .filter((x) => x.diffHours <= 48)
      .sort((a, b) => a.diffHours - b.diffHours)
      .slice(0, 3);

    if (candidates.length === 0) {
      const sameDay = rec.records.filter((r) => r.date === qDateStr);
      if (sameDay.length > 0) {
        sameDay.forEach((r) =>
          console.log(
            `    · 같은 날: ${r.date} ${r.entryTime} ${r.direction === "long" ? "롱" : "숏"} ${r.pnl >= 0 ? "+" : ""}${r.pnl.toLocaleString()}원`
          )
        );
      } else {
        console.log("    · 48시간 이내 매매 기록 없음");
      }
    } else {
      candidates.forEach(({ r, diffHours }) =>
        console.log(
          `    · ${r.date} ${r.entryTime} ${r.direction === "long" ? "롱" : "숏"} ${r.entryPoint}→${r.exitPoint} ${r.pnl >= 0 ? "+" : ""}${r.pnl.toLocaleString()}원 (차이 ${diffHours.toFixed(1)}h)`
        )
      );
    }
  }
}
