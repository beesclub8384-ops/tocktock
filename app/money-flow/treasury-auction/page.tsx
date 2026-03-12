"use client";

import { useEffect, useState } from "react";

interface AuctionItem {
  cusip: string;
  securityType: string;
  term: string;
  auctionDate: string;
  maturityDate: string;
  offeringAmount: string;
  highYield: string;
  highDiscountRate: string;
  bidToCoverRatio: string;
  totalTendered: string;
  totalAccepted: string;
  indirectBidderAccepted: string;
  interestRate: string;
  tips: string;
  floatingRate: string;
}

interface AuctionData {
  upcoming: AuctionItem[];
  results: AuctionItem[];
  updatedAt: string;
}

type Tab = "results" | "upcoming";
type Filter = "전체" | "Bill" | "Note" | "Bond";

const FILTERS: Filter[] = ["전체", "Bill", "Note", "Bond"];

function formatDate(iso: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatBillions(val: string) {
  if (!val) return "-";
  const n = Number(val);
  if (isNaN(n)) return "-";
  return `$${Math.round(n / 100_000_000).toLocaleString()}억`;
}

function formatRate(item: AuctionItem) {
  if (item.securityType === "Bill") {
    return item.highDiscountRate ? `${Number(item.highDiscountRate).toFixed(3)}%` : "-";
  }
  return item.highYield ? `${Number(item.highYield).toFixed(3)}%` : "-";
}

function formatBtc(val: string) {
  if (!val) return "-";
  const n = Number(val);
  if (isNaN(n)) return "-";
  return n.toFixed(2);
}

function formatForeignPct(item: AuctionItem) {
  const accepted = Number(item.totalAccepted);
  const indirect = Number(item.indirectBidderAccepted);
  if (!accepted || isNaN(indirect)) return "-";
  return `${((indirect / accepted) * 100).toFixed(1)}%`;
}

function termLabel(item: AuctionItem) {
  const prefix = item.securityType === "Bill" ? "📄" : item.securityType === "Bond" ? "📕" : "📘";
  let suffix = "";
  if (item.tips === "Yes") suffix = " (TIPS)";
  else if (item.floatingRate === "Yes") suffix = " (FRN)";
  return `${prefix} ${item.term}${suffix}`;
}

function btcColor(val: string) {
  const n = Number(val);
  if (isNaN(n) || !val) return "";
  if (n >= 2.5) return "text-emerald-600 dark:text-emerald-400 font-semibold";
  if (n < 2.0) return "text-red-500 dark:text-red-400 font-semibold";
  return "";
}

function formatKST(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

export default function TreasuryAuctionPage() {
  const [data, setData] = useState<AuctionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("results");
  const [filter, setFilter] = useState<Filter>("전체");

  useEffect(() => {
    fetch("/api/treasury-auction")
      .then((r) => {
        if (!r.ok) throw new Error("API 오류");
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const items = data
    ? tab === "results"
      ? [...data.results].sort(
          (a, b) => new Date(b.auctionDate).getTime() - new Date(a.auctionDate).getTime(),
        )
      : [...data.upcoming].sort(
          (a, b) => new Date(a.auctionDate).getTime() - new Date(b.auctionDate).getTime(),
        )
    : [];

  const filtered =
    filter === "전체" ? items : items.filter((i) => i.securityType === filter);

  return (
    <main className="max-w-5xl mx-auto px-4 py-12 sm:px-8 sm:py-20">
      <header className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">미국채 경매</h1>
        <p className="mt-2 text-muted-foreground">
          미국 재무부 국채 경매 일정과 결과를 한눈에 확인합니다.
        </p>
      </header>

      {/* 탭 */}
      <div className="flex gap-2 mb-4">
        {(["results", "upcoming"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {t === "results" ? "경매 결과" : "예정 경매"}
          </button>
        ))}
      </div>

      {/* 필터 */}
      <div className="flex gap-1.5 mb-6">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              filter === f
                ? "bg-foreground/10 text-foreground border border-foreground/20"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* 상태 */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          데이터를 불러오는 중...
        </div>
      )}

      {error && (
        <div className="py-20 text-center text-red-500">
          데이터를 불러오지 못했습니다: {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="py-20 text-center text-muted-foreground">
          해당 조건의 경매 데이터가 없습니다.
        </div>
      )}

      {/* 결과 테이블 */}
      {!loading && !error && filtered.length > 0 && tab === "results" && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium">경매일</th>
                <th className="text-left px-4 py-3 font-medium">종목</th>
                <th className="text-right px-4 py-3 font-medium whitespace-nowrap">낙찰금리/할인율</th>
                <th className="text-right px-4 py-3 font-medium">응찰배율</th>
                <th className="text-right px-4 py-3 font-medium">발행규모</th>
                <th className="text-right px-4 py-3 font-medium">외국인비중</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.cusip + item.auctionDate} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 tabular-nums">{formatDate(item.auctionDate)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{termLabel(item)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatRate(item)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${btcColor(item.bidToCoverRatio)}`}>
                    {formatBtc(item.bidToCoverRatio)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatBillions(item.offeringAmount)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatForeignPct(item)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 예정 테이블 */}
      {!loading && !error && filtered.length > 0 && tab === "upcoming" && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium">경매 예정일</th>
                <th className="text-left px-4 py-3 font-medium">종목</th>
                <th className="text-right px-4 py-3 font-medium">발행 예정 규모</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.cusip + item.auctionDate} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 tabular-nums">{formatDate(item.auctionDate)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{termLabel(item)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatBillions(item.offeringAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 업데이트 시각 */}
      {data?.updatedAt && (
        <p className="mt-4 text-xs text-muted-foreground text-right">
          마지막 업데이트: {formatKST(data.updatedAt)}
        </p>
      )}

      {/* 용어 설명 */}
      <section className="mt-12 rounded-lg border border-border bg-muted/30 p-6 space-y-4">
        <h2 className="text-sm font-semibold mb-3">용어 설명</h2>
        <dl className="space-y-3 text-sm text-muted-foreground">
          <div>
            <dt className="font-medium text-foreground">응찰배율 (Bid-to-Cover Ratio)</dt>
            <dd className="mt-0.5">
              총 응찰액 &divide; 발행 규모. 높을수록 수요가 강합니다.{" "}
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">2.5 이상이면 양호</span>,{" "}
              <span className="text-red-500 dark:text-red-400 font-medium">2.0 미만이면 수요 부진</span>으로 봅니다.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">낙찰금리 (High Yield / Discount Rate)</dt>
            <dd className="mt-0.5">
              경매에서 결정된 실제 금리입니다. 높을수록 채권 수요가 약하다는 뜻입니다.
              Note/Bond는 High Yield, Bill은 High Discount Rate로 표시됩니다.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">외국인비중 (Indirect Bidders)</dt>
            <dd className="mt-0.5">
              간접입찰자(외국 중앙은행 포함)의 낙찰 비중입니다.
              외국인 수요가 높으면 달러 및 미국채 신뢰도가 견고하다는 신호입니다.
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
