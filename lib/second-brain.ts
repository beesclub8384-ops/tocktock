import { redis } from "./redis.ts";

export interface SBBranchRef {
  /** 이 메시지 지점에서 뻗은 가지 대화 id */
  branchId: string;
  /** 가지 완료 시 요약이 이 자리에 끼워짐 */
  summary?: string;
}

export interface SBMessage {
  role: "user" | "assistant";
  content: string;
  ts: number;
  /** 답변을 손으로 고친 시각. 있으면 화면에 "수정됨"으로 표시된다 */
  editedAt?: number;
  /** 나무 전체를 정리해 줄기로 놓은 메시지 */
  consolidated?: boolean;
  /** 한 메시지에서 여러 가지를 뻗을 수 있다 */
  branches?: SBBranchRef[];
}

/** 가지가 메시지당 1개뿐이던 옛 형식 */
interface LegacySBMessage extends SBMessage {
  branchId?: string;
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
/** 가지를 만들 때 붙는 임시 제목. 첫 질문이 들어오면 교체된다 */
export const SB_NEW_BRANCH_TITLE = "새 가지";
/** 새 뿌리(주제)를 만들 때 붙는 임시 제목. 첫 질문이 들어오면 교체된다 */
export const SB_NEW_ROOT_TITLE = "새 주제";
/**
 * 모든 요약에 공통으로 적용되는 규칙.
 * 가지 완료 요약과 전체 정리본이 이 상수 하나를 함께 쓴다(단일 원천).
 */
export const SB_SUMMARY_RULES = `[요약 규칙 — 모든 요약에 반드시 적용]
1. 9살 아이가 읽어도 이해할 수 있는 문장으로 쓴다. 긴 문장은 쪼갠다.
2. 전문용어는 쉬운 말로 바꿔 쓰되, 바꾼 자리마다 원래 전문용어를 괄호로 반드시 붙인다. 예: '돈이 너무 많아져서 돈 하나의 힘이 약해지는 것(인플레이션)'. 전문용어를 빼먹은 채 쉬운 말만 쓰는 것은 금지.
3. 겉으로 나타나는 현상이 아니라 그것이 근본적으로 무엇인지(본질)를 설명한다. '무슨 일이 생기는가'가 아니라 '그게 원래 무엇인가'. 예: '물가가 오른다'(현상)가 아니라 '돈의 양이 늘어서 돈 하나의 가치가 떨어진다'(본질).
4. 사족·부연·반복 금지. 본질만.`;

/** 자동 생성 제목 최대 길이 */
const TITLE_MAX_LENGTH = 20;

const TREE_KEY = "second-brain:tree";
/** 뿌리 대화 id 목록(생성 순서). 나무 여러 그루를 관리한다 */
const ROOTS_KEY = "second-brain:roots";

function convKey(id: string): string {
  return `second-brain:conv:${id}`;
}

/** 옛 형식(branchId/branchSummary)을 branches 배열로 변환한다. 저장은 새 형식으로만 한다 */
function normalizeMessage(raw: LegacySBMessage): SBMessage {
  const branches: SBBranchRef[] = Array.isArray(raw.branches)
    ? raw.branches.filter((b) => b && b.branchId)
    : [];

  if (raw.branchId && !branches.some((b) => b.branchId === raw.branchId)) {
    branches.push({ branchId: raw.branchId, summary: raw.branchSummary });
  }

  const message: SBMessage = {
    role: raw.role,
    content: raw.content,
    ts: raw.ts,
  };
  if (typeof raw.editedAt === "number") message.editedAt = raw.editedAt;
  if (raw.consolidated === true) message.consolidated = true;
  if (branches.length > 0) message.branches = branches;
  return message;
}

function normalizeConversation(data: SBConversation): SBConversation {
  const rawMessages = Array.isArray(data.messages) ? data.messages : [];
  return {
    ...data,
    messages: rawMessages.map((m) => normalizeMessage(m as LegacySBMessage)),
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

// ── 뿌리 목록(나무 여러 그루) ──

/**
 * 뿌리 대화 id 목록을 읽는다.
 * 키가 없으면(나무 한 그루만 있던 상태) ['root']로 만들어 저장한다.
 * 기존 대화/트리 데이터는 건들지 않는다.
 */
export async function loadRoots(): Promise<string[]> {
  const data = await redis.get<string[]>(ROOTS_KEY);
  const roots = Array.isArray(data)
    ? data.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];

  if (roots.length === 0) {
    const migrated = [SB_ROOT_ID];
    await saveRoots(migrated);
    return migrated;
  }

  // 중복 제거(생성 순서 유지)
  return [...new Set(roots)];
}

export async function saveRoots(roots: string[]): Promise<void> {
  // Upstash Redis는 자동 직렬화 → JSON.stringify 금지
  await redis.set(ROOTS_KEY, roots);
}

/**
 * 새 뿌리 대화(새 나무)를 만든다.
 * 제목은 임시값이고, 첫 질문이 들어오면 chat 라우트가 교체한다.
 */
export async function createRoot(): Promise<SBConversation> {
  const now = Date.now();
  const conv: SBConversation = {
    id: crypto.randomUUID(),
    title: SB_NEW_ROOT_TITLE,
    messages: [],
    createdAt: now,
    updatedAt: now,
    status: "active",
  };

  const tree = await loadTree();
  tree[conv.id] = {
    id: conv.id,
    title: conv.title,
    status: "active",
    children: [],
  };

  const roots = await loadRoots();
  if (!roots.includes(conv.id)) roots.push(conv.id);

  await saveConversation(conv);
  await saveTree(tree);
  await saveRoots(roots);

  return conv;
}

/** 트리 인덱스의 노드 제목만 갱신한다. 노드가 없으면 아무것도 하지 않는다 */
export async function updateTreeNodeTitle(
  id: string,
  title: string
): Promise<void> {
  const tree = await loadTree();
  const node = tree[id];
  if (!node) return;
  node.title = title;
  await saveTree(tree);
}

/** 첫 질문으로 가지 제목을 만든다. 20자 초과 시 "..."을 붙인다 */
export function titleFromMessage(message: string): string {
  const text = message.trim();
  if (text.length <= TITLE_MAX_LENGTH) return text;
  return `${text.slice(0, TITLE_MAX_LENGTH)}...`;
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

  // 같은 메시지에 가지를 몇 개든 뻗을 수 있다
  if (!target.branches) target.branches = [];
  target.branches.push({ branchId: branch.id });
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
      const ref = parent.messages
        .flatMap((m) => m.branches ?? [])
        .find((b) => b.branchId === conv.id);
      if (ref) {
        ref.summary = summary;
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

// ── 문답 삭제 / 답변 수정 ──

/** id와 그 하위 가지 id를 전부 모은다 */
function collectSubtreeIds(tree: SBTree, id: string, acc: Set<string>): void {
  if (acc.has(id)) return;
  acc.add(id);
  const node = tree[id];
  if (!node) return;
  for (const childId of node.children) {
    collectSubtreeIds(tree, childId, acc);
  }
}

/**
 * 가지 하나와 그 아래 모든 가지를 통째로 삭제한다.
 * 대화 키 삭제 + 트리 인덱스에서 노드 제거 + 남은 노드의 children 정리 + roots 정리.
 */
export async function deleteBranchRecursive(id: string): Promise<void> {
  const tree = await loadTree();
  const ids = new Set<string>();
  collectSubtreeIds(tree, id, ids);

  // 삭제 대상이 아닌 부모 대화에 가리키는 참조가 남아 있으면 먼저 떼어낸다
  const conv = await loadConversation(id);
  if (conv?.parentId && !ids.has(conv.parentId)) {
    const parent = await loadConversation(conv.parentId);
    if (parent) {
      let touched = false;
      for (const message of parent.messages) {
        if (!message.branches) continue;
        const kept = message.branches.filter((b) => b.branchId !== id);
        if (kept.length !== message.branches.length) {
          touched = true;
          if (kept.length > 0) message.branches = kept;
          else delete message.branches;
        }
      }
      if (touched) {
        parent.updatedAt = Date.now();
        await saveConversation(parent);
      }
    }
  }

  for (const target of ids) delete tree[target];
  for (const node of Object.values(tree)) {
    node.children = node.children.filter((childId) => !ids.has(childId));
  }
  await saveTree(tree);

  const roots = await loadRoots();
  const nextRoots = roots.filter((rootId) => !ids.has(rootId));
  if (nextRoots.length !== roots.length) await saveRoots(nextRoots);

  for (const target of ids) {
    await redis.del(convKey(target));
  }
}

/**
 * 문답 한 쌍(질문 + 바로 뒤 답변)을 지운다.
 * user 메시지를 지목하면 바로 다음 assistant 답변까지,
 * assistant 메시지를 지목하면 바로 앞 user 질문까지 함께 지운다.
 * 지워지는 답변에서 뻗은 가지는 하위까지 전부 삭제된다.
 */
export async function deleteExchange(
  convId: string,
  messageTs: number
): Promise<SBConversation> {
  const conv = await loadConversation(convId);
  if (!conv) {
    throw new Error("대화를 찾을 수 없습니다.");
  }

  const index = conv.messages.findIndex((m) => m.ts === messageTs);
  if (index === -1) {
    throw new Error("삭제할 문답을 찾을 수 없습니다.");
  }

  let start = index;
  let end = index;
  if (conv.messages[index].role === "user") {
    if (conv.messages[index + 1]?.role === "assistant") end = index + 1;
  } else if (index > 0 && conv.messages[index - 1]?.role === "user") {
    start = index - 1;
  }

  const removed = conv.messages.slice(start, end + 1);
  conv.messages = [
    ...conv.messages.slice(0, start),
    ...conv.messages.slice(end + 1),
  ];
  conv.updatedAt = Date.now();

  // 가지를 지우기 전에 저장한다. 참조가 먼저 사라져야 뒷정리가 꼬이지 않는다
  await saveConversation(conv);

  for (const message of removed) {
    for (const ref of message.branches ?? []) {
      await deleteBranchRecursive(ref.branchId);
    }
  }

  return conv;
}

/**
 * 답변 내용을 손으로 고친다.
 * 고친 내용은 그대로 저장되므로 이후 대화의 문맥으로도 그대로 쓰인다.
 */
export async function updateMessageContent(
  convId: string,
  messageTs: number,
  content: string
): Promise<SBMessage> {
  const conv = await loadConversation(convId);
  if (!conv) {
    throw new Error("대화를 찾을 수 없습니다.");
  }

  const target = conv.messages.find((m) => m.ts === messageTs);
  if (!target) {
    throw new Error("수정할 답변을 찾을 수 없습니다.");
  }
  if (target.role !== "assistant") {
    throw new Error("답변만 수정할 수 있습니다.");
  }

  const now = Date.now();
  target.content = content;
  target.editedAt = now;
  conv.updatedAt = now;
  await saveConversation(conv);

  return target;
}

// ── 나무 전체 요약 → 줄기로 놓기(응고) ──

/** 응고 전 원본을 통째로 담아 두는 보관본. 화면에는 노출하지 않는다 */
interface SBArchive {
  rootId: string;
  archivedAt: number;
  conversations: SBConversation[];
  nodes: SBTreeNode[];
}

function archiveKey(rootId: string, archivedAt: number): string {
  return `second-brain:archive:${rootId}:${archivedAt}`;
}

/**
 * 뿌리부터 모든 하위 가지를 트리 순서(깊이 우선)로 훑어 텍스트 한 덩어리로 만든다.
 * 손으로 고친 답변은 고친 내용이 그대로 들어가고,
 * 완료된 가지의 요약은 그 가지가 뻗어 나온 자리에 끼워 넣는다.
 */
export async function collectTreeText(rootId: string): Promise<string> {
  const tree = await loadTree();
  const visited = new Set<string>();
  const blocks: string[] = [];

  async function walk(id: string, parentTitle: string | null): Promise<void> {
    if (visited.has(id)) return;
    visited.add(id);

    const conv = await loadConversation(id);
    const node = tree[id];
    const title = conv?.title ?? node?.title ?? "제목 없음";

    const lines: string[] = [
      // 가지는 들여쓰기 대신 헤더로 어느 지점에서 뻗었는지 드러낸다
      parentTitle ? `### (${parentTitle} > ${title})` : `## ${title}`,
    ];

    for (const m of conv?.messages ?? []) {
      lines.push(`${m.role === "user" ? "Q" : "A"}: ${m.content}`);
      for (const ref of m.branches ?? []) {
        if (ref.summary) lines.push(`[가지 요약: ${ref.summary}]`);
      }
    }
    blocks.push(lines.join("\n"));

    for (const childId of node?.children ?? []) {
      await walk(childId, title);
    }
  }

  await walk(rootId, null);
  return blocks.join("\n\n");
}

/**
 * 정리본을 뿌리 대화의 유일한 줄기로 놓는다.
 * 원본은 보관본 키에 통째로 남기고, 하위 가지는 전부 삭제한다.
 */
export async function consolidateTree(
  rootId: string,
  summary: string
): Promise<SBConversation> {
  const root = await loadConversation(rootId);
  if (!root) {
    throw new Error("대화를 찾을 수 없습니다.");
  }

  const tree = await loadTree();
  const ids = new Set<string>();
  collectSubtreeIds(tree, rootId, ids);

  // 1) 보관본 저장 — 되돌릴 근거를 먼저 남기고 나서 지운다
  const conversations: SBConversation[] = [];
  for (const id of ids) {
    const conv = await loadConversation(id);
    if (conv) conversations.push(conv);
  }
  const nodes = [...ids]
    .map((id) => tree[id])
    .filter((node): node is SBTreeNode => Boolean(node));

  const archivedAt = Date.now();
  const archive: SBArchive = {
    rootId,
    archivedAt,
    conversations,
    nodes,
  };
  // Upstash Redis는 자동 직렬화 → JSON.stringify 금지
  await redis.set(archiveKey(rootId, archivedAt), archive);

  // 2) 하위 가지 전부 삭제
  const childIds = [...(tree[rootId]?.children ?? [])];
  for (const childId of childIds) {
    await deleteBranchRecursive(childId);
  }

  // 3) 줄기를 정리본 하나로 교체 (가지 삭제가 부모 대화를 건드리므로 그 뒤에 저장한다)
  const now = Date.now();
  root.messages = [
    {
      role: "assistant",
      content: summary,
      ts: now,
      consolidated: true,
    },
  ];
  root.status = "active";
  root.updatedAt = now;
  await saveConversation(root);

  // 4) 트리 인덱스 정리 (가지 삭제로 이미 비워졌어야 하지만 확실히 맞춘다)
  const after = await loadTree();
  const rootNode = after[rootId];
  if (rootNode && (rootNode.children.length > 0 || rootNode.status !== "active")) {
    rootNode.children = [];
    rootNode.status = "active";
    await saveTree(after);
  }

  return root;
}
