/**
 * monitor-agent.mjs
 * 작업 이력을 누적 기록하고, 누적 로그를 분석하는 스크립트
 *
 * 사용법: node scripts/monitor-agent.mjs
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const LOGS_DIR = resolve(ROOT, "logs");
const LOG_FILE = resolve(LOGS_DIR, "work-log.jsonl");

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

// 파일 읽기 헬퍼
function readIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, "utf-8");
}

// KST 날짜시간 문자열
function getKSTDateTime() {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

// eval-result.md에서 점수와 합격여부 파싱
function parseEvalResult(content) {
  if (!content) return { totalScore: null, pass: null, failedAreas: [] };

  const scoreMatch = content.match(/총점[:\s]*(\d+)/);
  const totalScore = scoreMatch ? parseInt(scoreMatch[1]) : null;

  const passMatch = content.match(/합격 여부[:\s]*(✅|❌)/);
  const pass = passMatch ? passMatch[1] === "✅" : null;

  const failedAreas = [];
  const areaPattern = /### \d+\.\s+(.+?):\s*(\d+)\/100/g;
  let match;
  while ((match = areaPattern.exec(content)) !== null) {
    if (parseInt(match[2]) < 70) {
      failedAreas.push(`${match[1]}: ${match[2]}점`);
    }
  }

  return { totalScore, pass, failedAreas };
}

// review-result.md에서 이슈 수 파싱
function parseReviewIssues(content) {
  if (!content) return 0;
  const redCount = (content.match(/🔴/g) || []).length;
  const yellowCount = (content.match(/🟡/g) || []).length;
  const greenCount = (content.match(/🟢/g) || []).length;
  return redCount + yellowCount + greenCount;
}

// CURRENT_TASK.md에서 작업 목표 파싱
function parseTaskGoal(content) {
  if (!content) return "알 수 없음";
  const match = content.match(/# 현재 작업:\s*(.+)/);
  return match ? match[1].trim() : "알 수 없음";
}

async function main() {
  console.log("=".repeat(60));
  console.log("TockTock 작업 모니터링");
  console.log("=".repeat(60));
  console.log("");

  // 1. 파일 읽기
  const evalContent = readIfExists(resolve(ROOT, "eval-result.md"));
  const reviewContent = readIfExists(resolve(ROOT, "review-result.md"));
  const taskContent = readIfExists(resolve(ROOT, "CURRENT_TASK.md"));

  if (!evalContent && !reviewContent && !taskContent) {
    console.error("⚠️  eval-result.md, review-result.md, CURRENT_TASK.md 파일이 모두 없습니다.");
    process.exit(1);
  }

  // 2. 로그 기록
  if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
  }

  const evalParsed = parseEvalResult(evalContent);
  const issueCount = parseReviewIssues(reviewContent);
  const taskGoal = parseTaskGoal(taskContent);

  const logEntry = {
    datetime: getKSTDateTime(),
    taskGoal,
    reviewIssues: issueCount,
    totalScore: evalParsed.totalScore,
    pass: evalParsed.pass,
    failedAreas: evalParsed.failedAreas,
  };

  appendFileSync(LOG_FILE, JSON.stringify(logEntry) + "\n", "utf-8");
  console.log("로그 기록 완료:", LOG_FILE);
  console.log("  →", JSON.stringify(logEntry));
  console.log("");

  // 3. 누적 로그 읽기
  const allLogs = readFileSync(LOG_FILE, "utf-8").trim();
  const logCount = allLogs.split("\n").length;

  if (logCount < 1) {
    console.log("누적 로그가 부족합니다. 최소 1건 이상 필요합니다.");
    process.exit(0);
  }

  console.log(`누적 로그 ${logCount}건 분석 중...\n`);

  // 4. Anthropic API 호출
  const SYSTEM_PROMPT = `너는 TockTock 프로젝트의 관측 분석가야.

누적된 작업 이력(JSONL 형식)을 보고 아래를 분석해줘.

분석 항목:
1. **자주 반복되는 실패 패턴**: 어떤 유형의 실패가 반복되는가?
2. **점수가 낮은 평가 항목**: 어떤 영역이 지속적으로 약한가?
3. **CLAUDE.md에 추가하면 좋을 규칙**: 반복 실수를 방지할 수 있는 규칙 제안
4. **개선 추천사항 3가지**: 우선순위 높은 순서로

한국어로 작성해줘.
로그 건수가 1~2건이면 데이터가 부족하다고 솔직히 말하고, 있는 데이터로 가능한 분석만 해줘.`;

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
      messages: [
        {
          role: "user",
          content: `## 누적 작업 이력 (${logCount}건)\n\n\`\`\`jsonl\n${allLogs}\n\`\`\``,
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`API 오류 (${res.status}):`, err);
    process.exit(1);
  }

  const data = await res.json();
  const analysis =
    data.content
      ?.filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n") || "분석 생성 실패";

  console.log("=".repeat(60));
  console.log("모니터링 분석 결과");
  console.log("=".repeat(60));
  console.log(analysis);
  console.log("=".repeat(60));

  const outPath = resolve(ROOT, "monitor-result.md");
  writeFileSync(outPath, analysis, "utf-8");
  console.log(`\n결과 저장됨: ${outPath}`);
}

main().catch((err) => {
  console.error("오류 발생:", err);
  process.exit(1);
});
