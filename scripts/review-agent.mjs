/**
 * review-agent.mjs
 * git diff HEAD~1 변경사항을 Anthropic API로 코드 리뷰하는 스크립트
 *
 * 사용법: node scripts/review-agent.mjs
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// .env 파일에서 환경변수 로드 (존재하는 파일만)
function loadEnvFile(fileName) {
  try {
    const envPath = resolve(ROOT, fileName);
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // 파일 없으면 무시
  }
}

loadEnvFile(".env.vercel.local");
loadEnvFile(".env.local");

const API_KEY = process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("ANTHROPIC_API_KEY가 설정되지 않았습니다.");
  process.exit(1);
}

// git diff 가져오기
let diff;
try {
  diff = execSync("git diff HEAD~1", { cwd: ROOT, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
} catch (e) {
  console.error("git diff 실행 실패:", e.message);
  process.exit(1);
}

if (!diff.trim()) {
  console.log("변경사항이 없습니다.");
  process.exit(0);
}

// diff가 너무 길면 잘라내기 (API 토큰 제한)
const MAX_DIFF_LENGTH = 100_000;
const truncated = diff.length > MAX_DIFF_LENGTH;
const diffContent = truncated ? diff.slice(0, MAX_DIFF_LENGTH) + "\n\n... (diff truncated)" : diff;

const systemPrompt = `너는 TockTock 프로젝트의 시니어 코드 리뷰어야.
이 프로젝트는 Next.js 15, TypeScript, Upstash Redis(@upstash/redis) 기반이야.

아래 git diff 변경사항을 검토해서 문제를 찾아줘.

확인할 것:
- 버그 가능성 (로직 오류, off-by-one, null/undefined 등)
- 무음 실패 (에러 없이 잘못된 결과를 내는 패턴)
- 타입 오류 (TypeScript 타입 불일치, any 남용 등)
- 모바일/PC 레이아웃 문제 (반응형 깨짐, overflow 등)
- CLAUDE.md 규칙 위반:
  - Vercel Cron 핸들러가 POST로 되어있으면 안 됨 (GET이어야 함)
  - Next.js 15 동적 라우트 params는 Promise로 처리해야 함
  - Upstash Redis에 JSON.stringify 사용하면 안 됨
  - 금액 단위(원/억원/백만원) 주석이 빠져있으면 안 됨

규칙:
- 문제 없으면 "✅ 이상 없음"으로 끝내줘
- 문제 있으면 파일명과 줄 번호와 함께 구체적으로 알려줘
- 한국어로 답변해줘`;

const userMessage = `다음은 git diff HEAD~1 결과입니다:\n\n\`\`\`diff\n${diffContent}\n\`\`\``;

// Anthropic API 호출
async function callAnthropic() {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API 오류 (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

try {
  console.log("코드 리뷰 중...\n");
  const review = await callAnthropic();

  console.log("=".repeat(60));
  console.log("코드 리뷰 결과");
  console.log("=".repeat(60));
  console.log(review);
  console.log("=".repeat(60));

  // review-result.md로 저장
  const output = `# 코드 리뷰 결과\n\n_생성 시각: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}_\n\n${review}\n`;
  const outputPath = resolve(ROOT, "review-result.md");
  writeFileSync(outputPath, output, "utf-8");
  console.log(`\n결과 저장됨: ${outputPath}`);
} catch (e) {
  console.error("리뷰 실패:", e.message);
  process.exit(1);
}
