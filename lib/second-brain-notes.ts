import { redis } from "./redis.ts";

/** 자유롭게 쓰는 노트. 클로드를 부르지 않는다 */
export interface SBNote {
  id: string;
  title: string;
  /** 마크다운 텍스트 */
  body: string;
  /** 첨부한 사진 URL 목록 */
  images: string[];
  createdAt: number;
  updatedAt: number;
}

/** 목록 화면에서 쓰는 요약 정보 */
export interface SBNoteIndexEntry {
  id: string;
  title: string;
  updatedAt: number;
}

export const SB_NEW_NOTE_TITLE = "새 노트";

// redis.keys() 사용 금지. 목록은 반드시 이 인덱스 키 하나로 구성한다.
const NOTES_KEY = "second-brain:notes";

function noteKey(id: string): string {
  return `second-brain:note:${id}`;
}

function normalizeNote(data: SBNote): SBNote {
  return {
    ...data,
    title: typeof data.title === "string" ? data.title : SB_NEW_NOTE_TITLE,
    body: typeof data.body === "string" ? data.body : "",
    images: Array.isArray(data.images)
      ? data.images.filter((url): url is string => typeof url === "string")
      : [],
  };
}

/** 노트 목록(생성 순). 인덱스가 없으면 빈 목록 */
export async function listNotes(): Promise<SBNoteIndexEntry[]> {
  // Upstash Redis는 자동 직렬화/역직렬화 → JSON.parse 금지
  const data = await redis.get<SBNoteIndexEntry[]>(NOTES_KEY);
  if (!Array.isArray(data)) return [];
  return data.filter((entry) => entry && typeof entry.id === "string");
}

async function saveIndex(entries: SBNoteIndexEntry[]): Promise<void> {
  // Upstash Redis는 자동 직렬화 → JSON.stringify 금지
  await redis.set(NOTES_KEY, entries);
}

export async function loadNote(id: string): Promise<SBNote | null> {
  const data = await redis.get<SBNote>(noteKey(id));
  if (!data) return null;
  return normalizeNote(data);
}

/**
 * 노트를 저장한다. 생성과 갱신을 겸한다.
 * 목록 인덱스의 제목·수정 시각도 함께 맞춘다.
 */
export async function saveNote(note: SBNote): Promise<SBNote> {
  await redis.set(noteKey(note.id), note);

  const entries = await listNotes();
  const entry: SBNoteIndexEntry = {
    id: note.id,
    title: note.title,
    updatedAt: note.updatedAt,
  };

  const index = entries.findIndex((e) => e.id === note.id);
  if (index === -1) {
    // 생성 순서를 유지한다
    entries.push(entry);
  } else {
    entries[index] = entry;
  }
  await saveIndex(entries);

  return note;
}

export async function createNote(): Promise<SBNote> {
  const now = Date.now();
  const note: SBNote = {
    id: crypto.randomUUID(),
    title: SB_NEW_NOTE_TITLE,
    body: "",
    images: [],
    createdAt: now,
    updatedAt: now,
  };
  return saveNote(note);
}

/**
 * 노트를 지운다.
 * 첨부한 사진(Blob)은 지우지 않는다 — 다른 노트가 같은 URL을 쓰고 있을 수 있다.
 */
export async function deleteNote(id: string): Promise<void> {
  const entries = await listNotes();
  const next = entries.filter((e) => e.id !== id);
  if (next.length !== entries.length) await saveIndex(next);

  await redis.del(noteKey(id));
}
