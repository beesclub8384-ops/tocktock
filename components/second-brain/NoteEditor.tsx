"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ActionSheet } from "./ActionSheet";
import type { ActionSheetItem } from "./ActionSheet";
import { MiniMarkdown } from "./MiniMarkdown";
import { authHeaders, SHELL_HEIGHT } from "./types";

interface SBNote {
  id: string;
  title: string;
  body: string;
  images: string[];
  createdAt: number;
  updatedAt: number;
}

/** 자동 저장 디바운스 */
const SAVE_DELAY = 1500;
/** 사진 긴 변 최대 길이 */
const MAX_IMAGE_SIDE = 1600;

type SaveState = "saved" | "saving" | "error";

const SAVE_LABEL: Record<SaveState, string> = {
  saved: "저장됨",
  saving: "저장 중…",
  error: "저장 안 됨",
};

/** 올리기 전에 브라우저에서 줄인다. 원본 그대로 올리면 너무 크다 */
async function shrinkImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(
    1,
    MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height)
  );
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("사진을 줄이지 못했습니다.");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("사진을 줄이지 못했습니다.")),
      "image/jpeg",
      0.8
    );
  });
}

export function NoteEditor({
  noteId,
  isNew,
  onBack,
  onToast,
}: {
  noteId: string;
  isNew: boolean;
  onBack: () => void;
  onToast: (message: string) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  // 타이머·이탈 시점에 최신 값을 읽기 위해 따로 들고 있는다
  const latestRef = useRef({ title: "", body: "", images: [] as string[] });
  const flushRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/second-brain/notes/${noteId}`, {
          headers: authHeaders,
        });
        if (!res.ok) {
          if (!cancelled) setError("노트를 불러오지 못했습니다.");
          return;
        }
        const data = (await res.json()) as { note?: SBNote };
        if (cancelled || !data.note) return;

        setTitle(data.note.title);
        setBody(data.note.body);
        setImages(data.note.images);
        latestRef.current = {
          title: data.note.title,
          body: data.note.body,
          images: data.note.images,
        };
        setLoaded(true);
      } catch {
        if (!cancelled) setError("네트워크 오류로 노트를 불러오지 못했습니다.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  const save = useCallback(async () => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    setSaveState("saving");
    try {
      const res = await fetch(`/api/second-brain/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(latestRef.current),
      });
      if (!res.ok) {
        dirtyRef.current = true;
        setSaveState("error");
        return;
      }
      setSaveState("saved");
    } catch {
      dirtyRef.current = true;
      setSaveState("error");
    }
  }, [noteId]);

  /** 변경이 생기면 1.5초 뒤에 저장한다 */
  const queueSave = useCallback(() => {
    dirtyRef.current = true;
    setSaveState("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void save(), SAVE_DELAY);
  }, [save]);

  // 화면을 벗어날 때 미저장분이 남지 않게 한다
  useEffect(() => {
    flushRef.current = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void save();
    };
  }, [save]);

  useEffect(() => {
    return () => {
      flushRef.current();
    };
  }, []);

  const handleBack = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    void save();
    onBack();
  }, [onBack, save]);

  const handleTitleChange = useCallback(
    (value: string) => {
      setTitle(value);
      latestRef.current = { ...latestRef.current, title: value };
      queueSave();
    },
    [queueSave]
  );

  const handleBodyChange = useCallback(
    (value: string) => {
      setBody(value);
      latestRef.current = { ...latestRef.current, body: value };
      queueSave();
    },
    [queueSave]
  );

  const handlePickFile = useCallback(
    async (file: File) => {
      setError(null);
      setUploading(true);
      try {
        const shrunk = await shrinkImage(file);
        const form = new FormData();
        form.append("file", shrunk, "photo.jpg");

        const res = await fetch("/api/second-brain/notes/upload", {
          method: "POST",
          headers: authHeaders,
          body: form,
        });
        const data = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !data.url) {
          setError(data.error ?? "사진을 올리지 못했습니다.");
          return;
        }

        // 커서 자리에 끼워 넣는다
        const el = bodyRef.current;
        const pos = el ? el.selectionStart : body.length;
        const snippet = `\n![사진](${data.url})\n`;
        const next = body.slice(0, pos) + snippet + body.slice(pos);
        const nextImages = [...images, data.url];

        setBody(next);
        setImages(nextImages);
        latestRef.current = {
          ...latestRef.current,
          body: next,
          images: nextImages,
        };
        queueSave();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "사진을 올리지 못했습니다."
        );
      } finally {
        setUploading(false);
      }
    },
    [body, images, queueSave]
  );

  const handleDelete = useCallback(async () => {
    if (!confirm("이 노트를 삭제할까요? 되돌릴 수 없습니다.")) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    dirtyRef.current = false;
    setError(null);
    try {
      const res = await fetch(`/api/second-brain/notes/${noteId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...authHeaders },
      });
      if (!res.ok) {
        setError("노트를 삭제하지 못했습니다.");
        return;
      }
      onToast("삭제됨");
      onBack();
    } catch {
      setError("네트워크 오류로 노트를 삭제하지 못했습니다.");
    }
  }, [noteId, onBack, onToast]);

  const menuItems: ActionSheetItem[] = [
    {
      label: preview ? "편집 모드" : "보기 모드",
      onSelect: () => setPreview((v) => !v),
    },
    { label: "삭제", destructive: true, onSelect: () => void handleDelete() },
  ];

  return (
    <div
      className="flex flex-col bg-background"
      style={{ height: SHELL_HEIGHT }}
    >
      <header className="shrink-0 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-1 px-2">
          <button
            type="button"
            onClick={handleBack}
            className="flex h-11 shrink-0 items-center rounded-xl px-2.5 text-[15px] text-foreground transition-colors active:bg-card"
          >
            ‹ 목록
          </button>
          <input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="제목"
            className="h-11 min-w-0 flex-1 rounded-xl bg-transparent px-2 text-[16px] font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
            autoFocus={isNew}
          />
          <button
            type="button"
            aria-label="노트 메뉴"
            onClick={() => setMenuOpen(true)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[18px] text-foreground transition-colors active:bg-card"
          >
            ⋯
          </button>
        </div>
      </header>

      {preview ? (
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl px-4 py-4">
            <MiniMarkdown body={body} onImageTap={setZoomUrl} />
          </div>
        </main>
      ) : (
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-3">
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => handleBodyChange(e.target.value)}
              placeholder={loaded ? "무엇이든 적어 두세요" : "불러오는 중…"}
              className="h-full w-full flex-1 resize-none overflow-y-auto rounded-2xl border border-border bg-card px-4 py-3 text-[16px] leading-[1.7] text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>
        </main>
      )}

      {!preview && (
        <div
          className="shrink-0 border-t border-border bg-background/95 backdrop-blur"
          style={{ paddingBottom: "calc(10px + env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto w-full max-w-2xl px-4 pt-2.5">
            {error && (
              <p className="mb-2 text-[14px] leading-[1.5] text-red-500">
                {error}
              </p>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="h-11 shrink-0 rounded-xl border border-border bg-card px-4 text-[15px] text-foreground transition-colors active:bg-border/40 disabled:opacity-40"
              >
                사진
              </button>
              <span className="min-w-0 flex-1 truncate text-right text-[14px] text-muted-foreground">
                {uploading ? "사진 올리는 중…" : SAVE_LABEL[saveState]}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 폰에서는 카메라와 앨범을 함께 고를 수 있다 */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // 같은 사진을 다시 골라도 change가 걸리게 값을 비운다
          e.target.value = "";
          if (file) void handlePickFile(file);
        }}
      />

      {zoomUrl && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/95">
          <button
            type="button"
            aria-label="닫기"
            onClick={() => setZoomUrl(null)}
            className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-[18px] text-white"
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomUrl}
            alt="첨부 사진"
            className="max-h-full max-w-full object-contain"
          />
        </div>
      )}

      <ActionSheet
        open={menuOpen}
        items={menuItems}
        onClose={() => setMenuOpen(false)}
      />
    </div>
  );
}
