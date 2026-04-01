/**
 * eval-agent.mjs
 * CURRENT_TASK.md와 review-result.md를 읽어 작업 결과를 평가하는 스크립트
 *
 * 사용법: node scripts/eval-agent.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
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

const API_KEY =
  process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("ANTHROPIC_API_KEY가 설정되지 않았습니다.");
  process.exit(1);
}

// 필수 파일 확인
const taskPath = resolve(ROOT, "CURRENT_TASK.md");
const reviewPath = resolve(ROOT, "review-result.md");

if (!existsSync(taskPath)) {
  console.error("⚠️  CURRENT_TASK.md 파일이 없습니다. 먼저 plan-agent.mjs를 실행하세요.");
  process.exit(1);
}

if (!existsSync(reviewPath)) {
  console.error("⚠️  review-result.md 파일이 없습니다. 먼저 review-agent.mjs를 실행하세요.");
  process.exit(1);
}

const taskContent = readFileSync(taskPath, "utf-8");
const reviewContent = readFileSync(reviewPath, "utf-8");

const SYSTEM_PROMPT = `너는 TockTock 프로젝트의 품질 평가자야.

아래 두 가지 문서를 보고 작업 결과를 평가해줘.

평가 기준 (각 항목 0~100점):

1. **코드 품질** (25점 배점)
   - 타입 안전성 (TypeScript 타입 정의, any 남용 여부)
   - 에러 처리 (try/catch, 엣지 케이스 대응)
   - 코드 구조 (가독성, 중복 제거, 관심사 분리)

2. **UI 품질** (25점 배점)
   - 모바일 반응형 대응
   - PC 레이아웃 정상 여부
   - 로딩/에러/빈 상태 처리

3. **데이터 처리 정확성** (25점 배점)
   - 단위 변환 정확성 (원/억원/백만원)
   - 계산 로직 검증
   - Redis 사용 규칙 준수 (JSON.stringify 금지)
   - 외부 API 에러 핸들링

4. **완료 기준 충족** (25점 배점)
   - 계획서(CURRENT_TASK.md)의 완료 기준 달성 여부
   - 리뷰(review-result.md)에서 지적된 이슈 해결 여부

출력 형식:

## 평가 결과

### 1. 코드 품질: XX/100
[구체적 평가 내용]

### 2. UI 품질: XX/100
[구체적 평가 내용]

### 3. 데이터 처리 정확성: XX/100
[구체적 평가 내용]

### 4. 완료 기준 충족: XX/100
[구체적 평가 내용]

---

### 총점: XX/100
### 합격 여부: ✅ 합격 / ❌ 불합격 (80점 이상 합격)

### 미흡한 부분
- [구체적으로 무엇을 어떻게 개선해야 하는지]

한국어로 작성해줘.`;

async function main() {
  console.log("=".repeat(60));
  console.log("TockTock 작업 결과 평가");
  console.log("=".repeat(60));
  console.log("");
  console.log("평가 중...\n");

  const userMessage = `## 작업 계획서 (CURRENT_TASK.md)

${taskContent}

---

## 코드 리뷰 결과 (review-result.md)

${reviewContent}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`API 오류 (${res.status}):`, err);
    process.exit(1);
  }

  const data = await res.json();
  const evaluation =
    data.content
      ?.filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n") || "평가 생성 실패";

  console.log("=".repeat(60));
  console.log("평가 결과");
  console.log("=".repeat(60));
  console.log(evaluation);
  console.log("=".repeat(60));

  const outPath = resolve(ROOT, "eval-result.md");
  writeFileSync(outPath, evaluation, "utf-8");
  console.log(`\n결과 저장됨: ${outPath}`);
}

main().catch((err) => {
  console.error("오류 발생:", err);
  process.exit(1);
});
