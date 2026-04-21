import { redis } from "@/lib/redis";
import {
  type FuturesRecord,
  type FuturesStore,
  type LegacyQAItem,
  type QAAuthor,
  type QAItem,
  type QAReply,
  type QAStore,
  type QAThread,
  type QAThreadStatus,
  type QuantifiedCondition,
  type MessageItem,
  type MessageStore,
  FUTURES_REDIS_KEY,
  QA_REDIS_KEY,
  MSG_REDIS_KEY,
  QUANTIFIED_REDIS_KEY,
} from "@/lib/types/futures-trading";

/** 저장된 스레드가 status 없는 구버전이면 'open' 채움 */
function normalizeThread(raw: Partial<QAThread> & { id?: string }): QAThread {
  const status: QAThreadStatus =
    raw.status === "completed" || raw.status === "impossible" ? raw.status : "open";
  return {
    id: raw.id ?? crypto.randomUUID(),
    title: raw.title ?? "",
    status,
    statusReason: raw.statusReason,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    replies: Array.isArray(raw.replies) ? raw.replies : [],
  };
}

function normalizeRecord(record: FuturesRecord): FuturesRecord {
  if (Array.isArray(record.qaThreads)) {
    record.qaThreads = record.qaThreads.map((t) =>
      normalizeThread(t as Partial<QAThread>)
    );
  }
  return record;
}

export async function loadRecords(): Promise<FuturesRecord[]> {
  const data = await redis.get<FuturesStore>(FUTURES_REDIS_KEY);
  const records = data?.records ?? [];
  return records.map(normalizeRecord);
}

export async function saveRecords(records: FuturesRecord[]): Promise<void> {
  const store: FuturesStore = { records };
  await redis.set(FUTURES_REDIS_KEY, store);
}

export async function addRecord(record: FuturesRecord): Promise<void> {
  const records = await loadRecords();
  records.push(record);
  records.sort((a, b) => {
    const dateComp = b.date.localeCompare(a.date);
    if (dateComp !== 0) return dateComp;
    return b.entryTime.localeCompare(a.entryTime);
  });
  await saveRecords(records);
}

export async function deleteRecord(id: string): Promise<boolean> {
  const records = await loadRecords();
  const filtered = records.filter((r) => r.id !== id);
  if (filtered.length === records.length) return false;
  await saveRecords(filtered);
  return true;
}

export async function updateMemo(id: string, memo: string): Promise<boolean> {
  const records = await loadRecords();
  const record = records.find((r) => r.id === id);
  if (!record) return false;
  record.memo = memo;
  await saveRecords(records);
  return true;
}

/** 특정 record의 qaThreads에 새 스레드 여러개 추가 */
export async function appendThreadsToRecord(
  recordId: string,
  threads: QAThread[]
): Promise<boolean> {
  if (!threads.length) return true;
  const records = await loadRecords();
  const record = records.find((r) => r.id === recordId);
  if (!record) return false;
  if (!Array.isArray(record.qaThreads)) record.qaThreads = [];
  record.qaThreads.push(...threads);
  await saveRecords(records);
  return true;
}

/** 특정 스레드 상태 업데이트 */
export async function updateThreadStatus(
  recordId: string,
  threadId: string,
  status: QAThreadStatus,
  reason?: string
): Promise<boolean> {
  const records = await loadRecords();
  const record = records.find((r) => r.id === recordId);
  if (!record || !Array.isArray(record.qaThreads)) return false;
  const thread = record.qaThreads.find((t) => t.id === threadId);
  if (!thread) return false;
  thread.status = status;
  if (reason !== undefined) thread.statusReason = reason;
  await saveRecords(records);
  return true;
}

/** 특정 스레드에 답글 추가 */
export async function addReplyToThread(
  recordId: string,
  threadId: string,
  reply: QAReply
): Promise<boolean> {
  const records = await loadRecords();
  const record = records.find((r) => r.id === recordId);
  if (!record || !Array.isArray(record.qaThreads)) return false;
  const thread = record.qaThreads.find((t) => t.id === threadId);
  if (!thread) return false;
  thread.replies.push(reply);
  await saveRecords(records);
  return true;
}

// ── Quantified ──

export async function loadQuantified(): Promise<QuantifiedCondition[]> {
  const data = await redis.get<QuantifiedCondition[]>(QUANTIFIED_REDIS_KEY);
  return Array.isArray(data) ? data : [];
}

