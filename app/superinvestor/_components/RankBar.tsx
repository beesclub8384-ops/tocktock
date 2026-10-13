"use client";

import { MONO } from "../_lib/format";

export interface RankBarRow {
  key: string;
  label: string;
  value: number;
  valueLabel: string;
}

/**
 * 티커 + 막대(최댓값 대비 비율) + 값.
 * onSelect 가 있으면 줄마다 <button> (aria-pressed 로 선택 표시), 없으면 그냥 목록.
 */
export function RankBar({
  rows,
  barClassName,
  selectedKey,
  onSelect,
  selectLabel,
}: {
  rows: RankBarRow[];
  barClassName: string;
  selectedKey?: string;
  onSelect?: (key: string) => void;
  /** 버튼 aria-label 앞부분 (예: "매수자 보기") */
  selectLabel?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 0);

  return (
    <ol className="flex flex-col gap-0.5">
      {rows.map((r) => {
        const pct = max > 0 ? Math.max(4, (r.value / max) * 100) : 0;
        const selected = selectedKey === r.key;
        const inner = (
          <>
            <span className="w-[5.25rem] shrink-0 truncate text-[18px] font-medium" style={MONO}>
              {r.label}
            </span>
            <span className="relative h-3.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span
                className={`absolute inset-y-0 left-0 rounded-full ${barClassName} ${onSelect && !selected ? "opacity-50" : ""}`}
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="w-14 shrink-0 text-right text-sm tabular-nums" style={MONO}>
              {r.valueLabel}
            </span>
          </>
        );
        return (
          <li key={r.key}>
            {onSelect ? (
              <button
                type="button"
                aria-pressed={selected}
                aria-label={`${r.label} ${r.valueLabel}${selectLabel ? `, ${selectLabel}` : ""}`}
                onClick={() => onSelect(r.key)}
                className={`flex min-h-9 w-full items-center gap-3 rounded-lg px-2 lg:min-h-11 text-left transition-colors ${
                  selected ? "bg-muted" : "hover:bg-muted/60"
                }`}
              >
                {inner}
              </button>
            ) : (
              <div className="flex min-h-9 items-center gap-3 px-2 lg:min-h-11">{inner}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
