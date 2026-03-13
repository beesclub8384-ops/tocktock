"use client";

import { useEffect, useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { useDraggable } from "@/hooks/useDraggable";
import { useResizable } from "@/hooks/useResizable";

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

function GuideTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {headers.map((h) => (
              <th key={h} className="text-left px-4 py-2.5 font-medium text-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-muted-foreground">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ────────────────────────────────────────────
   가이드 모달
   ──────────────────────────────────────────── */
function AuctionGuideModal({ onClose }: { onClose: () => void }) {
  const { position, handleMouseDown } = useDraggable();
  const { size, handleResizeMouseDown } = useResizable();

  // ESC 키로 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // 모달 열릴 때 배경 스크롤 방지
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div data-draggable-modal className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" style={{ transform: `translate(${position.x}px, ${position.y}px)`, ...(size.width ? { width: size.width, height: size.height } : { width: "100%", maxWidth: "56rem" }) }}>
      <div className="overflow-y-auto p-6 sm:p-8" style={{ maxHeight: size.height ? size.height - 2 : "85vh" }}>
        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X size={20} />
        </button>

        <h2 className="mb-6 text-xl font-bold cursor-move select-none" onMouseDown={handleMouseDown}>미국채 경매 보는 법</h2>

        <div className="space-y-10 text-sm leading-relaxed">
          {/* 1부 */}
          <section>
            <h3 className="text-lg font-bold mb-4">1부. 미국채 경매란?</h3>

            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-foreground mb-2">미국 정부가 돈을 빌리는 방식</h4>
                <p className="text-muted-foreground">
                  미국 정부는 지출이 세수보다 많을 때 부족한 돈을 채권을 발행해 빌립니다.
                  채권의 금리는 미리 정해지는 게 아니라 <strong className="text-foreground">경매를 통해 결정</strong>됩니다.
                  전 세계 투자자들이 &apos;나는 이 금리에 사겠다&apos;고 입찰하고, 가장 낮은 금리(= 가장 비싼 가격)에 낙찰됩니다.
                </p>
                <div className="mt-3 rounded-md border border-border bg-muted/40 px-4 py-3 text-muted-foreground">
                  <strong className="text-foreground">핵심:</strong> 채권 금리가 낮다 = 투자자들이 비싸게 사겠다고 경쟁 = 미국 국채에 대한 수요가 높다는 뜻입니다.
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">Bill / Note / Bond — 만기로 구분</h4>
                <p className="text-muted-foreground mb-3">미국채는 만기 기간에 따라 세 종류로 나뉩니다.</p>
                <GuideTable
                  headers={["종류", "만기", "특징"]}
                  rows={[
                    ["📄 Bill (단기채)", "4주 ~ 52주", "이자 없이 할인된 가격에 발행. 만기에 액면가 수령"],
                    ["📘 Note (중기채)", "2년 ~ 10년", "6개월마다 이자 지급. 가장 많이 거래되는 종류"],
                    ["📕 Bond (장기채)", "20년 ~ 30년", "6개월마다 이자 지급. 장기 금리 방향을 가장 잘 반영"],
                  ]}
                />
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">경매가 시장에 왜 중요한가?</h4>
                <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
                  <li><strong className="text-foreground">10년물 금리</strong>는 미국 주택담보대출 금리의 기준</li>
                  <li><strong className="text-foreground">2년물 금리</strong>는 연준의 기준금리 기대치를 가장 직접적으로 반영</li>
                  <li><strong className="text-foreground">30년물 금리</strong>는 장기 인플레이션 기대를 반영</li>
                  <li>외국 중앙은행들이 대거 참여 → 달러 패권과 글로벌 자금 흐름의 바로미터</li>
                </ul>
                <div className="mt-3 rounded-md border border-border bg-muted/40 px-4 py-3 text-muted-foreground">
                  <strong className="text-foreground">왜 봐야 하나?</strong> 경매에서 수요가 약하면(응찰배율 낮음) → 금리 상승 압력 → 주식 밸류에이션 하락 압력. 수요가 강하면 반대입니다. 경매 결과는 다음날 시장 방향에 영향을 줍니다.
                </div>
              </div>
            </div>
          </section>

          {/* 2부 */}
          <section>
            <h3 className="text-lg font-bold mb-4">2부. 각 지표 읽는 법</h3>

            <div className="space-y-6">
              <div>
                <h4 className="font-semibold text-foreground mb-2">① 낙찰금리 / 할인율</h4>
                <p className="text-muted-foreground mb-3">
                  경매에서 최종 결정된 금리입니다. Bill은 &apos;할인율&apos;, Note/Bond는 &apos;수익률(Yield)&apos;로 표시됩니다.
                </p>
                <GuideTable
                  headers={["상황", "의미", "시장 해석"]}
                  rows={[
                    ["금리 상승 (전월 대비)", "채권 가격 하락, 수요 약함", "투자자들이 더 높은 금리를 요구"],
                    ["금리 하락 (전월 대비)", "채권 가격 상승, 수요 강함", "안전자산 선호 또는 경기 둔화 우려"],
                    ["예상보다 높게 낙찰", "시장 예상을 뛰어넘는 금리", "수요 부진 신호"],
                    ["예상보다 낮게 낙찰", "시장 예상보다 낮은 금리", "강한 수요, 안전자산 선호 강화"],
                  ]}
                />
                <div className="mt-3 rounded-md border border-border bg-muted/40 px-4 py-3 text-muted-foreground">
                  <strong className="text-foreground">Bill은 왜 할인율?</strong> Bill은 이자가 없습니다.
                  대신 액면가(예: $100)보다 싸게(예: $96.3) 발행하고 만기에 $100을 줍니다.
                  이 차이가 수익이고, 이걸 연율로 환산한 게 &apos;할인율&apos;입니다.
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">② 응찰배율 (Bid-to-Cover Ratio)</h4>
                <p className="text-muted-foreground mb-3">
                  응찰배율 = 총 응찰 금액 / 발행 규모. 경매 수요의 강도를 가장 직접적으로 보여주는 지표입니다.
                </p>
                <GuideTable
                  headers={["응찰배율", "신호", "TockTock 색상"]}
                  rows={[
                    ["2.5 이상", "양호 — 수요가 충분히 강함", "초록색"],
                    ["2.0 ~ 2.5", "보통 — 특별한 이상 없음", "기본색"],
                    ["2.0 미만", "주의 — 수요 부진, 시장 경계 필요", "빨간색"],
                  ]}
                />
                <p className="mt-3 text-muted-foreground">
                  예시: 발행 규모 $250억에 총 응찰 $665억 → 응찰배율 2.66 (양호)
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">③ 발행 규모</h4>
                <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
                  <li>발행 규모가 클수록 시장이 소화해야 할 물량이 많습니다</li>
                  <li>같은 응찰배율이라도 발행 규모가 크면 실제 수요가 더 많다는 뜻입니다</li>
                  <li>재무부가 발행 규모를 늘리면 → 재정 적자 확대 신호로 해석하기도 합니다</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">④ 외국인 비중</h4>
                <p className="text-muted-foreground mb-3">
                  간접입찰자(Indirect Bidder) 낙찰 비중입니다. 주로 외국 중앙은행, 국부펀드 등 해외 기관투자자입니다.
                </p>
                <GuideTable
                  headers={["상황", "의미"]}
                  rows={[
                    ["60% 이상", "해외 중앙은행들이 달러 자산 보유 의지 강함. 달러 패권 유지"],
                    ["비중 낮아지는 추세", "달러 의존도 낮추려는 움직임. 미국 국채 수요 기반 약화 신호"],
                    ["급락 후 반등", "일시적 매도(외환위기, 환율 방어 등) 후 복귀"],
                  ]}
                />
                <div className="mt-3 rounded-md border border-border bg-muted/40 px-4 py-3 text-muted-foreground">
                  외국인비중이 지속적으로 낮아지면 미국이 자국 투자자에게만 의존해야 한다는 뜻입니다.
                  금리 상승 압력이 커지고 달러 약세 요인이 됩니다.
                </div>
              </div>
            </div>
          </section>

          {/* 3부 */}
          <section>
            <h3 className="text-lg font-bold mb-4">3부. 실전 해석법</h3>

            <div className="space-y-6">
              <div>
                <h4 className="font-semibold text-foreground mb-2">응찰배율 + 낙찰금리 조합 해석</h4>
                <GuideTable
                  headers={["응찰배율", "낙찰금리", "해석"]}
                  rows={[
                    ["높음 (2.5↑)", "낮음 (전월 대비)", "강한 수요 + 안전자산 선호. 주식 약세 환경일 가능성"],
                    ["높음 (2.5↑)", "높음 (전월 대비)", "수요는 충분하지만 금리 상승 용인. 인플레 우려"],
                    ["낮음 (2.0↓)", "낮음 (전월 대비)", "공급 과잉 + 기대금리 하락. 경기 침체 우려"],
                    ["낮음 (2.0↓)", "높음 (전월 대비)", "최악의 조합. 수요 부족에 금리도 상승. 재정 우려"],
                  ]}
                />
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">&apos;좋은 경매&apos; vs &apos;나쁜 경매&apos; 구분법</h4>
                <GuideTable
                  headers={["구분", "좋은 경매", "나쁜 경매"]}
                  rows={[
                    ["응찰배율", "2.5 이상", "2.0 미만"],
                    ["낙찰금리", "예상보다 낮게 낙찰", "예상보다 높게 낙찰"],
                    ["외국인비중", "50% 이상 유지", "30% 미만 또는 급락"],
                    ["시장 반응", "채권 금리 하락, 주식 안정", "채권 금리 급등, 주식 하락"],
                  ]}
                />
                <div className="mt-3 rounded-md border border-border bg-muted/40 px-4 py-3 text-muted-foreground">
                  <strong className="text-foreground">실전 팁:</strong> 경매 직후 10년물 금리 움직임을 함께 확인하세요.
                  좋은 경매였다면 금리가 내려가고, 나쁜 경매였다면 금리가 튑니다.
                </div>
              </div>
            </div>
          </section>

          {/* 4부 */}
          <section>
            <h3 className="text-lg font-bold mb-4">4부. 투자에 어떻게 활용하나</h3>

            <div className="space-y-6">
              <div>
                <h4 className="font-semibold text-foreground mb-2">금리 방향성 판단</h4>
                <ul className="space-y-1.5 text-muted-foreground list-disc pl-5">
                  <li>연속 3회 이상 응찰배율 하락 → 금리 상승 압력 누적 → 성장주 밸류에이션 부담</li>
                  <li>낙찰금리가 연준 기준금리에 근접 → 시장이 금리 인하 기대 반영 중</li>
                  <li>2년물과 10년물 금리 차이(스프레드) 주목 → 역전 유지 시 경기 침체 경고</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-2">주식시장과의 관계</h4>
                <GuideTable
                  headers={["미국채 경매 신호", "주식시장 영향"]}
                  rows={[
                    ["강한 수요 (응찰배율↑, 금리↓)", "안전자산 선호 → 성장주 단기 약세 가능"],
                    ["약한 수요 (응찰배율↓, 금리↑)", "금리 부담 → 고밸류에이션 성장주 하락"],
                    ["외국인비중 급락", "달러 약세 + 글로벌 불안 → 신흥국 영향"],
                    ["30년물 수요 강함", "장기 인플레 우려 완화 → 리츠, 배당주 강세"],
                  ]}
                />
              </div>

              <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-muted-foreground">
                <strong className="text-foreground">최종 정리:</strong> 미국채 경매는 &apos;글로벌 자금의 체온계&apos;입니다.
                응찰배율로 수요를, 낙찰금리로 금리 방향을, 외국인비중으로 달러 패권을 읽습니다.
                <strong className="text-foreground"> 세 지표가 모두 나쁜 신호를 보낼 때가 시장 경계가 필요한 순간</strong>입니다.
              </div>
            </div>
          </section>
        </div>
      </div>
      <div onMouseDown={handleResizeMouseDown} className="absolute bottom-0 right-0 cursor-se-resize px-2 py-1 text-xs text-gray-400 hover:text-gray-200 select-none">↔ 크기조절</div>
      </div>
    </div>
  );
}

export default function TreasuryAuctionPage() {
  const [data, setData] = useState<AuctionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("results");
  const [filter, setFilter] = useState<Filter>("전체");
  const [guideOpen, setGuideOpen] = useState(false);

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
        <button
          onClick={() => setGuideOpen(true)}
          className="guide-btn mt-3 inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-all"
        >
          <HelpCircle size={13} />
          미국채 경매 보는 법
        </button>
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

      {/* 가이드 모달 */}
      {guideOpen && <AuctionGuideModal onClose={() => setGuideOpen(false)} />}
    </main>
  );
}