export async function saveQuantified(list: QuantifiedCondition[]): Promise<void> {
  await redis.set(QUANTIFIED_REDIS_KEY, list);
}

export async function addQuantifiedCondition(
  item: QuantifiedCondition
): Promise<void> {
  const list = await loadQuantified();
  list.unshift(item);
  await saveQuantified(list);
}

// ── QA (아카이브 전용, 읽기 로직만 유지) ──

type StoredQA = Partial<QAItem> & Partial<LegacyQAItem>;

function migrateQA(raw: StoredQA): QAItem {
  // 이미 새 구조
  if (Array.isArray(raw.replies) && typeof raw.title === "string") {
    return {
      id: raw.id ?? crypto.randomUUID(),
      title: raw.title,
      replies: raw.replies,
      createdAt: raw.createdAt ?? new Date().toISOString(),
    };
  }

  // 옛 구조 → 새 구조
  const replies: QAReply[] = [];
  if (raw.answer && raw.answer.trim()) {
    replies.push({
      id: crypto.randomUUID(),
      author: "용태",
      content: raw.answer,
      createdAt: raw.answeredAt || raw.createdAt || new Date().toISOString(),
    });
  }

  return {
    id: raw.id ?? crypto.randomUUID(),
    title: raw.question ?? raw.title ?? "",
    replies,
    createdAt: raw.createdAt ?? new Date().toISOString(),
  };
}

export async function loadQA(): Promise<QAItem[]> {
  const data = await redis.get<QAStore | { qa?: StoredQA[] }>(QA_REDIS_KEY);
  const raw = data?.qa ?? [];
  return raw.map((item) => migrateQA(item as StoredQA));
}

async function saveQA(qa: QAItem[]): Promise<void> {
  const store: QAStore = { qa };
  await redis.set(QA_REDIS_KEY, store);
}

export async function addQuestion(title: string): Promise<QAItem> {
  const trimmed = title.trim();
  if (!trimmed) throw new Error("제목을 입력해주세요.");

  const qa = await loadQA();
  const item: QAItem = {
    id: crypto.randomUUID(),
    title: trimmed,
    replies: [],
    createdAt: new Date().toISOString(),
  };
  qa.unshift(item);
  await saveQA(qa);
  return item;
}

export async function addReply(
  qaId: string,
  author: QAAuthor,
  content: string
): Promise<QAReply | null> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("내용을 입력해주세요.");
  if (author !== "태양" && author !== "용태") {
    throw new Error("작성자가 올바르지 않습니다.");
  }

  const qa = await loadQA();
  const thread = qa.find((t) => t.id === qaId);
  if (!thread) return null;

  const reply: QAReply = {
    id: crypto.randomUUID(),
    author,
    content: trimmed,
    createdAt: new Date().toISOString(),
  };
  thread.replies.push(reply);
  await saveQA(qa);
  return reply;
}

export async function deleteReply(qaId: string, replyId: string): Promise<boolean> {
  const qa = await loadQA();
  const thread = qa.find((t) => t.id === qaId);
  if (!thread) return false;

  const before = thread.replies.length;
  thread.replies = thread.replies.filter((r) => r.id !== replyId);
  if (thread.replies.length === before) return false;

  await saveQA(qa);
  return true;
}

export async function deleteQuestion(id: string): Promise<boolean> {
  const qa = await loadQA();
  const filtered = qa.filter((q) => q.id !== id);
  if (filtered.length === qa.length) return false;
  await saveQA(filtered);
  return true;
}

// ── Messages ──

export async function loadMessages(): Promise<MessageItem[]> {
  const data = await redis.get<MessageStore>(MSG_REDIS_KEY);
  return data?.messages ?? [];
}

async function saveMessages(messages: MessageItem[]): Promise<void> {
  await redis.set(MSG_REDIS_KEY, { messages } as MessageStore);
}

export async function addMessage(author: QAAuthor, content: string): Promise<MessageItem> {
  const messages = await loadMessages();
  const item: MessageItem = {
    id: crypto.randomUUID(),
    author,
    content,
    createdAt: new Date().toISOString(),
  };
  messages.push(item);
  await saveMessages(messages);
  return item;
}

export async function deleteMessage(id: string): Promise<boolean> {
  const messages = await loadMessages();
  const filtered = messages.filter((m) => m.id !== id);
  if (filtered.length === messages.length) return false;
  await saveMessages(filtered);
  return true;
}
