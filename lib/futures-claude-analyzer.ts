import Anthropic from "@anthropic-ai/sdk";
import type { FuturesRecord, QAThread, QuantifiedCondition } from "@/lib/types/futures-trading";
import {
  MARKET_SYMBOLS,
  sliceAroundEntry,
  type MarketDataForDay,
  type MinuteCandle,
} from "@/lib/futures-market-data";

const MODEL = "claude-sonnet-4-5-20250929";
const LOG_TAG = "[futures-claude-analyzer]";

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

/** Anthropic messages.create 호출 (1회 재시도). 실패 시 마지막 에러 throw */
async function callWithRetry(
  params: Anthropic.Messages.MessageCreateParamsNonStreaming,
  label: string
): Promise<string | null> {
  const client = getClient();
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const message = await client.messages.create(params);
      const block = message.content[0];
      if (!block || block.type !== "text") {
        console.error(`${LOG_TAG} ${label} empty/non-text block, attempt=${attempt}`);
        lastErr = new Error("empty or non-text response");
        continue;
      }
      return block.text;
    } catch (err) {
      lastErr = err;
      console.error(`${LOG_TAG} ${label} attempt=${attempt} failed:`, err);
    }
  }
  throw lastErr ?? new Error("unknown analyzer failure");
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

  const userPrompt = `매매 메모: ${trimmed}
이미 수치화된 조건: ${formatQuantifiedList(quantifiedList)}
위 메모에서 자동화를 위해 수치화가 필요한 주관적 조건을 찾아 독립적인 질문 목록을 JSON으로 반환하세요.
형식: [{ "title": "질문 내용" }, ...]
질문이 없으면 빈 배열 []을 반환하세요.`;

  let text: string | null = null;
  try {
    text = await callWithRetry(
      {
        model: MODEL,
        max_tokens: 2048,
        system: GENERATE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      },
      "generateQAThreads"
    );
  } catch (err) {
    console.error(`${LOG_TAG} generateQAThreads all attempts failed:`, err);
    return [];
  }

  if (!text) return [];

  try {
    const parsed = JSON.parse(stripCodeFence(text));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const title = typeof item?.title === "string" ? item.title.trim() : "";
        return title ? { title } : null;
      })
      .filter((x): x is GeneratedThread => x !== null);
  } catch (err) {
    console.error(`${LOG_TAG} generateQAThreads parse error:`, err, "raw:", text);
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

/** 기본 follow_up 결과 (API 실패 등 비상 시) */
function fallbackFollowUp(reason: string): AnalyzeReplyResult {
  return {
    action: "follow_up",
    reason,
    followUpQuestion: "조금 더 자세히 설명해 주실 수 있나요?",
  };
}

export async function analyzeReply(
  thread: QAThread,
  quantifiedList: QuantifiedCondition[]
): Promise<AnalyzeReplyResult> {
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

  let text: string | null = null;
  try {
    text = await callWithRetry(
      {
        model: MODEL,
        max_tokens: 1024,
        system: ANALYZE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      },
      "analyzeReply"
    );
  } catch (err) {
    console.error(`${LOG_TAG} analyzeReply all attempts failed:`, err);
    return fallbackFollowUp("분석 요청이 실패했습니다. 다시 답변해 주시면 재시도합니다.");
  }

  if (!text) {
    return fallbackFollowUp("응답을 해석할 수 없습니다.");
  }

  try {
    const parsed = JSON.parse(stripCodeFence(text));
    const action = parsed?.action;
    if (action !== "completed" && action !== "follow_up" && action !== "impossible") {
      console.error(`${LOG_TAG} analyzeReply invalid action:`, action, "raw:", text);
      return fallbackFollowUp("판단 결과가 올바르지 않습니다.");
    }
    const reason = typeof parsed?.reason === "string" ? parsed.reason : "";
    const rawFollowUp = typeof parsed?.followUpQuestion === "string" ? parsed.followUpQuestion.trim() : "";
    const value = typeof parsed?.value === "string" ? parsed.value : undefined;
    // follow_up인데 질문이 비어 있으면 기본 질문으로 대체 → UI 멈춤 방지
    const followUpQuestion =
      action === "follow_up"
        ? rawFollowUp || "조금 더 자세히 설명해 주실 수 있나요?"
        : rawFollowUp || undefined;
    return { action, reason, followUpQuestion, value };
  } catch (err) {
    console.error(`${LOG_TAG} analyzeReply parse error:`, err, "raw:", text);
    return fallbackFollowUp("응답 파싱에 실패했습니다.");
  }
}

// ─────────────────────────────────────────────────────────────
// 4-3. 시장 데이터 + 메모를 함께 분석 → 패턴 추출
// ─────────────────────────────────────────────────────────────

export interface ConfirmedCondition {
  condition: string;
  value: string;
  dataEvidence: string;
}

export interface MarketDataQuestion {
  title: string;
}

export interface AnalyzeWithMarketDataResult {
  patternFound: string;
  confirmedConditions: ConfirmedCondition[];
  questions: MarketDataQuestion[];
}

const MARKET_ANALYZE_SYSTEM_PROMPT = `당신은 선물 트레이더의 매매 패턴을 학습하는 분석가입니다.
트레이더의 매매 메모(자연어)와 해당 시점의 실제 시장 데이터를 함께 분석해서
트레이더가 어떤 조건에서 매매했는지 스스로 파악합니다.
데이터로 확인 가능한 것은 직접 수치화하고,
데이터만으로 판단 불가능한 것만 질문으로 남깁니다.
AI, 인공지능 관련 문구는 절대 사용하지 않습니다.
반드시 JSON만 반환합니다.`;

function formatCandlesCompact(cs: MinuteCandle[]): string {
  if (!cs.length) return "(없음)";
  // 토큰 절약: KST 시각 + OHLCV 한 줄
  return cs
    .map((c) => {
      const d = new Date(c.time);
      const kst = new Date(d.getTime() + 9 * 3600 * 1000);
      const hh = String(kst.getUTCHours()).padStart(2, "0");
      const mm = String(kst.getUTCMinutes()).padStart(2, "0");
      return `${hh}:${mm} O=${c.open} H=${c.high} L=${c.low} C=${c.close} V=${c.volume}`;
    })
    .join("\n");
}

export async function analyzeWithMarketData(
  record: FuturesRecord,
  marketData: MarketDataForDay | null,
  quantifiedList: QuantifiedCondition[]
): Promise<AnalyzeWithMarketDataResult> {
  // 각 심볼 3분봉을 진입 시각 전후 30분으로 슬라이스 + 포맷
  const marketSections: string[] = [];
  for (const symbol of MARKET_SYMBOLS) {
    const bars3m = marketData?.symbols?.[symbol]?.candles3m ?? [];
    const sliced = sliceAroundEntry(bars3m, record.date, record.entryTime, 30);
    marketSections.push(`- ${symbol}:\n${formatCandlesCompact(sliced)}`);
  }

  const userPrompt = `매매 기록:
- 날짜: ${record.date}
- 방향: ${record.direction === "long" ? "롱(매수)" : "숏(매도)"}
- 진입 시각(KST): ${record.entryTime} / 진입가: ${record.entryPoint}
- 청산 시각(KST): ${record.exitTime} / 청산가: ${record.exitPoint}
- 계약수: ${record.contracts}
- 손익: ${record.pnl}원
- 메모: ${record.memo || "(메모 없음)"}

해당일 시장 데이터 (3분봉, 진입 시각 전후 30분, KST 표기):
${marketSections.join("\n\n")}

이미 수치화된 조건:
${formatQuantifiedList(quantifiedList)}

위 자료를 토대로 분석 결과를 JSON으로 반환하세요.
형식: {
  "patternFound": "발견된 매매 패턴을 한 문단으로 설명",
  "confirmedConditions": [
    { "condition": "조건명", "value": "수치화된 값", "dataEvidence": "근거 데이터" }
  ],
  "questions": [
    { "title": "데이터로 확인 불가한 질문" }
  ]
}

규칙:
- 이미 수치화된 조건과 동일한 조건은 confirmedConditions에 포함하지 마세요
- 데이터로 확인 가능한 조건은 반드시 근거 수치(예: "삼성전자 10:23 KST 가격 192,800, 3분봉 20이평 192,500 → 괴리 0.16%")를 제시하세요
- 메모가 비어 있으면 questions는 빈 배열로 두고 데이터만으로 관찰 가능한 패턴을 patternFound에 적으세요
- questions는 반드시 하나의 주제만 다루는 독립적인 질문으로 작성하세요`;

  const fallback: AnalyzeWithMarketDataResult = {
    patternFound: "",
    confirmedConditions: [],
    questions: [],
  };

  let text: string | null = null;
  try {
    text = await callWithRetry(
      {
        model: MODEL,
        max_tokens: 4096,
        system: MARKET_ANALYZE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      },
      "analyzeWithMarketData"
    );
  } catch (err) {
    console.error(`${LOG_TAG} analyzeWithMarketData failed:`, err);
    return fallback;
  }

  if (!text) return fallback;

  try {
    const parsed = JSON.parse(stripCodeFence(text));
    const patternFound = typeof parsed?.patternFound === "string" ? parsed.patternFound : "";
    const confirmedRaw = Array.isArray(parsed?.confirmedConditions) ? parsed.confirmedConditions : [];
    const questionsRaw = Array.isArray(parsed?.questions) ? parsed.questions : [];

    const confirmedConditions: ConfirmedCondition[] = confirmedRaw
      .map((c: unknown) => {
        const o = c as Record<string, unknown>;
        const condition = typeof o?.condition === "string" ? o.condition.trim() : "";
        const value = typeof o?.value === "string" ? o.value.trim() : "";
        const dataEvidence = typeof o?.dataEvidence === "string" ? o.dataEvidence.trim() : "";
        return condition && value ? { condition, value, dataEvidence } : null;
      })
      .filter((x: ConfirmedCondition | null): x is ConfirmedCondition => x !== null);

    const questions: MarketDataQuestion[] = questionsRaw
      .map((q: unknown) => {
        const o = q as Record<string, unknown>;
        const title = typeof o?.title === "string" ? o.title.trim() : "";
        return title ? { title } : null;
      })
      .filter((x: MarketDataQuestion | null): x is MarketDataQuestion => x !== null);

    return { patternFound, confirmedConditions, questions };
  } catch (err) {
    console.error(`${LOG_TAG} analyzeWithMarketData parse error:`, err, "raw:", text);
    return fallback;
  }
}
