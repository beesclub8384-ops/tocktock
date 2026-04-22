import Anthropic from "@anthropic-ai/sdk";
import type {
  FuturesRecord,
  QAThread,
  QuantifiedCondition,
  TradingPattern,
} from "./types/futures-trading.ts";
import {
  MARKET_SYMBOLS,
  sliceAroundEntry,
  type MarketDataForDay,
  type MinuteCandle,
} from "./futures-market-data.ts";

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
  // 코드펜스가 본문 어디든 있으면 첫 펜스 안쪽만 추출 (펜스 바깥 설명 텍스트 무시)
  const fenced = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenced) return fenced[1].trim();
  return trimmed;
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

// ─────────────────────────────────────────────────────────────
// 4-3b. 메모/댓글에서 수집 가능한 새 심볼(지표/종목/차트) 자동 감지
// ─────────────────────────────────────────────────────────────

export interface DetectedSymbol {
  symbol: string;
  name: string;
  source: "yahoo" | "kis";
  mentionedText: string;
}

/** 화이트리스트 — 사양에 명시된 매핑만 허용. 외부에서 변환 규칙 확장 시 함께 갱신. */
const ALLOWED_SYMBOL_MAP: Record<string, { name: string; source: "yahoo" | "kis" }> = {
  "NQ=F": { name: "나스닥 선물", source: "yahoo" },
  "^IXIC": { name: "나스닥 지수", source: "yahoo" },
  "^VIX": { name: "VIX", source: "yahoo" },
  "KRW=X": { name: "원달러 환율", source: "yahoo" },
  "^KS11": { name: "코스피", source: "yahoo" },
  "^N225": { name: "니케이225", source: "yahoo" },
  "^HSI": { name: "항셍지수", source: "yahoo" },
  "^TNX": { name: "미국채 10년", source: "yahoo" },
  "GC=F": { name: "금 선물", source: "yahoo" },
  "CL=F": { name: "WTI 원유 선물", source: "yahoo" },
  "^SOX": { name: "필라델피아 반도체 지수", source: "yahoo" },
};

const DETECT_SYSTEM_PROMPT = `당신은 금융 데이터 수집 시스템입니다.
트레이더의 매매 메모나 댓글에서 언급된 금융 지표, 종목, 차트를
Yahoo Finance 또는 KIS API로 수집 가능한 심볼로 변환합니다.
이미 수집 중인 심볼은 제외합니다.
반드시 JSON만 반환합니다.`;

