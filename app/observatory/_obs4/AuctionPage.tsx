/**
 * 국채 입찰 두 지표(응찰 배율 · 딜러 비중) 상세 페이지 본문 — 서버 컴포넌트.
 * 두 지표가 원자료·판정 구조가 같아 본문을 하나로 두고 지표별 문구만 바꾼다.
 *
 * ⚠ "use client" 를 넣지 않는다. 차트(AuctionChart)만 클라이언트다.
 */
import { ObservatoryBreadcrumb } from "../breadcrumb";
import type { AuctionMetricResponse } from "@/lib/observatory-auction-response";
import AuctionChart from "./AuctionChart";
import { auctionName, formatDay, signed, statusLabel } from "./format";
import { Disclaimer, Notice, Section, StatusBadge } from "./parts";

interface Props {
  data: AuctionMetricResponse | null;
  metric: "btc" | "pd";
}

export default function AuctionPage({ data, metric }: Props) {
  const isBtc = metric === "btc";
  const key = isBtc ? "auction-bid-to-cover" : "auction-dealer-share";
  const title = isBtc ? "국채 입찰 응찰 배율" : "입찰 프라이머리 딜러 인수 비중";
  const unit = isBtc ? "" : "%p";

  const limitation = (
    <Notice>
      <p>
        이 지표는 입찰 한 번의 성적표입니다. 시장 전체의 수요를 직접 잰 값이 아니고, 입찰 직전 시장 금리와
        낙찰 금리의 차이(테일)도 공개 출처가 없어 넣지 못했습니다.
      </p>
      <p>
        {isBtc
          ? "응찰 배율은 사겠다고 낸 돈을 실제로 판 금액으로 나눈 값입니다. 배율이 낮다고 꼭 투자자가 국채를 꺼린다는 뜻은 아니고, 발행 물량이 늘어난 영향도 함께 들어 있습니다."
          : "프라이머리 딜러는 재무부 입찰에 꼭 참여해야 하는 지정 금융회사입니다. 딜러 비중이 높으면 최종 투자자가 덜 사 갔다는 뜻이지만, 딜러가 나중에 다시 팔기 위해 일부러 많이 사 두는 경우도 섞여 있습니다."}
      </p>
    </Notice>
  );

  if (!data || !data.latest) {
    return (
      <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <ObservatoryBreadcrumb indicator={key} />
        <h1 className="text-2xl font-bold mb-4">{title}</h1>
        {limitation}
        <p className="text-sm text-zinc-500">아직 데이터가 없습니다. 재무부 자료 수집을 기다리는 중입니다.</p>
      </div>
    );
  }

  const { latest, thresholds } = data;
  const latestValue = isBtc
    ? `${latest.bidToCover.toFixed(2)}배`
    : latest.dealerSharePct === null
      ? "—"
      : `${latest.dealerSharePct.toFixed(1)}%`;
  const latestSurprise = isBtc ? latest.btcSurprise : latest.pdSurprise;

  return (
    <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <ObservatoryBreadcrumb indicator={key} />
      <header className="mb-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">{title}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed">
          {isBtc
            ? "재무부가 새 국채를 팔 때, 사겠다고 몰린 돈이 파는 금액의 몇 배였는지입니다. 같은 만기의 평소보다 크게 낮으면 그 입찰에 수요가 약했다는 뜻입니다."
            : "재무부 입찰에서 프라이머리 딜러가 가져간 몫입니다. 최종 투자자가 덜 사 가면 딜러가 남은 물량을 떠안게 되어 이 비중이 올라갑니다."}
        </p>
        <p className="text-xs text-zinc-400 mt-1.5">
          출처: 미 재무부 Fiscal Data API(auctions_query, TreasuryDirect 입찰 결과) · 명목 이표채 입찰(2·3·5·7·10·20·30년)
        </p>
      </header>

      {limitation}

      <div className="mb-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-zinc-400 mb-1">
              가장 최근 입찰 · {auctionName(latest.termYears, latest.reopening)}
            </div>
            <div className="text-4xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">{latestValue}</div>
          </div>
          <StatusBadge status={data.status} />
        </div>
        <dl className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-zinc-400">입찰일</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200">{formatDay(latest.date)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">같은 만기 평소 대비</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">{signed(latestSurprise, 2, unit)}</dd>
            <dd className="text-xs text-zinc-500">
              주의 {signed(thresholds.cautionCut, 2, unit)} · 경보 {signed(thresholds.alertCut, 2, unit)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">최근 {thresholds.windowDays}일 입찰</dt>
            <dd className="font-semibold text-zinc-800 dark:text-zinc-200">{data.window.length}건</dd>
            <dd className="text-xs text-zinc-500">판정은 이 중 가장 나쁜 입찰</dd>
          </div>
        </dl>
      </div>

      <Section title={`최근 ${thresholds.windowDays}일 입찰`}>
        <div className="w-0 min-w-full overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[480px] whitespace-nowrap text-sm tabular-nums">
            <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">입찰일</th>
                <th className="px-3 py-2 text-left font-semibold">만기</th>
                <th className="px-3 py-2 text-right font-semibold">{isBtc ? "응찰 배율" : "딜러 비중"}</th>
                <th className="px-3 py-2 text-right font-semibold">평소 대비</th>
                <th className="px-3 py-2 text-right font-semibold">등급</th>
              </tr>
            </thead>
            <tbody>
              {data.window.map(({ row, grade }) => (
                <tr key={`${row.date}-${row.cusip}`} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-3 py-1.5">{row.date}</td>
                  <td className="px-3 py-1.5">{auctionName(row.termYears, row.reopening)}</td>
                  <td className="px-3 py-1.5 text-right">
                    {isBtc
                      ? `${row.bidToCover.toFixed(2)}배`
                      : row.dealerSharePct === null
                        ? "—"
                        : `${row.dealerSharePct.toFixed(1)}%`}
                  </td>
                  <td className="px-3 py-1.5 text-right">{signed(isBtc ? row.btcSurprise : row.pdSurprise, 2, unit)}</td>
                  <td className="px-3 py-1.5 text-right">{statusLabel(grade.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="입찰별 추이 (같은 만기 평소 대비)">
        <AuctionChart
          series={data.series}
          metric={metric}
          cautionCut={thresholds.cautionCut}
          alertCut={thresholds.alertCut}
        />
      </Section>

      <Section title="판정 기준">
        <p>
          {isBtc ? "응찰 배율" : "딜러 비중"}은 만기마다 평소 수준이 달라서, 입찰마다{" "}
          <strong>같은 만기의 직전 {thresholds.lookback}회 평균과의 차이</strong>로 바꿔 비교합니다.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            그 입찰까지 쌓인 차이의 분포에서 {isBtc ? "하위" : "상위"}{" "}
            {isBtc ? thresholds.cautionPctile : 100 - thresholds.cautionPctile}% 안이면 그 입찰은 주의,{" "}
            {isBtc ? thresholds.alertPctile : 100 - thresholds.alertPctile}% 안이면 경보입니다. 차이가{" "}
            {thresholds.minObs}개보다 적게 쌓인 동안은 판정 보류입니다.
          </li>
          <li>
            지표의 상태는 가장 최근 입찰일까지 {thresholds.windowDays}일 동안 열린 입찰 중 가장 나쁜 등급입니다.
          </li>
          <li>
            기준을 입찰 하나 기준 {isBtc ? thresholds.cautionPctile : 100 - thresholds.cautionPctile}%로 아주 좁게 둔
            이유는, {thresholds.windowDays}일 동안 여러 번(2016년 이후 보통 5~7번)의 입찰이 열리고 그중 한 번이라도
            걸리면 켜지는 구조이기 때문입니다. 입찰 하나의 기준을 넓게 두면 창 단위로는 훨씬 자주 켜집니다.
          </li>
          <li>
            {isBtc
              ? "응찰이 평소보다 많이 몰린 쪽(배율 상승)은 수요가 강하다는 뜻이라 판정에 쓰지 않습니다."
              : "딜러 비중이 평소보다 낮은 쪽은 최종 투자자가 많이 사 갔다는 뜻이라 판정에 쓰지 않습니다."}
          </li>
        </ul>
        <p>이 지표는 위기를 미리 알려 주는 용도로 검증된 것이 아닙니다.</p>
        <p className="text-zinc-500">
          {isBtc
            ? "과거 입찰에 이 규칙을 그 시점까지의 자료로만 적용해 보면, 2020년 3월 국채시장 혼란기, 2023년 11월 9일 30년물 입찰(응찰 배율 2.24), 2025년 4월 8일 3년물 입찰 모두 정상으로 나왔습니다. 입찰 하나가 주의 이상이었던 경우는 2007년 11월 28일 2년물과 2012년 8월 8일 10년물, 두 번뿐입니다. 이 결과를 보고 기준을 고치지는 않았습니다."
            : "과거 입찰에 이 규칙을 그 시점까지의 자료로만 적용해 보면, 2020년 3월에는 3월 10~12일 입찰 무렵 최근 28일 창이 주의였습니다(2월 25일 2년물 입찰의 높은 딜러 비중 때문). 2023년 11월 9일 30년물 입찰과 2025년 4월 8일 3년물 입찰은 정상이었습니다. 이 결과를 보고 기준을 고치지는 않았습니다."}
        </p>
        {!isBtc && (
          <p className="text-zinc-500">
            재무부 자료에 딜러 낙찰액이 실린 것은 2008년 4월부터라, 그 전 입찰은 이 지표에 들어가지 않습니다.
          </p>
        )}
      </Section>

      <Section title="자료에서 뺀 것">
        <p>
          물가연동채(TIPS)·변동금리채·단기채(Bill) 입찰은 수요 구조가 달라 넣지 않았습니다. 공고 당일에 열린 2,500만
          달러짜리 소액 입찰 2건(2019년 6월 21일 10년물, 2021년 12월 2일 20년물)도 뺐습니다. 정규 입찰은 가장 작아도
          50억 달러이고, 이 두 건은 딜러가 전량을 가져가 비중이 100%로 나와 판정을 왜곡합니다.
        </p>
      </Section>

      <Section title="언제 반영되나요">
        <p className="text-zinc-500">
          입찰 결과가 재무부 데이터 API(Fiscal Data)에 실린 뒤, 첫 평일 수집(한국 시각 밤 10시)에서 반영됩니다. API에
          결과가 실리는 정확한 시각은 확인하지 못했습니다.
        </p>
      </Section>

      <Disclaimer />
    </div>
  );
}
