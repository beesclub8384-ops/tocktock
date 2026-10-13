"use client";

import { useId, useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";

/** "왜 중요해요?" 한 줄. 누르면 2~3줄 설명이 펼쳐진다. */
export function WhyRow({ summary, detail }: { summary: string; detail: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-2 rounded-lg py-1 text-left text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <HelpCircle size={16} className="mt-px shrink-0" aria-hidden />
        <span className="flex-1">{summary}</span>
        <ChevronDown
          size={16}
          aria-hidden
          className={`mt-px shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
        />
      </button>
      <p
        id={panelId}
        hidden={!open}
        className="mt-1.5 pl-6 text-[13px] leading-relaxed text-muted-foreground"
      >
        {detail}
      </p>
    </div>
  );
}
