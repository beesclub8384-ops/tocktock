import { redis } from "./redis.ts";

export interface SBMessage {
  role: "user" | "assistant";
  content: string;
  ts: number;
  /** 이 메시지 지점에서 뻗은 가지 대화 id */
  branchId?: string;
  /** 가지 완료 시 요약이 이 자리에 끼워짐 */
  branchSummary?: string;
}

export interface SBConversation {
  id: string;
  title: string;
  messages: SBMessage[];
  createdAt: number;
  updatedAt: number;
  /** 부모 대화 id. root는 없음 */
  parentId?: string;
  /** 부모의 어느 메시지에서 뻗었는지 */
  parentMessageTs?: number;
  status: "active" | "done";
}

export interface SBTreeNode {
  id: string;
  title: string;
  status: "active" | "done";
  children: string[];
}

export type SBTree = Record<string, SBTreeNode>;

/** 루트 대화 고정 id */
export const SB_ROOT_ID = "root";
export const SB_ROOT_TITLE = "제2의 뇌";

const TREE_KEY = "second-brain:tree";

function convKey(id: string): string {
  return `second-brain:conv:${id}`;
}

function normalizeConversation(data: SBConversation): SBConversation {
  return {
    ...data,
    messages: Array.isArray(data.messages) ? data.messages : [],
    // 1차 버전 데이터에는 status가 없다
    status: data.status === "done" ? "done" : "active",
  };
}

export async function loadConversation(
  id: string
): Promise<SBConversation | null> {
  // Upstash Redis는 자동 직렬화/역직렬화 → JSON.parse 금지
  const data = await redis.get<SBConversation>(convKey(id));
  if (!data) return null;
  return normalizeConversation(data);
}

export async function saveConversation(conv: SBConversation): Promise<void> {
  // Upstash Redis는 자동 직렬화 → JSON.stringify 금지
  await redis.set(convKey(conv.id), conv);
}

export function emptyRootConversation(): SBConversation {
  const now = Date.now();
  return {
    id: SB_ROOT_ID,
    title: SB_ROOT_TITLE,
    messages: [],
    createdAt: now,
    updatedAt: now,
    status: "active",
  };
}

// ── 트리 인덱스 ──
// redis.keys() 사용 금지. 트리는 반드시 이 인덱스 키 하나로 구성한다.

function defaultTree(): SBTree {
  return {
    [SB_ROOT_ID]: {
      id: SB_ROOT_ID,
      title: SB_ROOT_TITLE,
      status: "active",
      children: [],
    },
  };
}

function normalizeNode(node: SBTreeNode): SBTreeNode {
  return {
    ...node,
    status: node.status === "done" ? "done" : "active",
    children: Array.isArray(node.children) ? node.children : [],
  };
}

/**
 * 트리 인덱스를 읽는다.
 * 인덱스가 없으면(1차 버전에서 넘어온 상태) root 노드만 담긴 트리를 만들어 저장한다.
 * 기존 root 대화 데이터 자체는 건드리지 않는다.
 */
export async function loadTree(): Promise<SBTree> {
  const data = await redis.get<SBTree>(TREE_KEY);
  if (!data || typeof data !== "object" || Object.keys(data).length === 0) {
    const tree = defaultTree();
    await saveTree(tree);
    return tree;
  }

  const tree: SBTree = {};
  for (const [id, node] of Object.entries(data)) {
    if (node) tree[id] = normalizeNode(node);
  }
  if (!tree[SB_ROOT_ID]) {
    tree[SB_ROOT_ID] = defaultTree()[SB_ROOT_ID];
  }
  return tree;
}

export async function saveTree(tree: SBTree): Promise<void> {
  await redis.set(TREE_KEY, tree);
}

/**
 * 부모 대화의 특정 메시지 지점에서 새 가지를 뻗는다.
 * 새 대화 + 부모 대화 + 트리 인덱스를 모두 저장한다.
 */
export async function createBranch(
  parentId: string,
  parentMessageTs: number,
  title: string
): Promise<SBConversation> {
  const parent = await loadConversation(parentId);
  if (!parent) {
    throw new Error("부모 대화를 찾을 수 없습니다.");
  }

  const target = parent.messages.find((m) => m.ts === parentMessageTs);
  if (!target) {
    throw new Error("가지를 뻗을 메시지를 찾을 수 없습니다.");
  }
  if (target.branchId) {
    throw new Error("이미 이 지점에서 뻗은 가지가 있습니다.");
  }

  const now = Date.now();
  const branch: SBConversation = {
    id: crypto.randomUUID(),
    title,
    messages: [],
    createdAt: now,
    updatedAt: now,
    parentId,
    parentMessageTs,
    status: "active",
  };

  target.branchId = branch.id;
  parent.updatedAt = now;

  const tree = await loadTree();
  tree[branch.id] = {
    id: branch.id,
    title: branch.title,
    status: "active",
    children: [],
  };
  const parentNode = tree[parentId];
  if (parentNode) {
    if (!parentNode.children.includes(branch.id)) {
      parentNode.children.push(branch.id);
    }
  } else {
    tree[parentId] = {
      id: parentId,
      title: parent.title,
      status: parent.status,
      children: [branch.id],
    };
  }

  await saveConversation(branch);
  await saveConversation(parent);
  await saveTree(tree);

  return branch;
}

/**
 * 가지를 완료 처리한다.
 * 요약을 부모 대화의 해당 메시지(branchId 일치)의 branchSummary에 기록하고,
 * 가지 status를 'done'으로 바꾼 뒤 트리 인덱스까지 갱신한다.
 */
export async function finishBranch(
  conv: SBConversation,
  summary: string
): Promise<void> {
  const now = Date.now();

  conv.status = "done";
  conv.updatedAt = now;

  if (conv.parentId) {
    const parent = await loadConversation(conv.parentId);
    if (parent) {
      const target = parent.messages.find((m) => m.branchId === conv.id);
      if (target) {
        target.branchSummary = summary;
        parent.updatedAt = now;
        await saveConversation(parent);
      }
    }
  }

  const tree = await loadTree();
  const node = tree[conv.id];
  if (node) {
    node.status = "done";
    node.title = conv.title;
  } else {
    tree[conv.id] = {
      id: conv.id,
      title: conv.title,
      status: "done",
      children: [],
    };
  }

  await saveConversation(conv);
  await saveTree(tree);
}
