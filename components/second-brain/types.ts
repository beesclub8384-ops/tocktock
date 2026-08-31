// 제2의 뇌 화면이 함께 쓰는 타입 · 상수 · 순수 함수.
// API와 lib은 건드리지 않고, 화면 쪽에서 쓰는 형태만 여기에 모은다.

export const PASSWORD = "8384";
export const AUTH_KEY = "sb-auth";
export const ROOT_ID = "root";
export const ROOT_TITLE = "제2의 뇌";
/** 가지 생성 시 붙는 임시 제목. 첫 질문이 들어가면 서버가 교체한다 */
export const NEW_BRANCH_TITLE = "새 가지";

export const authHeaders = { "x-sb-key": PASSWORD };

/**
 * 사이트 상단 고정 네비게이션 높이. app/layout.tsx의 paddingTop과 같은 값이다.
 * 이 화면은 그 아래 남은 높이를 꽉 채워 쓴다.
 */
export const SITE_HEADER_H = 88;
/** 100vh 대신 dvh를 써야 키보드가 올라와도 레이아웃이 깨지지 않는다 */
export const SHELL_HEIGHT = `calc(100dvh - ${SITE_HEADER_H}px)`;

export interface SBBranchRef {
  branchId: string;
  summary?: string;
}

export interface SBMessage {
  role: "user" | "assistant";
  content: string;
  ts: number;
  /** 답변을 손으로 고친 시각 */
  editedAt?: number;
  /** 나무 전체를 정리해 줄기로 놓은 메시지 */
  consolidated?: boolean;
  branches?: SBBranchRef[];
  /** 옛 형식(가지 1개) 대비 */
  branchId?: string;
  branchSummary?: string;
}

export interface SBConversation {
  id: string;
  title: string;
  messages: SBMessage[];
  createdAt: number;
  updatedAt: number;
  parentId?: string;
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

/** 옛 형식 메시지도 branches 배열로 취급한다 */
export function messageBranches(m: SBMessage): SBBranchRef[] {
  const branches = Array.isArray(m.branches)
    ? m.branches.filter((b) => b && b.branchId)
    : [];
  if (m.branchId && !branches.some((b) => b.branchId === m.branchId)) {
    return [...branches, { branchId: m.branchId, summary: m.branchSummary }];
  }
  return branches;
}

/**
 * textarea 높이를 내용에 맞춘다. 콜백 ref로도, onChange에서도 쓴다.
 * maxPx를 주면 그 높이에서 멈추고 스크롤로 넘긴다.
 */
export function autoSizeTextarea(
  el: HTMLTextAreaElement | null,
  maxPx = 0
): void {
  if (!el) return;
  el.style.height = "auto";
  const capped = maxPx > 0 && el.scrollHeight > maxPx;
  el.style.height = `${capped ? maxPx : el.scrollHeight}px`;
  el.style.overflowY = capped ? "auto" : "hidden";
}
