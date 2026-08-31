"use client";

// 노트 보기 모드용 최소 마크다운 렌더러.
// 제목(#, ##) · 문단 · 줄바꿈 · 이미지 네 가지만 다룬다.
// HTML 문자열을 만들지 않고 React 요소로 직접 그리므로 주입 위험이 없다.

/** 한 줄이 통째로 이미지인지 본다: ![alt](url) */
const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;

type Block =
  | { kind: "h1"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "image"; alt: string; url: string }
  | { kind: "p"; lines: string[] };

function parseBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "p", lines: paragraph });
      paragraph = [];
    }
  };

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trimEnd();

    if (line.trim() === "") {
      flush();
      continue;
    }

    const image = IMAGE_LINE.exec(line.trim());
    if (image) {
      flush();
      blocks.push({ kind: "image", alt: image[1], url: image[2] });
      continue;
    }

    if (line.startsWith("## ")) {
      flush();
      blocks.push({ kind: "h2", text: line.slice(3).trim() });
      continue;
    }
    if (line.startsWith("# ")) {
      flush();
      blocks.push({ kind: "h1", text: line.slice(2).trim() });
      continue;
    }

    paragraph.push(line);
  }
  flush();

  return blocks;
}

export function MiniMarkdown({
  body,
  onImageTap,
}: {
  body: string;
  onImageTap: (url: string) => void;
}) {
  const blocks = parseBlocks(body);

  if (blocks.length === 0) {
    return (
      <p className="py-20 text-center text-[16px] text-muted-foreground">
        아직 아무것도 쓰지 않았습니다
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {blocks.map((block, i) => {
        if (block.kind === "h1") {
          return (
            <h2 key={i} className="text-[22px] font-bold leading-[1.4]">
              {block.text}
            </h2>
          );
        }
        if (block.kind === "h2") {
          return (
            <h3 key={i} className="text-[19px] font-bold leading-[1.4]">
              {block.text}
            </h3>
          );
        }
        if (block.kind === "image") {
          return (
            <button
              key={i}
              type="button"
              onClick={() => onImageTap(block.url)}
              className="block w-full"
            >
              {/* 첨부 사진은 외부 Blob URL이라 next/image 최적화 대상이 아니다 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={block.url}
                alt={block.alt || "첨부 사진"}
                className="w-full rounded-2xl border border-border"
              />
            </button>
          );
        }
        return (
          <p
            key={i}
            className="whitespace-pre-wrap break-words text-[16px] leading-[1.7] text-foreground"
          >
            {block.lines.join("\n")}
          </p>
        );
      })}
    </div>
  );
}
