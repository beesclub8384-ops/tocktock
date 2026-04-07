import { redis } from "@/lib/redis";
import {
  type FuturesRecord,
  type FuturesStore,
  type QAItem,
  type QAStore,
  type MessageItem,
  type MessageStore,
  FUTURES_REDIS_KEY,
  QA_REDIS_KEY,
  MSG_REDIS_KEY,
} from "@/lib/types/futures-trading";

export async function loadRecords(): Promise<FuturesRecord[]> {
  const data = await redis.get<FuturesStore>(FUTURES_REDIS_KEY);
  return data?.records ?? [];
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

// ── QA ──

export async function loadQA(): Promise<QAItem[]> {
  const data = await redis.get<QAStore>(QA_REDIS_KEY);
  return data?.qa ?? [];
}

async function saveQA(qa: QAItem[]): Promise<void> {
  await redis.set(QA_REDIS_KEY, { qa } as QAStore);
}

export async function addQuestion(question: string): Promise<QAItem> {
  const qa = await loadQA();
  const item: QAItem = {
    id: crypto.randomUUID(),
    question,
    answer: "",
    createdAt: new Date().toISOString(),
    answeredAt: "",
  };
  qa.unshift(item);
  await saveQA(qa);
  return item;
}

export async function answerQuestion(id: string, answer: string): Promise<boolean> {
  const qa = await loadQA();
  const item = qa.find((q) => q.id === id);
  if (!item) return false;
  item.answer = answer;
  item.answeredAt = new Date().toISOString();
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

export async function addMessage(author: "태양" | "용태", content: string): Promise<MessageItem> {
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
