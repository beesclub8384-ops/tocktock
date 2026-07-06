"use client";

import { useState, useEffect } from "react";
import { Layers, X } from "lucide-react";

/* ── 사업영역 데이터 (종목코드 → 부문 목록). 회사 추가는 여기에 한 줄씩 ── */
type BizDivision = { title: string; items: { label: string; desc: string }[] };

const BIZ_AREAS: Record<string, BizDivision[]> = {
  // 삼성물산(028260)
  "028260": [
    {
      title: "1. 건설부문",
      items: [
        { label: "건축", desc: "초고층 빌딩, 상업시설, 병원, 데이터센터 등" },
        { label: "토목", desc: "도로, 철도, 항만, 교량 같은 인프라" },
        { label: "플랜트", desc: "발전소, 석유·가스·석유화학 플랜트, 산업 플랜트 EPC" },
        { label: "주택", desc: "래미안 브랜드 중심 아파트·주거 개발" },
      ],
    },
    {
      title: "2. 상사부문(무역·자원)",
      items: [
        { label: "화학·비료", desc: "비료, 화학소재, 합성수지 등 트레이딩" },
        { label: "철강·소재", desc: "탄소강, 스테인리스, 비철금속 등 글로벌 트레이딩" },
        { label: "에너지·자원", desc: "석탄·가스·바이오매스, 팜농장, 바이오연료 등" },
        {
          label: "인프라·신사업",
          desc: "병원·항만·전자정부 등 인프라 프로젝트, 2차전지 원료, 친환경·수소·암모니아 등 신사업",
        },
      ],
    },
    {
      title: "3. 패션부문",
      items: [
        { label: "의류 브랜드", desc: "빈폴, 갤럭시, 에잇세컨즈, 준지 등 브랜드 보유" },
        { label: "유통 채널", desc: "오프라인 매장 + 온라인·D2C(직접판매) 강화" },
      ],
    },
    {
      title: "4. 리조트·기타",
      items: [
        { label: "리조트", desc: "에버랜드, 캐리비안베이, 골프장, 테마파크 운영" },
        {
          label: "기타",
          desc: "정원·전시·웨딩 등 레저 부가사업, 삼성바이오로직스 등 바이오 지분 보유(지주 성격)",
        },
      ],
    },
  ],
};

function BizAreaModal({
  name,
  divisions,
  onClose,
}: {
  name: string;
  divisions: BizDivision[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-4">
          <h2 className="text-base font-bold">{name} 사업영역</h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {divisions.map((d) => (
            <div key={d.title}>
              <h3 className="mb-1.5 text-sm font-semibold">{d.title}</h3>
              <ul className="space-y-1 border-l-2 border-border pl-3">
                {d.items.map((it) => (
                  <li key={it.label} className="text-xs leading-relaxed">
                    <span className="font-medium">{it.label}</span>
                    <span className="text-muted-foreground"> · {it.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* 종목 행에서 회사명 옆 아이콘 — 사업영역 데이터가 있는 종목에만 렌더(없으면 null) */
export function BizAreaIcon({ code, name }: { code: string; name: string }) {
  const [open, setOpen] = useState(false);
  const divisions = BIZ_AREAS[code];
  if (!divisions) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${name} 사업영역 보기`}
        title="사업영역"
        className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
      >
        <Layers className="h-3.5 w-3.5" />
      </button>
      {open && <BizAreaModal name={name} divisions={divisions} onClose={() => setOpen(false)} />}
    </>
  );
}