export async function detectNewSymbols(
  text: string,
  existingSymbols: string[]
): Promise<DetectedSymbol[]> {
  const trimmed = (text || "").trim();
  if (!trimmed) return [];

  const userPrompt = `텍스트: ${trimmed}

이미 수집 중인 심볼: ${existingSymbols.length ? existingSymbols.join(", ") : "(없음)"}

위 텍스트에서 언급된 금융 지표/종목을 찾아서
Yahoo Finance 심볼로 변환 가능한 것들을 JSON 배열로 반환하세요.

형식: [
  {
    "symbol": "NQ=F",
    "name": "나스닥 선물",
    "source": "yahoo",
    "mentionedText": "나스닥 흐름을 봤다"
  }
]

변환 규칙:
- 나스닥/나스닥선물 → NQ=F (yahoo)
- 나스닥지수 → ^IXIC (yahoo)
- VIX/공포지수 → ^VIX (yahoo)
- 원달러/달러원/환율 → KRW=X (yahoo)
- 코스피 → ^KS11 (yahoo)
- 니케이/일본증시 → ^N225 (yahoo)
- 항셍/홍콩증시 → ^HSI (yahoo)
- 국채10년/미국채 → ^TNX (yahoo)
- 금/골드 → GC=F (yahoo)
- 유가/WTI → CL=F (yahoo)
- 반도체지수/SOX → ^SOX (yahoo)
- 위 목록에 없거나 불확실한 것은 포함하지 말 것
- 이미 수집 중인 심볼과 동일하면 제외
- 감지된 심볼이 없으면 빈 배열 [] 반환`;

  let raw: string | null = null;
  try {
    raw = await callWithRetry(
      {
        model: MODEL,
        max_tokens: 1024,
        system: DETECT_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      },
      "detectNewSymbols"
    );
  } catch (err) {
    console.error(`${LOG_TAG} detectNewSymbols all attempts failed:`, err);
    return [];
  }

  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(raw));
  } catch (err) {
    console.error(`${LOG_TAG} detectNewSymbols parse error:`, err, "raw:", raw);
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const existingSet = new Set(existingSymbols);
  const seen = new Set<string>();
  const out: DetectedSymbol[] = [];
  for (const item of parsed) {
    const o = item as Record<string, unknown>;
    const symbol = typeof o?.symbol === "string" ? o.symbol.trim() : "";
    const mentionedText = typeof o?.mentionedText === "string" ? o.mentionedText.trim() : "";
    if (!symbol || existingSet.has(symbol) || seen.has(symbol)) continue;
    const allowed = ALLOWED_SYMBOL_MAP[symbol];
    if (!allowed) continue; // 화이트리스트 외 심볼은 폐기
    seen.add(symbol);
    out.push({
      symbol,
      name: allowed.name,
      source: allowed.source,
      mentionedText,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// 4-4. 전체 기록/수치화로부터 용태형 매매 패턴 요약 갱신
// ─────────────────────────────────────────────────────────────

const PATTERN_SYSTEM_PROMPT = `당신은 선물 트레이더의 매매 패턴을 분석하고 학습하는 시스템입니다.
트레이더의 매매 기록, 수치화된 조건들을 종합해서
현재까지 파악된 매매 알고리즘을 정리합니다.
데이터가 적으면 신중하게, 많을수록 더 확신있게 정리합니다.
AI, 인공지능 관련 문구는 절대 사용하지 않습니다.
반드시 JSON만 반환합니다.`;

function summarizeRecord(r: FuturesRecord): string {
  const dir = r.direction === "long" ? "롱" : "숏";
  const pnlTag = r.pnl > 0 ? "수익" : r.pnl < 0 ? "손실" : "본전";
  const memoPreview = (r.memo || "").replace(/\s+/g, " ").trim().slice(0, 160);
  return `- ${r.date} ${r.entryTime}→${r.exitTime} ${dir} @${r.entryPoint}→${r.exitPoint} (${r.contracts}계약, ${r.pnl}원, ${pnlTag})${memoPreview ? `\n  메모: ${memoPreview}` : ""}`;
}

function summarizeQuantified(q: QuantifiedCondition): string {
  const st = q.status === "completed" ? "완료" : q.status === "impossible" ? "불가" : "진행중";
  const v = q.value ? ` = ${q.value}` : "";
  const why = q.reason ? ` [근거: ${q.reason.slice(0, 120)}]` : "";
  return `- [${st}] ${q.condition}${v}${why}`;
}

function confidenceFromCount(n: number): "low" | "medium" | "high" {
  if (n >= 30) return "high";
  if (n >= 10) return "medium";
  return "low";
}

function emptyPattern(recordCount: number): TradingPattern {
  return {
    updatedAt: new Date().toISOString(),
    basedOnRecords: recordCount,
    longConditions: [],
    shortConditions: [],
    exitConditions: [],
    avoidConditions: [],
    summary: "",
    confidence: confidenceFromCount(recordCount),
  };
}

export async function updateTradingPattern(
  records: FuturesRecord[],
  quantifiedList: QuantifiedCondition[]
): Promise<TradingPattern> {
  const basedOnRecords = records.length;
  if (basedOnRecords === 0) {
    return emptyPattern(0);
  }

  // 최신(날짜/시간 기준) 먼저 정렬해서 프롬프트 상단에 최신 기록 배치
  const sortedRecords = [...records].sort((a, b) => {
    const d = b.date.localeCompare(a.date);
    if (d !== 0) return d;
    return b.entryTime.localeCompare(a.entryTime);
  });

  const recordSummary = sortedRecords.map(summarizeRecord).join("\n");
  const quantifiedSummary = quantifiedList.length
    ? quantifiedList.map(summarizeQuantified).join("\n")
    : "(없음)";

  const confidenceHint = confidenceFromCount(basedOnRecords);

  const userPrompt = `지금까지의 매매 기록 ${basedOnRecords}건:
${recordSummary}

수치화된 조건 ${quantifiedList.length}건:
${quantifiedSummary}

위 데이터를 바탕으로 현재까지 파악된 매매 패턴을 JSON으로 반환하세요.
형식: {
  "longConditions": ["조건1", "조건2", ...],
  "shortConditions": ["조건1", "조건2", ...],
  "exitConditions": ["조건1", "조건2", ...],
  "avoidConditions": ["조건1", "조건2", ...],
  "summary": "전체 패턴 한 문단 요약",
  "confidence": "low" | "medium" | "high"
}

규칙:
- 기록이 10건 미만이면 confidence: low (현재 기록 수: ${basedOnRecords}건 → 추천 confidence: ${confidenceHint})
- 기록이 10~29건이면 confidence: medium
- 기록이 30건 이상이면 confidence: high
- 확실하지 않은 조건은 포함하지 말 것
- 각 조건은 구체적인 수치 포함 (예: "삼성전자 3분봉 20이평 지지 확인")
- 승률이 낮은 패턴은 명시적으로 avoidConditions에 포함
- 조건 텍스트는 한 줄 짧게, 주관적 표현 대신 수치/시간을 사용할 것`;

  let text: string | null = null;
  try {
    text = await callWithRetry(
      {
        model: MODEL,
        max_tokens: 4096,
        system: PATTERN_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      },
      "updateTradingPattern"
    );
  } catch (err) {
    console.error(`${LOG_TAG} updateTradingPattern failed:`, err);
    return emptyPattern(basedOnRecords);
  }

  if (!text) return emptyPattern(basedOnRecords);

  try {
    const parsed = JSON.parse(stripCodeFence(text));
    const toStringArr = (v: unknown): string[] =>
      Array.isArray(v)
        ? v.map((x) => (typeof x === "string" ? x.trim() : "")).filter((s) => s.length > 0)
        : [];

    const rawConf = parsed?.confidence;
    const confidence: "low" | "medium" | "high" =
      rawConf === "high" || rawConf === "medium" || rawConf === "low" ? rawConf : confidenceHint;

    return {
      updatedAt: new Date().toISOString(),
      basedOnRecords,
      longConditions: toStringArr(parsed?.longConditions),
      shortConditions: toStringArr(parsed?.shortConditions),
      exitConditions: toStringArr(parsed?.exitConditions),
      avoidConditions: toStringArr(parsed?.avoidConditions),
      summary: typeof parsed?.summary === "string" ? parsed.summary.trim() : "",
      confidence,
    };
  } catch (err) {
    console.error(`${LOG_TAG} updateTradingPattern parse error:`, err, "raw:", text);
    return emptyPattern(basedOnRecords);
  }
}
