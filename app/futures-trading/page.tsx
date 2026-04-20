"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Trash2, ChevronDown, ChevronUp, MessageCircle, Send, Megaphone } from "lucide-react";
import { useRef } from "react";

interface FuturesRecord {
  id: string;
  date: string;
  direction: "long" | "short";
  entryTime: string;
  entryPoint: number;
  exitTime: string;
  exitPoint: number;
  contracts: number;
  pnl: number;
  memo: string;
  createdAt: string;
}

interface QAReply {
  id: string;
  author: "태양" | "용태";
  content: string;
  createdAt: string;
}

interface QAItem {
  id: string;
  title: string;
  replies: QAReply[];
  createdAt: string;
}

interface MessageItem {
  id: string;
  author: "태양" | "용태";
  content: string;
  createdAt: string;
}

const MULTIPLIER = 250000;

function calcPnl(
  direction: "long" | "short",
  entry: number,
  exit: number,
  contracts: number
): number {
  if (!entry || !exit || !contracts) return 0;
  const diff = direction === "long" ? exit - entry : entry - exit;
  return diff * contracts * MULTIPLIER;
}

function formatKRW(n: number): string {
  const abs = Math.abs(n);
  const sign = n >= 0 ? "+" : "-";
  return `${sign}${abs.toLocaleString("ko-KR")}원`;
}

// ── 비밀번호 화면 ──

