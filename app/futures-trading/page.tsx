"use client";

import { useState, useEffect, useCallback } from "react";
import { Trash2 } from "lucide-react";

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
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-8">
        {/* ── 영웅들의 선물 소개 ── */}
        <section className="mb-12">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            영웅들의 선물
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            코스피200 선물 실시간 모니터링 &amp; 매매 검증 시스템
          </p>

          <div className="rounded-xl border border-border bg-card p-6 space-y-6">
            {/* 개요 */}
            <div>
              <p className="text-sm leading-relaxed text-foreground/80">
                <strong>영웅들의 선물</strong>은 코스피200 선물 시장의 실시간 가격과
                투자자별 수급 데이터를 모니터링하는 프로그램입니다.
                키움증권 Open API+를 기반으로 작동하며, 매매 기록을 남기고 패턴을 분석할 수 있습니다.
              </p>
            </div>

            {/* 주간/야간 시간표 */}
            <div>
              <h3 className="text-sm font-semibold mb-2">거래 시간대</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">시간</th>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">세션</th>
                      <th className="pb-2 font-medium text-muted-foreground">실시간 타입</th>
                    </tr>
                  </thead>
                  <tbody className="text-foreground/80">
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 tabular-nums">09:00 ~ 15:30</td>
                      <td className="py-2 pr-4">
                        <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-500">주간장</span>
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">0K(시세) / 0z(투자자)</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 tabular-nums">18:00 ~ 익일 06:00</td>
                      <td className="py-2 pr-4">
                        <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-500">야간장</span>
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">NK(시세) / Nz(투자자)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 화면 구성 */}
            <div>
              <h3 className="text-sm font-semibold mb-2">모니터링 화면</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">선물 시세 (좌측)</p>
                  <p className="text-sm text-foreground/80">
                    현재가, 전일대비, 등락율, 거래량, 매도/매수호가를 실시간으로 표시합니다.
                    상승은 빨간색, 하락은 파란색입니다.
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">투자자별 수급 (우측)</p>
                  <p className="text-sm text-foreground/80">
                    개인, 외국인, 기관계의 매도/매수/순매수를 표시합니다.
                    순매수 양수는 빨간색, 음수는 파란색입니다.
                  </p>
                </div>
              </div>
            </div>

            {/* 현재 상태 */}
            <div>
              <h3 className="text-sm font-semibold mb-2">현재 진행 상태</h3>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-xs text-green-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />실서버 로그인
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-xs text-green-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />종목코드 자동인식
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-xs text-green-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />주간/야간 자동전환
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-1 text-xs text-yellow-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />실시간 시세 확인중
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />매매 로직 준비중
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── 비밀번호 입력 (매매 기록 접근) ── */}
        <section className="flex justify-center">
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
}: {
  records: FuturesRecord[];
  password: string;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState<string | null>(null);

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

  if (records.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl border border-border bg-card">
        <p className="text-sm text-muted-foreground">
          아직 기록이 없습니다. 위에서 매매를 입력해보세요.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* PC 테이블 */}
      <div className="hidden sm:block overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
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
            {records.map((r) => (
              <tr
                key={r.id}
                className="border-b border-border/50 hover:bg-muted/30 transition-colors"
              >
                <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                  {r.date}
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
            ))}
          </tbody>
        </table>
      </div>

      {/* 모바일 카드 */}
      <div className="sm:hidden flex flex-col gap-3">
        {records.map((r) => (
          <div
            key={r.id}
            className="rounded-lg border border-border bg-card p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
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
              <span>
                진입 {r.entryTime} / {r.entryPoint}
              </span>
              <span>→</span>
              <span>
                청산 {r.exitTime} / {r.exitPoint}
              </span>
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
            {r.memo && (
              <p className="mt-2 text-xs text-muted-foreground">{r.memo}</p>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ── 메인 페이지 ──

export default function FuturesTradingPage() {
  const [password, setPassword] = useState<string | null>(null);
  const [records, setRecords] = useState<FuturesRecord[]>([]);
  const [loading, setLoading] = useState(false);

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
        <header className="mb-8">
          <h1 className="mb-2 text-3xl font-bold tracking-tight">
            선물매매 검증
          </h1>
          <p className="text-sm text-muted-foreground">
            매매 기록을 남기고, 패턴을 찾고, 실력을 검증합니다.
          </p>
        </header>

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
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
