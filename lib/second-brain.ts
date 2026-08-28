import { redis } from "./redis.ts";

export interface SBMessage {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

export interface SBConversation {
  id: string;
  title: string;
  messages: SBMessage[];
  createdAt: number;
  updatedAt: number;
}

/** 이번 단계는 대화 1개 고정 */
export const SB_ROOT_ID = "root";

function convKey(id: string): string {
  return `second-brain:conv:${id}`;
}

export async function loadConversation(
  id: string
): Promise<SBConversation | null> {
  // Upstash Redis는 자동 직렬화/역직렬화 → JSON.parse 금지
  const data = await redis.get<SBConversation>(convKey(id));
  if (!data) return null;
  return {
    ...data,
    messages: Array.isArray(data.messages) ? data.messages : [],
  };
}

export async function saveConversation(conv: SBConversation): Promise<void> {
  // Upstash Redis는 자동 직렬화 → JSON.stringify 금지
  await redis.set(convKey(conv.id), conv);
}
