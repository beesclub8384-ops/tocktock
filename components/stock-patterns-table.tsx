"use client";

import { useMemo, useState } from "react";

export interface Candidate {
  rank: number;
  condition: string;
  prob: number;
  occ: number;
  lift: number;
  avg: number;
}

type SortKey = "prob" | "occ" | "lift" | "avg";

const COLUMNS: { key: SortKey; label: string; hint: string }[] = [
  { key: "prob", label: "다음날 상승 빈도(과거)", hint: "예측 승률이 아님 — 과거 in-sample 빈도" },
  { key: "occ", label: "발생 횟수", hint: "표본 크기 (작을수록 노이즈 위험)" },
  { key: "lift", label: "기준선 대비", hint: "기준선(51.1%) 대비 %p 차이" },
  { key: "avg", label: "평균 수익(과거)", hint: "다음날 종가 기준, 비용 미반영" },
];

const INITIAL_VISIBLE = 50;

export function StockPatternsTable({
  candidates,
  baseRate,
}: {
  candidates: Candidate[];
  baseRate: number;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("prob");
  const [desc, setDesc] = useState(true);
  const [visible, setVisible] = useState(INITIAL_VISIBLE);

  const filtered = useMemo(() => {
    const q = query.trim();
    const base = q
      ? candidates.filter((c) => c.condition.includes(q))
      : candidates;
    const sorted = [...base].sort((a, b) =>
      desc ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]
    );
    return sorted;
  }, [candidates, query, sortKey, desc]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setDesc((d) => !d);
    } else {
      setSortKey(key);
      setDesc(true);
    }
    setVisible(INITIAL_VISIBLE);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setVisible(INITIAL_VISIBLE);
          }}
          placeholder="조건 검색 (예: RSI, 음봉, 거래량)"
          className="w-full max-w-xs rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <span className="text-sm text-muted-foreground">
          {filtered.length}개 조건
        </span>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-3 py-2 text-left font-medium">조건</th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="cursor-pointer select-none px-3 py-2 text-right font-medium whitespace-nowrap hover:text-foreground"
                  onClick={() => toggleSort(col.key)}
                  title={col.hint}
                >
                  {col.label}
                  {sortKey === col.key ? (desc ? " ▾" : " ▴") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, visible).map((c, i) => (
              <tr
                key={`${c.condition}-${i}`}
                className="border-b border-border/50 last:border-0 hover:bg-accent/40"
              >
                <td className="px-3 py-2 font-mono text-xs sm:text-sm">
                  {c.condition}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {c.prob.toFixed(1)}%
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {c.occ}회
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {c.lift >= 0 ? "+" : ""}
                  {c.lift.toFixed(1)}%p
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {c.avg.toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visible < filtered.length && (
        <button
          onClick={() => setVisible((v) => v + 100)}
          className="mt-3 w-full rounded-md border border-border py-2 text-sm text-muted-foreground hover:bg-accent"
        >
          더 보기 ({filtered.length - visible}개 남음)
        </button>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        기준선(아무 조건 없을 때 다음날 상승 빈도): {baseRate}%. 위 빈도는 전체기간
        과거 데이터에서 단순 집계한 값이며, 검증을 통과한 예측 신호가 아닙니다.
      </p>
    </div>
  );
}
