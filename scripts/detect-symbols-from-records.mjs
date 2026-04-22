import dotenv from "dotenv";
dotenv.config({ path: ".env.vercel.local" });

const required = ["ANTHROPIC_API_KEY", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];
for (const k of required) {
  if (!process.env[k]) {
    console.log(`❌ 환경변수 ${k} 없음`);
    process.exit(1);
  }
}

const { detectNewSymbols } = await import("../lib/futures-claude-analyzer.ts");
const { loadRecords, loadDynamicSymbols, addDynamicSymbol } = await import("../lib/futures-trading-store.ts");
const { MARKET_SYMBOLS } = await import("../lib/futures-market-data.ts");

console.log("=== detect-symbols-from-records ===\n");

const records = await loadRecords();
console.log(`총 매매 기록: ${records.length}개`);

let dynList = await loadDynamicSymbols();
console.log(`기존 동적 심볼: ${dynList.length}개`);
console.log("기본 심볼:", MARKET_SYMBOLS.join(", "));
console.log();

const summary = [];
let totalAdded = 0;

for (let i = 0; i < records.length; i++) {
  const r = records[i];
  const inputs = [];
  if (r.memo?.trim()) inputs.push({ kind: "memo", text: r.memo });
  if (Array.isArray(r.qaThreads)) {
    for (const thread of r.qaThreads) {
      for (const reply of thread.replies ?? []) {
        if (reply.author === "용태" && reply.content?.trim()) {
          inputs.push({ kind: `reply(${thread.title.slice(0, 24)})`, text: reply.content });
        }
      }
    }
  }
  if (inputs.length === 0) continue;

  console.log(`──── ${i + 1}/${records.length} ${r.date} id=${r.id.slice(0, 8)} (입력 ${inputs.length}개) ────`);

  for (const inp of inputs) {
    const existing = [...MARKET_SYMBOLS, ...dynList.map((d) => d.symbol)];
    let detected = [];
    try {
      detected = await detectNewSymbols(inp.text, existing);
    } catch (err) {
      console.log(`  [${inp.kind}] 감지 실패:`, err?.message ?? err);
      continue;
    }
    if (detected.length === 0) {
      continue;
    }
    console.log(`  [${inp.kind}] 감지: ${detected.map((d) => d.symbol).join(", ")}`);
    for (const ds of detected) {
      const item = {
        id: crypto.randomUUID(),
        symbol: ds.symbol,
        name: ds.name,
        source: ds.source,
        addedAt: new Date().toISOString(),
        addedFrom: r.id,
        mentionedText: ds.mentionedText,
      };
      const added = await addDynamicSymbol(item);
      if (added) {
        totalAdded++;
        dynList.push(item);
        summary.push({ recordId: r.id, date: r.date, kind: inp.kind, symbol: ds.symbol, name: ds.name });
        console.log(`     + 추가: ${ds.symbol} (${ds.name}) — "${ds.mentionedText.slice(0, 50)}"`);
      } else {
        console.log(`     · 중복 스킵: ${ds.symbol}`);
      }
    }
  }
}

console.log("\n=== 요약 ===");
console.log(`기록 처리: ${records.length}개 / 신규 심볼 추가: ${totalAdded}개`);
if (summary.length) {
  console.log("\n추가된 심볼 목록:");
  for (const s of summary) {
    console.log(`  - ${s.symbol} (${s.name}) ← ${s.date} ${s.kind}`);
  }
}

const finalList = await loadDynamicSymbols();
console.log(`\n최종 동적 심볼: ${finalList.length}개`);
finalList.forEach((d, i) => console.log(`  [${i + 1}] ${d.symbol} (${d.name}) — added ${d.addedAt.slice(0, 10)}`));