function PasswordGate({ onAuth }: { onAuth: (pw: string) => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === "8384") {
      onAuth(pw);
    } else {
      setError(true);
      setPw("");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ── 히어로 이미지 ── */}
      <div className="relative h-[500px] w-full overflow-hidden bg-black">
        <img
          src="/images/futures-hero.png"
          alt="영웅들의 선물"
          className="absolute inset-0 h-full w-full object-contain object-center"
        />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background via-background/50 to-transparent" />
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-12">
          <h1 className="text-4xl font-bold tracking-tight text-white drop-shadow-lg sm:text-5xl">
            영웅들의 선물
          </h1>
          <p className="mt-2 text-sm text-white/80 drop-shadow-md sm:text-base">
            코스피200 선물 실시간 모니터링 &amp; 매매 검증 시스템
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-8 space-y-10">

        {/* ── 비밀번호 입력 (매매 기록 접근) ── */}
        <section className="flex justify-center pt-4">
          <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-4">
            <h2 className="text-lg font-bold text-center">매매 기록 열기</h2>
            <p className="text-sm text-center text-muted-foreground">
              비밀번호를 입력하면 매매 기록 페이지로 이동합니다
            </p>
            <input
              type="password"
              value={pw}
              onChange={(e) => {
                setPw(e.target.value);
                setError(false);
              }}
              className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
              placeholder="비밀번호"
              autoFocus
            />
            {error && (
              <p className="text-sm text-red-400 text-center">
                비밀번호가 틀렸습니다
              </p>
            )}
            <button
              type="submit"
              className="w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
            >
              확인
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

// ── 입력 폼 ──

function RecordForm({
  password,
  onAdded,
}: {
  password: string;
  onAdded: () => void;
}) {
  const [date, setDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [entryTime, setEntryTime] = useState("");
  const [entryPoint, setEntryPoint] = useState("");
  const [exitTime, setExitTime] = useState("");
  const [exitPoint, setExitPoint] = useState("");
  const [contracts, setContracts] = useState("1");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const pnl = calcPnl(
    direction,
    Number(entryPoint),
    Number(exitPoint),
    Number(contracts)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryTime || !entryPoint || !exitTime || !exitPoint || !contracts)
      return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/futures-trading", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-password": password,
        },
        body: JSON.stringify({
          date,
          direction,
          entryTime,
          entryPoint: Number(entryPoint),
          exitTime,
          exitPoint: Number(exitPoint),
          contracts: Number(contracts),
          pnl,
          memo,
        }),
      });
      if (res.ok) {
        setEntryTime("");
        setEntryPoint("");
        setExitTime("");
        setExitPoint("");
        setContracts("1");
        setMemo("");
        onAdded();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border bg-card p-5 space-y-4"
    >
      <h2 className="text-lg font-bold">매매 기록 입력</h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* 날짜 */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            날짜
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>

        {/* 방향 */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            방향
          </label>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setDirection("long")}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                direction === "long"
                  ? "bg-red-500/15 text-red-400 border border-red-500/30"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              롱
            </button>
            <button
              type="button"
              onClick={() => setDirection("short")}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                direction === "short"
                  ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              숏
            </button>
          </div>
        </div>

        {/* 진입 시간 */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            진입 시간
          </label>
          <input
            type="text"
            placeholder="09:05"
            value={entryTime}
            onChange={(e) => setEntryTime(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>

        {/* 진입 포인트 */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            진입 포인트
          </label>
          <input
            type="number"
            step="any"
            placeholder="370.50"
            value={entryPoint}
            onChange={(e) => setEntryPoint(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>

        {/* 청산 시간 */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            청산 시간
          </label>
          <input
            type="text"
            placeholder="10:30"
            value={exitTime}
            onChange={(e) => setExitTime(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>

        {/* 청산 포인트 */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            청산 포인트
          </label>
          <input
            type="number"
            step="any"
            placeholder="372.00"
            value={exitPoint}
            onChange={(e) => setExitPoint(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>

        {/* 계약수 */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            계약수
          </label>
          <input
            type="number"
            min="1"
            value={contracts}
            onChange={(e) => setContracts(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>

        {/* 손익 (자동계산) */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            손익 (자동계산)
          </label>
          <div
            className={`rounded-md border border-border px-3 py-2 text-sm font-bold tabular-nums ${
              pnl > 0
                ? "text-red-400"
                : pnl < 0
                  ? "text-blue-400"
                  : "text-muted-foreground"
            }`}
            style={{ fontFamily: "'DM Mono', monospace" }}
          >
            {formatKRW(pnl)}
          </div>
        </div>
      </div>

      {/* 메모 */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">
          메모
        </label>
        <input
          type="text"
          placeholder="진입 근거, 느낀 점 등"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />
      </div>

      <button
        type="submit"
        disabled={submitting || !entryTime || !entryPoint || !exitTime || !exitPoint}
        className="rounded-lg bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-40"
      >
        {submitting ? "저장 중..." : "기록 추가"}
      </button>
    </form>
  );
}

// ── 통계 요약 ──

function Stats({ records }: { records: FuturesRecord[] }) {
  const total = records.length;
  const wins = records.filter((r) => r.pnl > 0).length;
  const losses = records.filter((r) => r.pnl < 0).length;
  const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : "0.0";
  const totalPnl = records.reduce((sum, r) => sum + r.pnl, 0);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">총 거래</p>
        <p className="text-2xl font-bold tabular-nums">{total}회</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">승/패</p>
        <p className="text-2xl font-bold tabular-nums">
          <span className="text-red-400">{wins}</span>
          <span className="text-muted-foreground mx-1">/</span>
          <span className="text-blue-400">{losses}</span>
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">승률</p>
        <p className="text-2xl font-bold tabular-nums">{winRate}%</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">총 손익</p>
        <p
          className={`text-2xl font-bold tabular-nums ${
            totalPnl > 0
              ? "text-red-400"
              : totalPnl < 0
                ? "text-blue-400"
                : ""
          }`}
          style={{ fontFamily: "'DM Mono', monospace" }}
        >
          {formatKRW(totalPnl)}
        </p>
      </div>
    </div>
  );
}

// ── 매매 내역 테이블 ──

function RecordTable({
  records,
  password,
  onDeleted,
  onUpdated,
}: {
  records: FuturesRecord[];
  password: string;
  onDeleted: () => void;
  onUpdated: () => void;
}) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [editingMemoText, setEditingMemoText] = useState("");
  const [savingMemo, setSavingMemo] = useState(false);

  const handleDelete = async (id: string) => {
    if (!confirm("이 기록을 삭제하시겠습니까?")) return;
    setDeleting(id);
    try {
      await fetch("/api/futures-trading", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-password": password,
        },
        body: JSON.stringify({ id }),
      });
      onDeleted();
    } finally {
      setDeleting(null);
    }
  };

  const startEditMemo = (r: FuturesRecord) => {
    setEditingMemoId(r.id);
    setEditingMemoText(r.memo);
  };

  const cancelEditMemo = () => {
    setEditingMemoId(null);
    setEditingMemoText("");
  };

  const saveMemo = async (id: string) => {
    setSavingMemo(true);
    try {
      const res = await fetch("/api/futures-trading", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-password": password,
        },
        body: JSON.stringify({ id, memo: editingMemoText }),
      });
      if (res.ok) {
        setEditingMemoId(null);
        setEditingMemoText("");
        onUpdated();
      }
    } finally {
      setSavingMemo(false);
    }
  };

  // 날짜+진입시간 오름차순 정렬 → 고유번호 부여
  const sorted = [...records].sort((a, b) => {
    const ka = `${a.date} ${a.entryTime}`;
    const kb = `${b.date} ${b.entryTime}`;
    return ka.localeCompare(kb);
  });
  const numberMap = new Map<string, number>();
  sorted.forEach((r, i) => numberMap.set(r.id, i + 1));

  const toggle = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  if (records.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl border border-border bg-card">
        <p className="text-sm text-muted-foreground">
          아직 기록이 없습니다. 위에서 매매를 입력해보세요.
        </p>
      </div>
    );
  }

  // 상세 펼침 영역
  const DetailRow = ({ r, colSpan }: { r: FuturesRecord; colSpan: number }) => (
    <tr>
      <td colSpan={colSpan} className="px-0 py-0">
        <div className="bg-muted/40 px-5 py-4 border-b border-border/50">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <span className="text-xs text-muted-foreground">번호</span>
              <p className="font-medium">#{numberMap.get(r.id)}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">날짜</span>
              <p className="font-medium tabular-nums">{r.date}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">방향</span>
              <p className={`font-medium ${r.direction === "long" ? "text-red-400" : "text-blue-400"}`}>
                {r.direction === "long" ? "롱 (매수)" : "숏 (매도)"}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">계약수</span>
              <p className="font-medium tabular-nums">{r.contracts}계약</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">진입</span>
              <p className="font-medium tabular-nums">{r.entryTime} / {r.entryPoint}p</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">청산</span>
              <p className="font-medium tabular-nums">{r.exitTime} / {r.exitPoint}p</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">포인트 차이</span>
              <p className="font-medium tabular-nums">
                {r.direction === "long"
                  ? (r.exitPoint - r.entryPoint).toFixed(2)
                  : (r.entryPoint - r.exitPoint).toFixed(2)}
                p
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">손익</span>
              <p
                className={`font-bold tabular-nums ${
                  r.pnl > 0 ? "text-red-400" : r.pnl < 0 ? "text-blue-400" : ""
                }`}
                style={{ fontFamily: "'DM Mono', monospace" }}
              >
                {formatKRW(r.pnl)}
              </p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-muted-foreground">메모</span>
              {editingMemoId !== r.id && (
                <button
                  onClick={() => startEditMemo(r)}
                  className="text-xs font-medium text-blue-500 hover:text-blue-600 transition-colors"
                >
                  수정
                </button>
              )}
            </div>
            {editingMemoId === r.id ? (
              <div className="space-y-2">
                <textarea
                  value={editingMemoText}
                  onChange={(e) => setEditingMemoText(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-y"
                  placeholder="메모를 입력하세요"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => saveMemo(r.id)}
                    disabled={savingMemo}
                    className="rounded-md bg-foreground px-3 py-1 text-xs font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-40"
                  >
                    {savingMemo ? "저장중..." : "저장"}
                  </button>
                  <button
                    onClick={cancelEditMemo}
                    disabled={savingMemo}
                    className="rounded-md bg-muted px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/80 disabled:opacity-40"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm whitespace-pre-wrap">
                {r.memo || <span className="text-muted-foreground">(메모 없음)</span>}
              </p>
            )}
          </div>
        </div>
      </td>
    </tr>
  );

  return (
    <>
      {/* PC 테이블 */}
      <div className="hidden sm:block overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-center px-2 py-2.5 font-medium w-10">#</th>
              <th className="text-left px-3 py-2.5 font-medium">날짜</th>
              <th className="text-center px-3 py-2.5 font-medium">방향</th>
              <th className="text-left px-3 py-2.5 font-medium">진입</th>
              <th className="text-left px-3 py-2.5 font-medium">청산</th>
              <th className="text-right px-3 py-2.5 font-medium">계약</th>
              <th className="text-right px-3 py-2.5 font-medium">손익</th>
              <th className="text-left px-3 py-2.5 font-medium">메모</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => {
              const isOpen = expandedId === r.id;
              return (
                <Fragment key={r.id}>
                  <tr className={`border-b border-border/50 transition-colors ${isOpen ? "bg-muted/40" : "hover:bg-muted/30"}`}>
                    <td className="px-2 py-2.5 text-center text-xs text-muted-foreground tabular-nums">
                      {numberMap.get(r.id)}
                    </td>
                    <td
                      className="px-3 py-2.5 tabular-nums whitespace-nowrap cursor-pointer select-none"
                      onClick={() => toggle(r.id)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {r.date}
                        {isOpen
                          ? <ChevronUp size={12} className="text-muted-foreground" />
                          : <ChevronDown size={12} className="text-muted-foreground" />}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          r.direction === "long"
                            ? "bg-red-500/15 text-red-400"
                            : "bg-blue-500/15 text-blue-400"
                        }`}
                      >
                        {r.direction === "long" ? "롱" : "숏"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                      {r.entryTime} / {r.entryPoint}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                      {r.exitTime} / {r.exitPoint}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.contracts}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right tabular-nums font-semibold ${
                        r.pnl > 0 ? "text-red-400" : r.pnl < 0 ? "text-blue-400" : ""
                      }`}
                      style={{ fontFamily: "'DM Mono', monospace" }}
                    >
                      {formatKRW(r.pnl)}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground max-w-[200px] truncate">
                      {r.memo}
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => handleDelete(r.id)}
                        disabled={deleting === r.id}
                        className="text-muted-foreground hover:text-red-400 transition-colors disabled:opacity-40"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                  {isOpen && <DetailRow r={r} colSpan={9} />}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 모바일 카드 */}
      <div className="sm:hidden flex flex-col gap-3">
        {records.map((r) => {
          const isOpen = expandedId === r.id;
          return (
            <div
              key={r.id}
              className="rounded-lg border border-border bg-card overflow-hidden"
            >
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div
                    className="flex items-center gap-2 cursor-pointer select-none"
                    onClick={() => toggle(r.id)}
                  >
                    <span className="text-xs text-muted-foreground tabular-nums">
                      #{numberMap.get(r.id)}
                    </span>
                    <span className="text-sm tabular-nums">{r.date}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        r.direction === "long"
                          ? "bg-red-500/15 text-red-400"
                          : "bg-blue-500/15 text-blue-400"
                      }`}
                    >
                      {r.direction === "long" ? "롱" : "숏"}
                    </span>
                    {isOpen
                      ? <ChevronUp size={12} className="text-muted-foreground" />
                      : <ChevronDown size={12} className="text-muted-foreground" />}
                  </div>
                  <button
                    onClick={() => handleDelete(r.id)}
                    disabled={deleting === r.id}
                    className="text-muted-foreground hover:text-red-400 transition-colors disabled:opacity-40"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-1">
                  <span>진입 {r.entryTime} / {r.entryPoint}</span>
                  <span>→</span>
                  <span>청산 {r.exitTime} / {r.exitPoint}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {r.contracts}계약
                  </span>
                  <span
                    className={`text-sm font-bold tabular-nums ${
                      r.pnl > 0 ? "text-red-400" : r.pnl < 0 ? "text-blue-400" : ""
                    }`}
                    style={{ fontFamily: "'DM Mono', monospace" }}
                  >
                    {formatKRW(r.pnl)}
                  </span>
                </div>
              </div>
              {isOpen && (
                <div className="bg-muted/40 px-4 py-3 border-t border-border/50">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground">포인트 차이</span>
                      <p className="font-medium tabular-nums">
                        {r.direction === "long"
                          ? (r.exitPoint - r.entryPoint).toFixed(2)
                          : (r.entryPoint - r.exitPoint).toFixed(2)}p
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">손익</span>
                      <p
                        className={`font-bold tabular-nums ${
                          r.pnl > 0 ? "text-red-400" : r.pnl < 0 ? "text-blue-400" : ""
                        }`}
                        style={{ fontFamily: "'DM Mono', monospace" }}
                      >
                        {formatKRW(r.pnl)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-muted-foreground">메모</span>
                      {editingMemoId !== r.id && (
                        <button
                          onClick={() => startEditMemo(r)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          수정
                        </button>
                      )}
                    </div>
                    {editingMemoId === r.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editingMemoText}
                          onChange={(e) => setEditingMemoText(e.target.value)}
                          rows={3}
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-y"
                          placeholder="메모를 입력하세요"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveMemo(r.id)}
                            disabled={savingMemo}
                            className="rounded-md bg-foreground px-3 py-1 text-xs font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-40"
                          >
                            {savingMemo ? "저장중..." : "저장"}
                          </button>
                          <button
                            onClick={cancelEditMemo}
                            disabled={savingMemo}
                            className="rounded-md bg-muted px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/80 disabled:opacity-40"
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">
                        {r.memo || <span className="text-muted-foreground">(메모 없음)</span>}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── 질문/답변 ──

function QAThreadCard({
  thread,
  password,
  onChanged,
}: {
  thread: QAItem;
  password: string;
  onChanged: () => void;
}) {
  const [author, setAuthor] = useState<"태양" | "용태">("태양");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);

  const fmtTime = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  };

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/futures-trading/qa", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-password": password },
        body: JSON.stringify({ qaId: thread.id, author, content }),
      });
      if (res.ok) {
        setContent("");
        onChanged();
      }
    } finally {
      setSending(false);
    }
  };

  const removeReply = async (replyId: string) => {
    if (!confirm("댓글을 삭제하시겠습니까?")) return;
    const res = await fetch("/api/futures-trading/qa", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-password": password },
      body: JSON.stringify({ type: "reply", qaId: thread.id, replyId }),
    });
    if (res.ok) onChanged();
  };

  const removeThread = async () => {
    if (!confirm("스레드 전체를 삭제하시겠습니까?")) return;
    const res = await fetch("/api/futures-trading/qa", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-password": password },
      body: JSON.stringify({ type: "thread", qaId: thread.id }),
    });
    if (res.ok) onChanged();
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* 스레드 헤더 (최초 질문) */}
      <div className="flex items-start justify-between gap-3 border-b border-border/60 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug whitespace-pre-wrap break-words">
            {thread.title}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {fmtTime(thread.createdAt)} · 댓글 {thread.replies.length}
          </p>
        </div>
        <button
          onClick={removeThread}
          className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-red-400/50 hover:text-red-400"
          aria-label="스레드 삭제"
        >
          삭제
        </button>
      </div>

      {/* 댓글 목록 (채팅 스타일) */}
      <div className="space-y-3 px-4 py-4">
        {thread.replies.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            아직 댓글이 없습니다.
          </p>
        ) : (
          thread.replies.map((reply) => {
            const isSun = reply.author === "태양";
            return (
              <div
                key={reply.id}
                className={`flex ${isSun ? "justify-end" : "justify-start"}`}
              >
                <div className={`group max-w-[75%] ${isSun ? "items-end" : "items-start"}`}>
                  <p className={`text-xs font-medium mb-0.5 ${isSun ? "text-right text-blue-400" : "text-left text-foreground/60"}`}>
                    {reply.author}
                  </p>
                  <div
                    className={`relative rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                      isSun
                        ? "bg-blue-600 text-white rounded-tr-sm"
                        : "bg-muted text-foreground rounded-tl-sm"
                    }`}
                  >
                    {reply.content}
                    <button
                      onClick={() => removeReply(reply.id)}
                      className={`absolute top-1 opacity-0 group-hover:opacity-100 transition-opacity ${
                        isSun ? "-left-6" : "-right-6"
                      } text-muted-foreground hover:text-red-400`}
                      aria-label="댓글 삭제"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <p className={`text-[10px] text-muted-foreground mt-0.5 ${isSun ? "text-right" : "text-left"}`}>
                    {fmtTime(reply.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 댓글 입력 폼 */}
      <form onSubmit={sendReply} className="border-t border-border/60 bg-muted/20 px-4 py-3 space-y-2">
        <div className="flex gap-2">
          {(["태양", "용태"] as const).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setAuthor(name)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                author === name
                  ? name === "태양"
                    ? "bg-blue-600 text-white"
                    : "bg-foreground/80 text-background"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={2}
            placeholder={`${author}으로 댓글을 남겨주세요`}
            className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendReply(e);
              }
            }}
          />
          <button
            type="submit"
            disabled={sending || !content.trim()}
            className="self-end rounded-lg bg-blue-600 px-3 py-2.5 text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
            aria-label="댓글 전송"
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}

function QASection({ password }: { password: string }) {
  const [threads, setThreads] = useState<QAItem[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [posting, setPosting] = useState(false);

  const fetchThreads = useCallback(async () => {
    try {
      const res = await fetch("/api/futures-trading/qa", {
        headers: { "x-password": password },
      });
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads ?? []);
      }
    } catch {}
  }, [password]);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  const submitThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setPosting(true);
    try {
      const res = await fetch("/api/futures-trading/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-password": password },
        body: JSON.stringify({ title: newTitle }),
      });
      if (res.ok) {
        setNewTitle("");
        fetchThreads();
      }
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 새 질문 등록 */}
      <form
        onSubmit={submitThread}
        className="rounded-xl border border-border bg-card p-5 space-y-3"
      >
        <h2 className="text-lg font-bold flex items-center gap-2">
          <MessageCircle size={18} />
          새 질문 등록
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="궁금한 내용을 한 줄로 적어주세요"
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
          <button
            type="submit"
            disabled={posting || !newTitle.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
          >
            등록
          </button>
        </div>
      </form>

      {/* 스레드 목록 */}
      {threads.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-xl border border-border bg-card">
          <p className="text-sm text-muted-foreground">
            아직 등록된 질문이 없습니다.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {threads.map((thread) => (
            <QAThreadCard
              key={thread.id}
              thread={thread}
              password={password}
              onChanged={fetchThreads}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── 자유전달판 ──

function MessageBoard({ password }: { password: string }) {
  const [msgs, setMsgs] = useState<MessageItem[]>([]);
  const [author, setAuthor] = useState<"태양" | "용태">("태양");
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMsgs = useCallback(async () => {
    try {
      const res = await fetch("/api/futures-trading/messages", {
        headers: { "x-password": password },
      });
      if (res.ok) {
        const data = await res.json();
        setMsgs(data.messages ?? []);
      }
    } catch {}
  }, [password]);

  useEffect(() => { fetchMsgs(); }, [fetchMsgs]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setPosting(true);
    try {
      const res = await fetch("/api/futures-trading/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-password": password },
        body: JSON.stringify({ author, content: text }),
      });
      if (res.ok) { setText(""); fetchMsgs(); }
    } finally { setPosting(false); }
  };

  const del = async (id: string) => {
    if (!confirm("이 메시지를 삭제하시겠습니까?")) return;
    await fetch("/api/futures-trading/messages", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-password": password },
      body: JSON.stringify({ id }),
    });
    fetchMsgs();
  };

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  };

  return (
    <div className="space-y-4">
      {/* 채팅 영역 */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="h-[480px] overflow-y-auto p-4 space-y-3">
          {msgs.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground">아직 메시지가 없습니다.</p>
            </div>
          )}
          {msgs.map((m) => {
            const isSun = m.author === "태양";
            return (
              <div
                key={m.id}
                className={`flex ${isSun ? "justify-end" : "justify-start"}`}
              >
                <div className={`group max-w-[75%] ${isSun ? "items-end" : "items-start"}`}>
                  {/* 작성자 이름 */}
                  <p className={`text-xs font-medium mb-0.5 ${isSun ? "text-right text-blue-400" : "text-left text-foreground/60"}`}>
                    {m.author}
                  </p>
                  {/* 말풍선 */}
                  <div
                    className={`relative rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                      isSun
                        ? "bg-blue-600 text-white rounded-tr-sm"
                        : "bg-muted text-foreground rounded-tl-sm"
                    }`}
                  >
                    {m.content}
                    {/* 삭제 버튼 — hover 시 표시 */}
                    <button
                      onClick={() => del(m.id)}
                      className={`absolute top-1 opacity-0 group-hover:opacity-100 transition-opacity ${
                        isSun ? "-left-6" : "-right-6"
                      } text-muted-foreground hover:text-red-400`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  {/* 시간 */}
                  <p className={`text-[10px] text-muted-foreground mt-0.5 ${isSun ? "text-right" : "text-left"}`}>
                    {fmtTime(m.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* 입력 영역 */}
      <form onSubmit={send} className="rounded-xl border border-border bg-card p-4 space-y-3">
        {/* 작성자 선택 */}
        <div className="flex gap-2">
          {(["태양", "용태"] as const).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setAuthor(name)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                author === name
                  ? name === "태양"
                    ? "bg-blue-600 text-white"
                    : "bg-foreground/80 text-background"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
        {/* 메시지 입력 */}
        <div className="flex gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder="메시지를 입력하세요"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(e); }
            }}
          />
          <button
            type="submit"
            disabled={posting || !text.trim()}
            className="self-end rounded-lg bg-blue-600 px-4 py-2.5 text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}

// ── 메인 페이지 ──

export default function FuturesTradingPage() {
  const [password, setPassword] = useState<string | null>(null);
  const [records, setRecords] = useState<FuturesRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"records" | "qa" | "board">("records");

  const fetchRecords = useCallback(async () => {
    if (!password) return;
    setLoading(true);
    try {
      const res = await fetch("/api/futures-trading", {
        headers: { "x-password": password },
      });
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  if (!password) {
    return <PasswordGate onAuth={setPassword} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-8">
        <header className="mb-6">
          <h1 className="mb-2 text-3xl font-bold tracking-tight">
            선물매매 검증
          </h1>
          <p className="text-sm text-muted-foreground">
            매매 기록을 남기고, 패턴을 찾고, 실력을 검증합니다.
          </p>
        </header>

        {/* 탭 */}
        <div className="flex gap-1 mb-6 border-b border-border">
          <button
            onClick={() => setTab("records")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === "records"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            매매 기록
          </button>
          <button
            onClick={() => setTab("qa")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
              tab === "qa"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <MessageCircle size={14} />
            질문/답변
          </button>
          <button
            onClick={() => setTab("board")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
              tab === "board"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Megaphone size={14} />
            자유전달판
          </button>
        </div>

        {/* 탭 내용 */}
        {tab === "records" ? (
          <div className="space-y-6">
            <RecordForm password={password} onAdded={fetchRecords} />

            {loading ? (
              <div className="flex h-32 items-center justify-center">
                <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
              </div>
            ) : (
              <>
                <Stats records={records} />
                <RecordTable
                  records={records}
                  password={password}
                  onDeleted={fetchRecords}
                  onUpdated={fetchRecords}
                />
              </>
            )}
          </div>
        ) : tab === "qa" ? (
          <QASection password={password} />
        ) : (
          <MessageBoard password={password} />
        )}
      </div>
    </div>
  );
}
