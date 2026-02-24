"use client";

import { useState, useEffect, useMemo } from "react";

interface YesterdayStock {
  code: string;
  name: string;
  value: number;
  market: string;
}

interface ExplosionStock {
  code: string;
  name: string;
  yesterdayValue: number;
  todayValue: number;
  closePrice: number;
  changeRate: number;
  market: string;
}

interface VolumeData {
  todayDate: string;
  yesterdayDate: string;
  marketOpen: boolean;
  yesterdayStocks: YesterdayStock[];
  explosionStocks: ExplosionStock[];
  updatedAt: string;
  error?: string;
}

function formatBillion(value: number): string {
  const eok = Math.round(value / 100_000_000);
  if (eok >= 10000) {
    return (eok / 10000).toFixed(2) + "조";
  }
  return eok.toLocaleString() + "억";
}

function formatDateLabel(yyyymmdd: string): string {
  const m = parseInt(yyyymmdd.slice(4, 6));
  const d = parseInt(yyyymmdd.slice(6, 8));
  return `${m}/${d}`;
}

export default function VolumeExplosionPage() {
  const [data, setData] = useState<VolumeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/volume-explosion")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setData(json);
      })
      .catch(() => setError("데이터를 불러올 수 없습니다."))
      .finally(() => setLoading(false));
  }, []);

  const filteredYesterday = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data.yesterdayStocks;
    const q = search.toLowerCase();
    return data.yesterdayStocks.filter(
      (s) => s.name.toLowerCase().includes(q) || s.code.includes(q),
    );
  }, [data, search]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-muted-foreground/30 border-t-foreground" />
          <p className="mt-4 text-muted-foreground text-sm">
            KRX 데이터를 불러오는 중...
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">
            {error || "데이터를 불러올 수 없습니다."}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-accent transition-colors"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* 헤더 */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            거래대금 폭발 탐지
          </h1>
          <p className="text-muted-foreground text-sm">
            어제 조용했던 종목(거래대금 300억 이하) 중 오늘 거래대금이 1,000억
            이상 터진 종목을 찾습니다. 데이터 출처: KRX 정보데이터시스템
          </p>
        </header>

        {/* 요약 배너 */}
        {!data.marketOpen && data.explosionStocks.length > 0 && (
          <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/5 px-5 py-3">
            <p className="text-sm">
              <strong className="text-amber-400">
                {data.explosionStocks.length}개 종목
              </strong>
              <span className="text-muted-foreground">
                이 어제 대비 거래대금이 폭발했습니다
              </span>
            </p>
          </div>
        )}

        {/* 좌우 패널 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── 왼쪽: 어제 ── */}
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="bg-muted/30 px-5 py-4 border-b border-border">
              <h2 className="text-lg font-bold">
                어제{" "}
                <span className="text-muted-foreground font-normal">
                  ({formatDateLabel(data.yesterdayDate)})
                </span>
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                거래대금 300억 이하 ·{" "}
                {data.yesterdayStocks.length.toLocaleString()}종목
              </p>
              <input
                type="text"
                placeholder="종목명 또는 코드 검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="mt-3 w-full px-3 py-1.5 text-sm border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">종목코드</th>
                    <th className="text-left px-4 py-2 font-medium">종목명</th>
                    <th className="text-right px-4 py-2 font-medium">
                      거래대금
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredYesterday.map((s) => (
                    <tr
                      key={s.code}
                      className="border-t border-border/20 hover:bg-accent/30 transition-colors"
                    >
                      <td
                        className="px-4 py-1.5 text-muted-foreground text-xs"
                        style={{ fontFamily: "'DM Mono', monospace" }}
                      >
                        {s.code}
                      </td>
                      <td className="px-4 py-1.5">
                        {s.name}
                        <span className="ml-1.5 text-[10px] text-muted-foreground/60">
                          {s.market}
                        </span>
                      </td>
                      <td
                        className="px-4 py-1.5 text-right text-muted-foreground"
                        style={{ fontFamily: "'DM Mono', monospace" }}
                      >
                        {formatBillion(s.value)}
                      </td>
                    </tr>
                  ))}
                  {filteredYesterday.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-8 text-center text-muted-foreground text-xs"
                      >
                        {search.trim()
                          ? `"${search}" 검색 결과가 없습니다`
                          : "데이터가 없습니다"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── 오른쪽: 오늘 (폭발) ── */}
          <div className="border border-amber-500/30 rounded-xl overflow-hidden">
            <div className="bg-amber-500/5 px-5 py-4 border-b border-amber-500/20">
              <h2 className="text-lg font-bold">
                오늘{" "}
                <span className="text-muted-foreground font-normal">
                  ({formatDateLabel(data.todayDate)})
                </span>
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                {data.marketOpen
                  ? "장 마감 후 업데이트"
                  : `거래대금 1,000억 이상 돌파 · ${data.explosionStocks.length}종목`}
              </p>
            </div>
            <div className="p-4 space-y-3 h-[600px] overflow-y-auto">
              {data.marketOpen ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <p className="text-muted-foreground text-sm mb-2">
                      아직 장 마감 전입니다.
                    </p>
                    <p className="text-muted-foreground/60 text-xs">
                      장 마감 후(15:30 이후) 업데이트됩니다.
                    </p>
                  </div>
                </div>
              ) : data.explosionStocks.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <p className="text-muted-foreground text-sm mb-1">
                      조건에 해당하는 종목이 없습니다
                    </p>
                    <p className="text-muted-foreground/60 text-xs">
                      어제 300억 이하 → 오늘 1,000억 이상 종목 없음
                    </p>
                  </div>
                </div>
              ) : (
                data.explosionStocks.map((s) => {
                  const multiple =
                    s.yesterdayValue > 0
                      ? (s.todayValue / s.yesterdayValue).toFixed(1)
                      : "N/A";
                  const isUp = s.changeRate >= 0;

                  return (
                    <div
                      key={s.code}
                      className="border border-border rounded-lg p-4 bg-card hover:bg-accent/30 transition-colors"
                    >
                      {/* 종목 정보 */}
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="font-bold text-base">{s.name}</div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            <span
                              style={{
                                fontFamily: "'DM Mono', monospace",
                              }}
                            >
                              {s.code}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-muted text-[10px]">
                              {s.market}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div
                            className="text-lg font-bold"
                            style={{ fontFamily: "'DM Mono', monospace" }}
                          >
                            {s.closePrice.toLocaleString()}원
                          </div>
                          <div
                            className={`text-sm font-medium ${isUp ? "text-red-400" : "text-blue-400"}`}
                          >
                            {isUp ? "+" : ""}
                            {s.changeRate.toFixed(2)}%
                          </div>
                        </div>
                      </div>

                      {/* 거래대금 비교 */}
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground text-xs">
                          어제
                        </span>
                        <span
                          style={{ fontFamily: "'DM Mono', monospace" }}
                          className="text-muted-foreground"
                        >
                          {formatBillion(s.yesterdayValue)}
                        </span>
                        <span className="text-muted-foreground/50">→</span>
                        <span className="text-xs text-muted-foreground">
                          오늘
                        </span>
                        <span
                          className="font-bold text-amber-400"
                          style={{ fontFamily: "'DM Mono', monospace" }}
                        >
                          {formatBillion(s.todayValue)}
                        </span>
                        <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400">
                          {multiple}배
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* 업데이트 시각 */}
        <p className="mt-4 text-xs text-muted-foreground/50 text-right">
          마지막 업데이트:{" "}
          {new Date(data.updatedAt).toLocaleString("ko-KR", {
            timeZone: "Asia/Seoul",
          })}
        </p>
      </div>
    </div>
  );
}
