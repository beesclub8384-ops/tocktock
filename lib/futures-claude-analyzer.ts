import Anthropic from "@anthropic-ai/sdk";
import type { QAThread, QuantifiedCondition } from "@/lib/types/futures-trading";

const MODEL = "claude-sonnet-4-5-20250929";

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.");
  }
  return new Anthropic({ apiKey });
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
}

function formatQuantifiedList(list: QuantifiedCondition[]): string {
  if (!list.length) return "(없음)";
  return list
    .map((q) => {
      const v = q.value ? `= ${q.value}` : "";
      const st = q.status === "completed" ? "완료" : q.status === "impossible" ? "불가" : "진행중";
      return `- [${st}] ${q.condition} ${v}`.trim();
    })
    .join("\n");
}

// ─────────────────────────────────────────────────────────────
// 4-1. 매매 메모에서 수치화 필요 조건 찾아 질문 목록 생성
// ─────────────────────────────────────────────────────────────

export interface GeneratedThread {
  title: string;
}

const GENERATE_SYSTEM_PROMPT = `당신은 선물 매매 로직을 자동화하기 위해 트레이더의 매매 메모에서 수치화가 필요한 주관적 조건을 찾아 질문을 생성하는 역할입니다.
이미 수치화된 조건 목록이 주어지면 중복 질문은 절대 생성하지 않습니다.
각 질문은 독립적인 하나의 주제만 다룹니다.
AI, 인공지능 관련 문구는 절대 사용하지 않습니다.
반드시 JSON 배열만 반환합니다. 마크다운 코드블록 없이 순수 JSON만.`;

export async function generateQAThreads(
  memo: string,
  quantifiedList: QuantifiedCondition[]
): Promise<GeneratedThread[]> {
  const trimmed = (memo || "").trim();
  if (!trimmed) return [];

  const client = getClient();
  const userPrompt = `매매 메모: ${trimmed}
이미 수치화된 조건: ${formatQuantifiedList(quantifiedList)}
위 메모에서 자동화를 위해 수치화가 필요한 주관적 조건을 찾아 독립적인 질문 목록을 JSON으로 반환하세요.
형식: [{ "title": "질문 내용" }, ...]
질문이 없으면 빈 배열 []을 반환하세요.`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: GENERATE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = message.content[0];
  if (!block || block.type !== "text") return [];

  try {
    const parsed = JSON.parse(stripCodeFence(block.text));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const title = typeof item?.title === "string" ? item.title.trim() : "";
        return title ? { title } : null;
      })
      .filter((x): x is GeneratedThread => x !== null);
  } catch (err) {
    console.error("[futures-claude-analyzer] generateQAThreads parse error:", err);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// 4-2. 용태형 답변 분석 → 다음 액션 결정
// ─────────────────────────────────────────────────────────────

export type AnalyzeAction = "completed" | "follow_up" | "impossible";

export interface AnalyzeReplyResult {
  action: AnalyzeAction;
  followUpQuestion?: string;
  value?: string;
  reason: string;
}

const ANALYZE_SYSTEM_PROMPT = `당신은 선물 매매 로직 수치화를 위한 질문/답변 분석가입니다.
트레이더의 답변을 분석해 세 가지 중 하나로 판단합니다:
1. 수치화 완료: 코드로 구현 가능한 명확한 수치/조건이 나온 경우
2. 추가 질문 필요: 아직 불명확해서 더 물어봐야 하는 경우
3. 수치화 불가: 현재 기술로 자동화가 불가능한 조건인 경우
AI, 인공지능 관련 문구는 절대 사용하지 않습니다.
반드시 JSON만 반환합니다.`;

function formatReplies(thread: QAThread): string {
  if (!thread.replies.length) return "(대화 없음)";
  return thread.replies
    .map((r) => `[${r.author}] ${r.content}`)
    .join("\n");
}

export async function analyzeReply(
  thread: QAThread,
  quantifiedList: QuantifiedCondition[]
): Promise<AnalyzeReplyResult> {
  const client = getClient();
  const userPrompt = `질문 제목: ${thread.title}
대화 내용:
${formatReplies(thread)}

이미 수치화된 조건:
${formatQuantifiedList(quantifiedList)}

분석 결과를 JSON으로 반환하세요.
형식: {
  "action": "completed" | "follow_up" | "impossible",
  "followUpQuestion": "추가 질문 내용 (action이 follow_up일 때만)",
  "value": "수치화된 값 (action이 completed일 때만)",
  "reason": "판단 이유"
}`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: ANALYZE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = message.content[0];
  if (!block || block.type !== "text") {
    return { action: "follow_up", reason: "응답을 해석할 수 없습니다.", followUpQuestion: "조금 더 자세히 설명해 주실 수 있나요?" };
  }

  try {
    const parsed = JSON.parse(stripCodeFence(block.text));
    const action = parsed?.action;
    if (action !== "completed" && action !== "follow_up" && action !== "impossible") {
      return { action: "follow_up", reason: "판단 결과가 올바르지 않습니다.", followUpQuestion: "조금 더 자세히 설명해 주실 수 있나요?" };
    }
    const reason = typeof parsed?.reason === "string" ? parsed.reason : "";
    const followUpQuestion = typeof parsed?.followUpQuestion === "string" ? parsed.followUpQuestion : undefined;
    const value = typeof parsed?.value === "string" ? parsed.value : undefined;
    return { action, reason, followUpQuestion, value };
  } catch (err) {
    console.error("[futures-claude-analyzer] analyzeReply parse error:", err);
    return { action: "follow_up", reason: "응답 파싱 실패", followUpQuestion: "조금 더 자세히 설명해 주실 수 있나요?" };
  }
}
