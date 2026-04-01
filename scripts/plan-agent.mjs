/**
 * plan-agent.mjs
 * 작업 내용을 입력받아 Anthropic API로 계획서를 생성하는 스크립트
 *
 * 사용법: node scripts/plan-agent.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";

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

const API_KEY =
  process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("ANTHROPIC_API_KEY가 설정되지 않았습니다.");
  process.exit(1);
}

// 사용자 입력 받기
function askQuestion(prompt) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

const SYSTEM_PROMPT = `너는 TockTock 프로젝트의 시니어 플래너야.

프로젝트 스택:
- Next.js 15 (Turbopack)
- TypeScript
- Upstash Redis (@upstash/redis)
- Vercel (Hobby 플랜, maxDuration 300초)
- yahoo-finance2 (v3 인스턴스 방식)
- lightweight-charts v4
- Recharts
- Anthropic API (claude-sonnet-4-20250514)

아래 작업 요청을 분석해서 계획서를 작성해줘.

계획서 형식:
## 1. 작업 목표
무엇을 달성하려는가

## 2. 구현 단계
1. [단계 설명]
2. [단계 설명]
...
각 단계는 최대한 작은 단위로 쪼갤 것

## 3. 변경될 파일 목록
- [파일 경로]: [생성/수정/삭제] — [변경 내용 한 줄 설명]

## 4. 완료 기준
- [체크 항목]

## 5. 예상 위험 요소
- [위험 요소와 대응 방안]

## 6. 실수할 수 있는 부분
- [주의할 점]

규칙:
- 한국어로 작성
- Vercel Cron은 반드시 GET
- Upstash Redis에서 JSON.stringify/parse 금지
- Next.js 15 동적 라우트 params는 Promise로 처리
- ANTHROPIC_API_KEY는 서버사이드에서만 사용
- 단위(원/억원/백만원) 명시`;

async function main() {
  console.log("=".repeat(60));
  console.log("TockTock 작업 계획서 생성기");
  console.log("=".repeat(60));
  console.log("");

  const task = await askQuestion("작업 내용을 입력하세요:\n> ");

  if (!task.trim()) {
    console.error("작업 내용이 비어있습니다.");
    process.exit(1);
  }

  console.log("\n계획서 작성 중...\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: task }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`API 오류 (${res.status}):`, err);
    process.exit(1);
  }

  const data = await res.json();
  const plan =
    data.content
      ?.filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n") || "계획서 생성 실패";

  console.log("=".repeat(60));
  console.log("계획서");
  console.log("=".repeat(60));
  console.log(plan);
  console.log("=".repeat(60));

  // CURRENT_TASK.md로 저장
  const taskMd = `# 현재 작업: ${task.slice(0, 80)}

## 작업 요청
${task}

## 계획서
${plan}

## 완료된 단계
- [ ] 작업 시작 전 관련 파일 읽기
- [ ] (계획서 단계에 따라 채워 넣을 것)

## 현재 상태
계획서 작성 완료. 사용자 확인 대기 중.

## 주의사항
계획서의 "실수할 수 있는 부분" 항목 참고.
`;

  const outPath = resolve(ROOT, "CURRENT_TASK.md");
  writeFileSync(outPath, taskMd, "utf-8");
  console.log(`\n결과 저장됨: ${outPath}`);
}

main().catch((err) => {
  console.error("오류 발생:", err);
  process.exit(1);
});
