import {
  StockPatternsTable,
  type Candidate,
} from "@/components/stock-patterns-table";
import patternsData from "@/data/tsla-patterns.json";

export const metadata = {
  title: "차트 패턴 탐색 (TSLA) | TockTock",
  description:
    "TSLA 일봉에서 '조건 → 다음날 상승' 빈도를 집계한 결과. 검증을 통과한 신호가 아니라, 과적합이 왜 위험한지 보여주는 기록입니다.",
};

interface PatternsData {
  ticker: string;
  meta: {
    from: string;
    to: string;
    candles: number;
    baseRate: number;
    inSample: boolean;
    validated: boolean;
    note: string;
    verification: string;
  };
  overfitting: { scope: string; search: number; maxProb: number }[];
  candidates: Candidate[];
}

const data = patternsData as PatternsData;

export default function StockPatternsPage() {
  const { meta, overfitting, candidates } = data;

  return (
    <div className="max-w-3xl px-4 sm:px-8 py-20">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight">
          차트 패턴 탐색 · {data.ticker}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {meta.from} ~ {meta.to} · 일봉 {meta.candles.toLocaleString()}봉 ·
          기준선 {meta.baseRate}%
        </p>
      </header>

      {/* 경고 배너 — 숫자만큼 크게 */}
      <div className="mb-10 rounded-lg border-2 border-amber-500/70 bg-amber-50 p-5 dark:border-amber-500/50 dark:bg-amber-950/30">
        <p className="text-base font-bold text-amber-900 dark:text-amber-200">
          ⚠️ 이 페이지의 숫자는 &ldquo;검증된 승률&rdquo;이 아닙니다
        </p>
        <p className="mt-2 text-sm leading-relaxed text-amber-900/90 dark:text-amber-100/90">
          {meta.note}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-amber-900/90 dark:text-amber-100/90">
          {meta.verification}
        </p>
        <p className="mt-3 text-sm font-medium text-amber-900 dark:text-amber-100">
          즉, 아래 표는 매수 신호가 아니라 &ldquo;과거에 우연히 이랬다&rdquo;는
          기록입니다. 매매 판단에 그대로 쓰지 마세요.
        </p>
      </div>

      {/* 과적합 시연 */}
      <section className="mb-12">
        <h2 className="mb-3 text-lg font-semibold">
          왜 못 믿는가 — 많이 뒤질수록 높아지는 &ldquo;가짜 최고 승률&rdquo;
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          조건을 더 많이 조합해 뒤질수록 in-sample 최고 승률은 계속 올라갑니다.
          신호를 찾은 게 아니라, 검색 횟수를 늘린 만큼 우연히 좋아 보이는 게
          따라오는 것뿐입니다. 이게 과적합(overfitting)입니다.
        </p>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-3 py-2 text-left font-medium">검색 범위</th>
                <th className="px-3 py-2 text-right font-medium">
                  조사한 조건 수
                </th>
                <th className="px-3 py-2 text-right font-medium">
                  in-sample 최고 승률
                </th>
              </tr>
            </thead>
            <tbody>
              {overfitting.map((o) => (
                <tr
                  key={o.scope}
                  className="border-b border-border/50 last:border-0"
                >
                  <td className="px-3 py-2">{o.scope}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {o.search.toLocaleString()}개
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {o.maxProb.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          그런데 전/후반 분리(OOS) + 본페로니 보정으로 제대로 검증하면, 통과한
          조건은 <span className="font-semibold text-foreground">0개</span>였습니다.
        </p>
      </section>

      {/* 후보 목록 */}
      <section>
        <h2 className="mb-1 text-lg font-semibold">
          조사 후보 목록 ({candidates.length.toLocaleString()}개)
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          발생 150회 이상으로 추린 후보입니다. 발생 횟수가 적을수록 빈도는 더
          쉽게 튀니, 항상 발생 횟수와 함께 보세요.
        </p>
        <StockPatternsTable candidates={candidates} baseRate={meta.baseRate} />
      </section>

      <p className="mt-12 text-xs text-muted-foreground">
        이 글은 투자 권유가 아닙니다. 모든 투자 판단은 본인의 책임입니다.
      </p>
    </div>
  );
}
