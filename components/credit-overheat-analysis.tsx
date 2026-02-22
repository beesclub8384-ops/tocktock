"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

function Accordion({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {title}
        <ChevronDown
          size={16}
          className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3 text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>
      )}
    </div>
  );
}

function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | React.ReactNode)[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            {headers.map((h, i) => (
              <th
                key={i}
                className="whitespace-nowrap px-2 py-1.5 text-left font-semibold text-foreground"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-border/50 last:border-b-0">
              {row.map((cell, ci) => (
                <td key={ci} className="whitespace-nowrap px-2 py-1.5">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CreditOverheatAnalysis() {
  return (
    <div className="mt-4 rounded-lg border border-border">
      <div className="px-4 py-3 text-sm font-semibold text-foreground">
        TockTock 과열지수 vs KOSPI 통계 분석 (2001-01 ~ 2026-02, 6,158영업일)
      </div>

      {/* 1. 상관계수 분석 */}
      <Accordion title="1. 상관계수 분석">
        <p className="mb-3 font-medium text-foreground">
          수준(level) 상관 vs 일별 변화율 상관
        </p>
        <Table
          headers={["비교 대상", "수준 상관", "일별 변화율 상관"]}
          rows={[
            [
              "과열지수 ↔ KOSPI",
              <strong key="lv" className="text-foreground">0.8714</strong>,
              <strong key="dc" className="text-red-400">-0.7369</strong>,
            ],
          ]}
        />
        <div className="mt-3 space-y-1.5">
          <p>
            수준 상관 <strong className="text-foreground">0.87</strong>로
            높습니다. 장기적으로 과열지수와 KOSPI는 함께 움직입니다.
          </p>
          <p>
            일별 변화율 상관은{" "}
            <strong className="text-red-400">-0.74</strong>로 강한 역관계입니다.
            이유가 있습니다.
          </p>
        </div>
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="font-semibold text-foreground">
            왜 일별 변화율이 역관계인가?
          </p>
          <p className="mt-1">
            과열지수 = 신용융자 &divide; 시가총액 &times; 100 입니다.{" "}
            <strong className="text-foreground">
              KOSPI가 오르면 시가총액(분모)이 커져서 과열지수가 자동으로
              낮아집니다.
            </strong>{" "}
            반대로 KOSPI가 떨어지면 시가총액이 줄어 과열지수가 높아집니다. 이건
            위험이 커진다는 뜻이기도 합니다 &mdash; 시장은 작아지는데 빚은
            그대로니까요.
          </p>
        </div>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">롤링 상관계수 (수준)</p>
        <Table
          headers={["윈도우", "평균", "최소", "최대"]}
          rows={[
            [
              "60일",
              "-0.16",
              <span key="r1">
                <strong className="text-red-400">-0.98</strong>{" "}
                <span className="text-[11px]">(2004-03)</span>
              </span>,
              <span key="r2">
                0.98 <span className="text-[11px]">(2007-05)</span>
              </span>,
            ],
            [
              "120일",
              "0.06",
              <span key="r3">
                <strong className="text-red-400">-0.97</strong>{" "}
                <span className="text-[11px]">(2004-04)</span>
              </span>,
              <span key="r4">
                0.98 <span className="text-[11px]">(2007-07)</span>
              </span>,
            ],
            [
              "250일",
              "0.25",
              <span key="r5">
                <strong className="text-red-400">-0.78</strong>{" "}
                <span className="text-[11px]">(2004-06)</span>
              </span>,
              <span key="r6">
                <strong className="text-green-400">0.95</strong>{" "}
                <span className="text-[11px]">(2007-07)</span>
              </span>,
            ],
          ]}
        />
        <p className="mt-2">
          60일 롤링은 평균 -0.16으로, 단기적으로는 역관계인 구간이 더 많습니다.
          250일 롤링 평균은 +0.25로, 장기에서만 양의 관계가 뚜렷해집니다.
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">구간별 수준 상관</p>
        <Table
          headers={["구간", "상관계수", "데이터"]}
          rows={[
            [
              "2001-2003 (IT버블 후)",
              <strong key="p1" className="text-foreground">0.61</strong>,
              "736일",
            ],
            [
              "2004-2007 (상승장)",
              <strong key="p2" className="text-foreground">0.79</strong>,
              "990일",
            ],
            [
              "2008-2009 (금융위기)",
              <strong key="p3" className="text-foreground">0.59</strong>,
              "491일",
            ],
            [
              "2010-2016 (횡보)",
              <strong key="p4" className="text-red-400">0.03</strong>,
              "1,716일",
            ],
            [
              "2017-2019 (변동)",
              <strong key="p5" className="text-red-400">-0.10</strong>,
              "730일",
            ],
            [
              "2020-2021 (코로나·동학)",
              <strong key="p6" className="text-green-400">0.81</strong>,
              "496일",
            ],
            [
              "2022-현재",
              <strong key="p7" className="text-red-400">-0.45</strong>,
              "999일",
            ],
          ]}
        />
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="font-semibold text-foreground">
            2010-2016 횡보기에 상관 0.03으로 사실상 무관
          </p>
          <p className="mt-1">
            KOSPI가 2,000 부근에서 장기 횡보하는 동안 과열지수는 독자적으로
            등락했습니다. 2017-2019에는 오히려 <strong className="text-red-400">역관계(-0.10)</strong>입니다.
            상승장에서만 동행 관계를 믿을 수 있습니다.
            2022년 이후에는{" "}
            <strong className="text-red-400">-0.45로 뚜렷한 역관계</strong>입니다.
          </p>
        </div>
      </Accordion>

      {/* 2. 선행/후행 분석 */}
      <Accordion title="2. 선행/후행 분석 (과열지수가 KOSPI를 리드하는가?)">
        <p className="mb-3 font-medium text-foreground">
          일별 변화율 교차상관
        </p>
        <Table
          headers={["lag (영업일)", "상관계수", "해석"]}
          rows={[
            ["-20", "0.008", ""],
            ["-10", "0.010", ""],
            ["-5", "-0.006", ""],
            ["-3", "-0.010", ""],
            ["-1", "-0.010", ""],
            [
              <strong key="l0" className="text-foreground">0</strong>,
              <strong key="v0" className="text-red-400">-0.737</strong>,
              "강한 역관계 (분모 효과)",
            ],
            ["+1", "-0.018", ""],
            [
              <strong key="l2" className="text-foreground">+2</strong>,
              <strong key="v2" className="text-blue-400">+0.175</strong>,
              "2일 후 양의 관계",
            ],
            ["+3", "+0.105", ""],
            ["+5", "+0.112", ""],
            ["+10", "+0.060", ""],
            ["+20", "+0.017", ""],
          ]}
        />
        <p className="mt-2 text-[11px] text-muted-foreground/70">
          양수 lag = KOSPI 변화 후 N일 뒤 과열지수 변화 / 음수 = 과열지수 변화
          후 N일 뒤 KOSPI 변화
        </p>
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="font-semibold text-foreground">
            핵심: lag 0에서 -0.74 (분모 효과), lag +2에서 +0.18 (빚투 반응)
          </p>
          <p className="mt-1">
            같은 날에는 역관계지만,{" "}
            <strong className="text-foreground">
              KOSPI가 움직인 2일 후부터 과열지수가 같은 방향으로 따라갑니다.
            </strong>{" "}
            이는 신용융자 잔고가 2~5영업일 후에 반영되기 때문입니다.
          </p>
        </div>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          30일 변화율 교차상관
        </p>
        <Table
          headers={["lag (영업일)", "상관계수"]}
          rows={[
            ["-20", "0.041"],
            ["-10", "0.054"],
            ["-5", "0.076"],
            ["0", "0.105"],
            ["+5", "0.254"],
            ["+10", "0.324"],
            [
              <strong key="l20" className="text-foreground">+20</strong>,
              <strong key="v20" className="text-blue-400">0.359</strong>,
            ],
          ]}
        />
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="font-semibold text-foreground">
            30일 추세 기준: lag +20(약 4주)에서 상관 최고 (0.36)
          </p>
          <p className="mt-1">
            &rarr;{" "}
            <strong className="text-foreground">
              KOSPI가 한 달간 움직인 방향을 약 4주 후에 과열지수가 따라갑니다.
            </strong>{" "}
            시장이 오르면 빚투가 늘어 과열지수가 올라가고, 시장이 떨어지면
            반대매매/상환으로 과열지수가 내려갑니다.
          </p>
        </div>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          과열지수 구간별 &rarr; 향후 KOSPI 성과
        </p>
        <Table
          headers={["구간", "30일 후", "하락확률", "90일 후", "하락확률", "사례"]}
          rows={[
            [
              <span key="s1" className="text-green-500">안전 (&lt;0.5%)</span>,
              "+1.4%",
              "38.7%",
              <strong key="a1" className="text-foreground">+4.4%</strong>,
              "34.6%",
              "3,818일",
            ],
            [
              <span key="s2" className="text-blue-500">관심 (0.5~0.75%)</span>,
              "+1.6%",
              "44.0%",
              <strong key="a2" className="text-foreground">+4.0%</strong>,
              <strong key="dd2" className="text-foreground">44.8%</strong>,
              "1,507일",
            ],
            [
              <span key="s3" className="text-yellow-500">주의 (0.75~0.85%)</span>,
              "+2.1%",
              "39.9%",
              "+4.3%",
              "37.6%",
              "431일",
            ],
            [
              <span key="s4" className="text-red-500">위험 (&ge;0.85%)</span>,
              <strong key="a3" className="text-red-400">-0.9%</strong>,
              <strong key="d3" className="text-red-400">57.8%</strong>,
              <strong key="a4" className="text-red-400">-1.9%</strong>,
              <strong key="dd4" className="text-red-400">70.7%</strong>,
              "372일",
            ],
          ]}
        />
        <div className="mt-3 space-y-1.5">
          <p>
            <strong className="text-red-400">
              위험 구간에서 90일 후 -1.9%, 하락확률 70.7%
            </strong>{" "}
            &mdash; 전체 기간 분석에서 위험 구간은 명확한 하락 신호입니다.
            2022년 이후 데이터가 포함되면서 더욱 뚜렷해졌습니다.
          </p>
          <p>
            <strong className="text-foreground">
              안전·관심·주의 구간은 90일 후 +4~4.4%로 비슷
            </strong>
            합니다. 과열지수가 위험 수준에 도달하기 전까지는
            시장 성과에 큰 차이가 없습니다.
          </p>
          <p className="text-[11px] text-muted-foreground/70">
            * 위험 구간 372일로 사례 충분. 관심·주의도 각 1,507일·431일로
            통계적으로 유의미합니다
          </p>
        </div>
      </Accordion>

      {/* 3. 다이버전스 감지 */}
      <Accordion title="3. 다이버전스 감지 (60영업일 변화율 괴리)">
        <p className="mb-3 font-medium text-red-400">
          위험 구간: 과열지수↑ &amp; KOSPI↓
        </p>
        <Table
          headers={["날짜", "KOSPI", "과열지수", "괴리"]}
          rows={[
            [
              "2007-03-05",
              "-4.1%",
              "+75.4%",
              <strong key="g1" className="text-red-400">+79.5%</strong>,
            ],
            ["2007-03-06", "-1.6%", "+75.4%", "+77.1%"],
            ["2007-02-28", "-1.0%", "+65.6%", "+66.6%"],
            ["2009-03-03", "-3.6%", "+60.0%", "+63.6%"],
          ]}
        />
        <p className="mt-2">
          &rarr;{" "}
          <strong className="text-foreground">
            2007년 3월이 역대 최대 위험 구간.
          </strong>{" "}
          KOSPI는 소폭 하락인데 과열지수는 75% 폭등. 그 해 10월에 고점을 찍고
          금융위기로 이어졌습니다.
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-green-400">
          회복 구간: 과열지수↓ &amp; KOSPI↑
        </p>
        <Table
          headers={["날짜", "KOSPI", "과열지수", "괴리"]}
          rows={[
            [
              "2004-09-06",
              "+11.6%",
              "-47.2%",
              <strong key="g2" className="text-green-400">-58.7%</strong>,
            ],
            ["2004-09-15", "+15.1%", "-42.9%", "-58.0%"],
            ["2004-10-06", "+18.7%", "-37.0%", "-55.7%"],
          ]}
        />
        <p className="mt-2">
          &rarr;{" "}
          <strong className="text-foreground">
            2004년 9월이 역대 최대 회복 구간.
          </strong>{" "}
          빚투가 대폭 줄면서 KOSPI가 건강하게 반등한 구간입니다.
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          같은 방향이지만 크기 차이 극단
        </p>
        <Table
          headers={["날짜", "KOSPI", "과열지수", "괴리"]}
          rows={[
            [
              "2007-05-08",
              "+11.0%",
              <strong key="g3" className="text-foreground">+503.2%</strong>,
              "+492.2%",
            ],
            ["2007-05-15", "+10.7%", "+500.0%", "+489.3%"],
          ]}
        />
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="font-semibold text-yellow-400">
            2007년 상반기: 역대 최악의 빚투 과열
          </p>
          <p className="mt-1">
            KOSPI는 11% 오르는 동안 과열지수는 500% 폭등. 60일 만에 과열지수가
            5배가 되었습니다. 이후 금융위기로 이어진 전형적인 버블 신호입니다.
          </p>
        </div>
      </Accordion>

      {/* 4. 변곡점 분석 */}
      <Accordion title="4. 변곡점 분석 (과열지수 고점/저점 이후 KOSPI 변화)">
        <p className="mb-3 font-medium text-foreground">
          KOSPI 극값 vs 과열지수 극값 시차 (120영업일 윈도우)
        </p>
        <Table
          headers={["비교", "평균 시차", "해석"]}
          rows={[
            [
              "KOSPI 고점 → 과열 고점",
              <strong key="p1" className="text-foreground">+10.1일 (10쌍)</strong>,
              "과열지수가 약 2주 후행",
            ],
            [
              "KOSPI 저점 → 과열 저점",
              <strong key="p2" className="text-foreground">+13.7일 (13쌍)</strong>,
              "과열지수가 약 3주 후행",
            ],
          ]}
        />
        <p className="mt-2 text-[11px] text-muted-foreground/70">
          양수 = 과열지수가 후행 / 음수 = 과열지수가 선행
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">주요 고점 사례</p>
        <Table
          headers={["KOSPI 고점", "과열 고점", "시차", "비고"]}
          rows={[
            ["2007-10-31", "2007-06-26", "-85일 (과열 선행)", "금융위기 직전"],
            ["2011-05-02", "2011-08-08", "+67일", "유럽 재정위기"],
            ["2006-05-11", "2006-01-23", "-74일 (과열 선행)", "BRICs 상승기"],
            ["2002-04-18", "2002-05-31", "+30일", "IT버블 후 반등"],
            ["2013-01-02", "2013-06-25", "+118일", "횡보기 후행"],
            ["2013-10-30", "2013-06-25", "-85일 (과열 선행)", "동일 과열 고점"],
          ]}
        />
        <p className="mt-2">
          <strong className="text-foreground">
            2007년: 과열지수가 85일 먼저 고점
          </strong>
          을 찍은 유일한 선행 사례입니다. 빚투가 먼저 꺾였는데도 KOSPI는
          4개월 더 올랐습니다.
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">주요 저점 사례</p>
        <Table
          headers={["KOSPI 저점", "과열 저점", "시차"]}
          rows={[
            ["2008-10-24", "2008-11-04", "+7일 (거의 동시)"],
            ["2011-09-26", "2011-10-13", "+11일"],
            ["2003-03-17", "2003-04-18", "+24일"],
            ["2004-08-02", "2004-09-01", "+22일"],
            ["2001-09-17", "2001-11-12", "+37일"],
            ["2006-06-13", "2006-08-22", "+48일"],
          ]}
        />
        <p className="mt-2">
          급락기(2008)에는 거의 동시(7일), 완만한 하락기에는 3~7주 후행.
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          과열지수 고점 이후 KOSPI 성과
        </p>
        <Table
          headers={["기간", "KOSPI 평균", "하락 확률", "사례"]}
          rows={[
            ["5일 후", "+2.6%", "17.6%", "17건"],
            ["10일 후", "+3.1%", "23.5%", "17건"],
            ["30일 후", "+3.9%", "29.4%", "17건"],
            [
              "60일 후",
              "+5.6%",
              "29.4%",
              "17건",
            ],
            [
              "90일 후",
              <strong key="a1" className="text-green-400">+8.1%</strong>,
              <strong key="d1" className="text-green-400">23.5%</strong>,
              "17건",
            ],
          ]}
        />
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="font-semibold text-foreground">
            과열지수 고점 = KOSPI 하락 신호가 아님
          </p>
          <p className="mt-1">
            과열지수 고점 이후 90일간 KOSPI 평균 +8.1%, 하락확률 23.5%.
            과열지수 고점은 보통 상승장 과열기에 형성되며,{" "}
            <strong className="text-foreground">
              시장 모멘텀이 아직 살아있는 구간
            </strong>
            입니다.
          </p>
        </div>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          과열지수 저점 이후 KOSPI 성과
        </p>
        <Table
          headers={["기간", "KOSPI 평균", "상승 확률", "사례"]}
          rows={[
            ["5일 후", "-0.9%", "33.3%", "24건"],
            ["10일 후", "+1.0%", "54.2%", "24건"],
            ["30일 후", "+2.4%", "62.5%", "24건"],
            [
              "60일 후",
              <strong key="a2" className="text-foreground">+6.7%</strong>,
              <strong key="u2" className="text-green-400">83.3%</strong>,
              "24건",
            ],
            [
              "90일 후",
              <strong key="a3" className="text-green-400">+11.4%</strong>,
              <strong key="u3" className="text-green-400">95.8%</strong>,
              "24건",
            ],
          ]}
        />
        <div className="mt-3 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
          <p className="font-semibold text-blue-400">
            과열지수 저점 후 90일 상승확률 95.8% &mdash; 가장 강력한 매수 신호
          </p>
          <p className="mt-1">
            24건 중 23건에서 90일 후 KOSPI가 상승했습니다. 평균 +11.4%.
            과열지수가 바닥을 찍었다는 것은 빚투 청산이 마무리되고 시장이
            건강해졌다는 의미입니다.
          </p>
        </div>
      </Accordion>

      {/* 5. 변화율/변동성 분석 */}
      <Accordion title="5. 변화율/변동성 분석">
        <p className="mb-3 font-medium text-foreground">
          일별 변화율 기초 통계
        </p>
        <Table
          headers={["지표", "평균", "표준편차", "최대 상승", "최대 하락"]}
          rows={[
            [
              "KOSPI",
              "+0.048%",
              "1.35%",
              "+11.95% (2008-10-30)",
              "-12.02% (2001-09-12)",
            ],
            [
              "과열지수",
              "+0.054%",
              <strong key="std" className="text-foreground">1.78%</strong>,
              "+13.89% (2008-11-06)",
              <strong key="mn" className="text-red-400">
                -18.83% (2008-10-28)
              </strong>,
            ],
          ]}
        />
        <p className="mt-2">
          과열지수 변동성(1.78%)이 KOSPI(1.35%)보다{" "}
          <strong className="text-foreground">32% 더 큽니다.</strong>{" "}
          최대 하루 하락 -18.83%은 2008년 금융위기 때 발생 &mdash; 대규모
          반대매매로 과열지수가 하루 만에 급감했습니다.
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          과열지수 극단 변화일 &rarr; KOSPI 반응
        </p>
        <Table
          headers={["트리거", "같은 날", "1일 후", "3일 후", "5일 후", "10일 후"]}
          rows={[
            [
              "과열 급등(상위 5%)",
              <strong key="t1" className="text-red-400">-2.3%</strong>,
              "+0.2%",
              "+0.6%",
              "+0.8%",
              "+1.2%",
            ],
            [
              "과열 급락(하위 5%)",
              <strong key="t2" className="text-green-400">+2.2%</strong>,
              "+0.2%",
              "+0.5%",
              "+0.5%",
              "+0.9%",
            ],
          ]}
        />
        <p className="mt-2">
          과열지수 급등일 = KOSPI 급락일 (분모 효과). 과열 급락일 = KOSPI 급등일.
          같은 날 반응은 수학적 관계이며,{" "}
          <strong className="text-foreground">
            이후 3~10일간은 두 경우 모두 KOSPI가 소폭 상승
          </strong>
          합니다.
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          KOSPI 극단 변화일 &rarr; 과열지수 반응
        </p>
        <Table
          headers={["트리거", "같은 날", "1일 후", "3일 후", "5일 후", "10일 후"]}
          rows={[
            [
              "KOSPI 급등(상위 5%)",
              "-3.0%",
              "-0.4%",
              "-0.2%",
              "+0.6%",
              <strong key="r1" className="text-green-400">+1.9%</strong>,
            ],
            [
              "KOSPI 급락(하위 5%)",
              "+3.0%",
              "-0.4%",
              <strong key="r2" className="text-red-400">-2.4%</strong>,
              <strong key="r3" className="text-red-400">-3.3%</strong>,
              <strong key="r4" className="text-red-400">-4.7%</strong>,
            ],
          ]}
        />
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="font-semibold text-foreground">
            KOSPI 급락 후 과열지수 3~10일간 지속 하락
          </p>
          <p className="mt-1">
            KOSPI가 급등하면 과열지수는 같은 날 분모 효과로 하락하지만, 10일 후
            빚투 유입으로 +1.9% 반등합니다.{" "}
            <strong className="text-foreground">
              KOSPI 급락 시에는 과열지수가 당일 +3.0% 급등(분모 축소) 후 3~10일
              동안 -2.4~-4.7% 지속 하락
            </strong>
            합니다. 이것이 반대매매의 흔적입니다.
          </p>
        </div>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          변동성 동조화
        </p>
        <p>
          60일 롤링 변동성 상관:{" "}
          <strong className="text-foreground">0.9441</strong> (매우 높음).
          KOSPI가 요동칠 때 과열지수도 함께 요동칩니다. 시장 불안기에는
          과열지수의 변동도 극단적으로 커집니다.
        </p>
      </Accordion>

      {/* 6. 추세 구간 분류 */}
      <Accordion title="6. 추세 구간 분류">
        <p className="mb-3 text-[11px] text-muted-foreground/70">
          250일 이동평균 기준. KOSPI·과열지수 모두 MA 위 = 동반상승, 모두 아래 =
          동반하락, 불일치 = 괴리 구간
        </p>

        <p className="mb-3 font-medium text-foreground">추세 분포</p>
        <Table
          headers={["추세", "일수", "비중"]}
          rows={[
            [
              <span key="t1" className="text-green-400">동반상승</span>,
              <strong key="d1" className="text-foreground">2,246일</strong>,
              "38.0%",
            ],
            [
              <span key="t2" className="text-foreground">KOSPI↑ 과열↓</span>,
              "1,508일",
              "25.5%",
            ],
            [
              <span key="t3" className="text-red-400">동반하락</span>,
              "1,429일",
              "24.2%",
            ],
            [
              <span key="t4" className="text-yellow-400">KOSPI↓ 과열↑</span>,
              "726일",
              <strong key="p4" className="text-yellow-400">12.3%</strong>,
            ],
          ]}
        />
        <p className="mt-2">
          <strong className="text-foreground">KOSPI↓ 과열↑ (12.3%)</strong>이
          가장 드물고 가장 위험한 구간입니다. 시장은 하락하는데 빚투 비중이
          높아지는 상황으로, 반대매매 리스크가 극대화됩니다.
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          주요 추세 구간 (30일 이상)
        </p>
        <Table
          headers={["구간", "기간", "추세", "KOSPI", "과열지수"]}
          rows={[
            [
              "2005-02 ~ 2006-06",
              "323일",
              <span key="t1" className="text-green-400">동반상승</span>,
              "+29.6%",
              <strong key="c1" className="text-green-400">+59.1%</strong>,
            ],
            [
              "2007-02 ~ 2008-01",
              "228일",
              <span key="t2" className="text-green-400">동반상승</span>,
              "+22.7%",
              <strong key="c2" className="text-yellow-400">+552.2%</strong>,
            ],
            [
              "2008-06 ~ 2009-02",
              "169일",
              <span key="t3" className="text-red-400">동반하락</span>,
              <strong key="k3" className="text-red-400">-38.8%</strong>,
              "-24.7%",
            ],
            [
              "2009-05 ~ 2010-03",
              "211일",
              <span key="t4" className="text-green-400">동반상승</span>,
              "+16.9%",
              "+8.0%",
            ],
            [
              "2011-08 ~ 2012-02",
              "110일",
              <span key="t5" className="text-red-400">동반하락</span>,
              "+10.3%",
              "-21.8%",
            ],
            [
              "2016-12 ~ 2017-06",
              "127일",
              <span key="t6" className="text-foreground">KOSPI↑ 과열↓</span>,
              <strong key="k6" className="text-green-400">+19.2%</strong>,
              "+3.5%",
            ],
            [
              "2017-10 ~ 2018-05",
              "145일",
              <span key="t7" className="text-green-400">동반상승</span>,
              "-1.4%",
              "+38.1%",
            ],
            [
              "2018-06 ~ 2018-10",
              "93일",
              <span key="t8" className="text-yellow-400">KOSPI↓ 과열↑</span>,
              <strong key="k8" className="text-red-400">-16.9%</strong>,
              "-5.1%",
            ],
            [
              "2020-06 ~ 2021-10",
              "322일",
              <span key="t9" className="text-green-400">동반상승</span>,
              <strong key="k9" className="text-green-400">+41.2%</strong>,
              "+33.7%",
            ],
            [
              "2022-10 ~ 2023-03",
              "108일",
              <span key="t10" className="text-red-400">동반하락</span>,
              "+11.0%",
              "-6.8%",
            ],
            [
              "2024-11 ~ 2025-02",
              "60일",
              <span key="t11" className="text-red-400">동반하락</span>,
              "+6.4%",
              "-4.2%",
            ],
            [
              "2025-12 ~ 2026-02",
              "37일",
              <span key="t12" className="text-foreground">KOSPI↑ 과열↓</span>,
              <strong key="k12" className="text-green-400">+34.1%</strong>,
              "-12.9%",
            ],
          ]}
        />
        <div className="mt-3 space-y-1.5">
          <p>
            <strong className="text-yellow-400">
              2007년: KOSPI +23%인데 과열지수 +552%
            </strong>{" "}
            &mdash; 역대 가장 극단적인 버블 구간. 빚투 레버리지가 24배.
          </p>
          <p>
            <strong className="text-foreground">
              2018년 6~10월: KOSPI↓ 과열↑
            </strong>{" "}
            &mdash; 미중 무역분쟁으로 KOSPI -16.9%인데 과열지수는 과열 상태 유지.
            전형적인 위험 구간.
          </p>
          <p>
            <strong className="text-foreground">
              2016~2017년: KOSPI↑ 과열↓
            </strong>{" "}
            &mdash; 가장 건강한 상승. KOSPI +19%인데 과열지수는 저하.
            빚투 없는 실적 기반 상승이었습니다.
          </p>
        </div>
      </Accordion>

      {/* 7. 반복 패턴 탐지 */}
      <Accordion title="7. 반복 패턴 탐지">
        <p className="mb-3 font-medium text-foreground">
          과열지수 급등(상위 10%) 후 KOSPI 성과
        </p>
        <Table
          headers={["기간", "KOSPI 평균", "하락 확률", "사례"]}
          rows={[
            ["5일 후", "+0.6%", "40.4%", "616건"],
            ["10일 후", "+1.0%", "37.0%", "613건"],
            ["20일 후", "+1.7%", "37.8%", "613건"],
            ["30일 후", "+2.9%", "31.0%", "613건"],
            [
              "60일 후",
              <strong key="a1" className="text-green-400">+6.3%</strong>,
              <strong key="d1" className="text-green-400">28.3%</strong>,
              "611건",
            ],
          ]}
        />
        <p className="mt-2">
          과열지수 급등 후 60일 평균 +6.3%, 하락확률 28.3%.{" "}
          <strong className="text-foreground">
            과열지수가 급등해도 KOSPI는 오히려 상승하는 경향
          </strong>
          입니다. 과열지수 급등 = KOSPI 급락(분모 효과)이므로, 급락 후 반등
          패턴입니다.
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          과열지수 급락(하위 10%) 후 KOSPI 성과
        </p>
        <Table
          headers={["기간", "KOSPI 평균", "하락 확률", "사례"]}
          rows={[
            ["5일 후", "+0.4%", "43.5%", "620건"],
            ["10일 후", "+0.8%", "39.7%", "619건"],
            ["20일 후", "+1.1%", "40.9%", "618건"],
            ["30일 후", "+1.7%", "40.0%", "617건"],
            ["60일 후", "+3.4%", "35.4%", "613건"],
          ]}
        />
        <p className="mt-2">
          과열지수 급락 후 성과가 급등 후보다 낮습니다.
          과열지수 급락 = KOSPI 급등(분모 효과)이므로, 급등 후 조정이 오는
          패턴입니다.
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          과열지수 위험 구간(&ge;0.85%) 진입 후 KOSPI 성과
        </p>
        <Table
          headers={["기간", "KOSPI 평균", "하락 확률", "사례"]}
          rows={[
            ["5일 후", "+0.6%", "37.5%", "24건"],
            ["10일 후", "+0.6%", "54.2%", "24건"],
            ["20일 후", "+0.6%", "50.0%", "24건"],
            ["30일 후", "+1.0%", "37.5%", "24건"],
            [
              "60일 후",
              "+3.6%",
              "29.2%",
              "24건",
            ],
            [
              "90일 후",
              <strong key="a3" className="text-foreground">+5.7%</strong>,
              <strong key="d3" className="text-red-400">37.5%</strong>,
              "24건",
            ],
          ]}
        />
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="font-semibold text-foreground">
            위험 구간 진입 24회, 90일 후 평균 +5.7%, 하락확률 37.5%
          </p>
          <p className="mt-1">
            위험 구간 진입이 곧바로 폭락을 의미하지는 않지만,{" "}
            <strong className="text-foreground">
              90일 후 하락확률이 37.5%로 상당히 높습니다.
            </strong>{" "}
            2022년 이후 데이터가 포함되면서 이전보다 보수적인 결과가 나왔습니다.
            위험 구간에서는 방어적인 자세가 필요합니다.
          </p>
        </div>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          KOSPI 급락 후 과열지수 하락 확률
        </p>
        <Table
          headers={["기간", "하락 확률", "건수"]}
          rows={[
            [
              "3일 내",
              <strong key="c1" className="text-foreground">66.2%</strong>,
              "204/308",
            ],
            ["5일 내", "68.8%", "212/308"],
            ["10일 내", "69.3%", "212/306"],
          ]}
        />
        <p className="mt-2">
          KOSPI 급락 후 3일 내 과열지수 하락(= 빚투 청산) 확률은{" "}
          <strong className="text-foreground">66.2%</strong>입니다. 분모 효과로
          당일은 과열지수가 올라가지만, 3일 후부터 실제 청산이 반영됩니다.
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">기타 패턴</p>
        <Table
          headers={["패턴", "결과"]}
          rows={[
            [
              "과열지수 최장 연속 상승",
              <span key="c1">
                <strong className="text-foreground">42일</strong>{" "}
                <span className="text-[11px]">(2007-05-16, 버블기)</span>
              </span>,
            ],
            [
              "과열지수 최장 연속 하락",
              <span key="c2">
                <strong className="text-foreground">13일</strong>{" "}
                <span className="text-[11px]">(2007-07-13, 버블 붕괴 시작)</span>
              </span>,
            ],
            [
              "안전→관심 전환 횟수",
              <strong key="c3" className="text-foreground">35회</strong>,
            ],
            [
              "안전→관심 전환 후 90일 KOSPI",
              <span key="c4">
                평균 +4.6%, 하락확률 34.3%
              </span>,
            ],
          ]}
        />
      </Accordion>

      {/* 8. 예외/이상치 */}
      <Accordion title="8. 예외/이상치">
        <p className="mb-3 font-medium text-foreground">
          예외1: 과열지수 급등 + KOSPI 급락 (같은 날)
        </p>
        <Table
          headers={["날짜", "과열지수", "KOSPI", "비고"]}
          rows={[
            [
              "2008-11-06",
              <strong key="o1" className="text-foreground">+13.9%</strong>,
              <strong key="k1" className="text-red-400">-7.6%</strong>,
              "역대 최대 과열 급등",
            ],
            [
              "2001-09-12",
              "+12.7%",
              <strong key="k2" className="text-red-400">-12.0%</strong>,
              "9.11 테러",
            ],
            ["2009-01-15", "+9.7%", "-6.0%", "금융위기 여진"],
            [
              "2024-08-05",
              "+9.4%",
              <strong key="k3" className="text-red-400">-8.8%</strong>,
              "블랙먼데이",
            ],
            ["2008-10-16", "+9.3%", "-9.4%", "금융위기 최절정"],
          ]}
        />
        <p className="mt-2">
          총 <strong className="text-foreground">167건</strong>.
          KOSPI가 폭락하면 시가총액 축소로 과열지수가 동시에 급등합니다.
          위기 시 과열지수가 치솟는 이유입니다.
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          예외2: 과열지수 급락 + KOSPI 급등
        </p>
        <Table
          headers={["날짜", "과열지수", "KOSPI", "비고"]}
          rows={[
            [
              "2008-10-28",
              <strong key="o1" className="text-red-400">-18.8%</strong>,
              "+5.6%",
              "역대 최대 과열 급락",
            ],
            ["2008-10-30", "-13.2%", "+11.9%", "금융위기 바닥 반등"],
            ["2020-03-24", "-12.2%", "+8.6%", "코로나 바닥 반등"],
            ["2007-08-20", "-12.1%", "+5.7%", "서브프라임 반등"],
          ]}
        />
        <p className="mt-2">
          총 <strong className="text-foreground">153건</strong>.
          강한 반등일에 시가총액 급증으로 과열지수가 동시에 급락합니다.
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          예외3: 과열지수 위험인데 KOSPI 추가 상승
        </p>
        <Table
          headers={["날짜", "과열지수", "30일 후 KOSPI", "당시 상황"]}
          rows={[
            [
              "2020-09",
              "0.907%",
              "+5.1%",
              "동학개미 상승 초입",
            ],
            [
              "2020-10",
              "0.855%",
              "+8.3%",
              "동학개미 가속",
            ],
            [
              "2020-11",
              "0.877%",
              <strong key="a1" className="text-green-400">+20.1%</strong>,
              "백신 랠리",
            ],
            [
              "2020-12",
              "0.850%",
              "+12.9%",
              "연말 대상승",
            ],
            [
              "2021-03",
              "0.865%",
              "+5.7%",
              "동학개미 후반",
            ],
          ]}
        />
        <p className="mt-2">
          9개월 중 5개월이 2020~2021년 동학개미 상승장에 집중.{" "}
          <strong className="text-foreground">
            강한 모멘텀 장세에서는 과열 경고가 무력화
          </strong>
          됩니다.
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          예외4: 과열지수 안전인데 KOSPI 하락
        </p>
        <Table
          headers={["날짜", "과열지수", "30일 후 KOSPI", "당시 상황"]}
          rows={[
            [
              "2001-02",
              "0.054%",
              <strong key="k1" className="text-red-400">-12.0%</strong>,
              "IT버블 붕괴",
            ],
            ["2001-03", "0.062%", "-9.1%", "IT버블 하락 지속"],
            ["2001-06", "0.060%", "-9.6%", "경기 침체"],
            ["2008-10", "0.263%", "-3.2%", "금융위기"],
            ["2018-10", "0.375%", "-4.6%", "미중 무역분쟁"],
          ]}
        />
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="font-semibold text-yellow-400">
            65개월에서 발생 &mdash; 과열지수 안전이 시장 안전을 보장하지 않음
          </p>
          <p className="mt-1">
            과열지수는 &ldquo;빚투로 인한 추가 하락 위험&rdquo;만 측정합니다.
            지정학적 위기, 글로벌 금융위기 등 외부 충격에 의한 하락은 감지하지
            못합니다.
          </p>
        </div>
      </Accordion>

      {/* 종합 시사점 */}
      <Accordion title="종합 시사점">
        <Table
          headers={["#", "발견", "투자 시사점"]}
          rows={[
            [
              "1",
              "25년 장기 상관 0.87 / 일별 -0.74",
              <span key="s1">
                장기 동행하지만{" "}
                <strong className="text-foreground">
                  단기 일별로는 역관계
                </strong>{" "}
                (분모 효과)
              </span>,
            ],
            [
              "1",
              <strong key="s1b" className="text-red-400">
                2010-2016 상관 0.03, 2022-현재 -0.45
              </strong>,
              "횡보·하락기에는 상관관계 자체가 무너지거나 역전",
            ],
            [
              "2",
              <strong key="s2" className="text-foreground">
                KOSPI 변화 후 2~4주 뒤 과열지수 반영
              </strong>,
              "KOSPI 방향 전환 후 2~4주 뒤 과열지수 확인",
            ],
            [
              "2",
              <strong key="s2b" className="text-red-400">
                위험 구간(≥0.85%) 90일 후 -1.9% (하락확률 70.7%)
              </strong>,
              "위험 구간 도달 시 명확한 하락 신호",
            ],
            [
              "3",
              "2007-03 역대 최대 위험, 2004-09 역대 최대 회복",
              "60일 괴리가 극단적인 구간이 시장 전환점",
            ],
            [
              "3",
              <strong key="s3b" className="text-yellow-400">
                2007년 과열지수 +500% vs KOSPI +11%
              </strong>,
              "역대 최악 버블 — 불균형이 극단적이면 위기의 전조",
            ],
            [
              "4",
              <strong key="s4" className="text-blue-400">
                과열지수 저점 후 90일 상승확률 95.8%
              </strong>,
              "가장 강력한 매수 신호 — 빚투 청산 완료 = 시장 건강 회복",
            ],
            [
              "4",
              "과열지수 고점 후 90일 +8.1%",
              "과열 고점이 곧 KOSPI 하락은 아님 — 모멘텀 구간",
            ],
            [
              "5",
              <strong key="s5" className="text-foreground">
                KOSPI 급락 후 과열지수 3~10일 지속 하락
              </strong>,
              "급락 당일 과열 급등은 분모 효과. 3일 후부터 실제 청산 반영",
            ],
            [
              "5",
              "변동성 상관 0.94",
              "시장 불안기에 과열지수 변동도 극대화 — 동시에 주시",
            ],
            [
              "6",
              <strong key="s6" className="text-foreground">
                KOSPI↓ 과열↑ 구간 = 전체의 12.3%
              </strong>,
              "가장 드물고 가장 위험한 구간. 2018년 미중분쟁이 대표 사례",
            ],
            [
              "7",
              "위험 구간 진입 24회, 90일 후 하락 37.5%",
              <span key="s7">
                <strong className="text-foreground">위험 진입 시 방어적 자세 필요</strong>
                . 90일 후 평균 +5.7%이나 하락확률 높음
              </span>,
            ],
            [
              "8",
              "과열 안전인데 KOSPI -5% 이상 = 65개월",
              <span key="s8">
                <strong className="text-red-400">
                  외부 충격은 과열지수로 감지 불가
                </strong>
              </span>,
            ],
          ]}
        />
        <div className="mt-4 rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
          <p className="text-sm font-semibold text-blue-400">한 줄 요약</p>
          <p className="mt-1 text-sm text-foreground">
            과열지수는 KOSPI와 장기 동행하지만 일별로는 역관계(분모 효과)입니다.{" "}
            <strong>과열지수 저점이 90일 상승확률 95.8%로 가장 강력한
            매수 신호</strong>이며, 위험 구간(≥0.85%)에서는 90일 후 -1.9%(하락확률 70.7%)로
            명확한 경고 신호입니다.
            다만 과열지수는 빚투 위험만 측정하므로, 외부 충격에 의한 하락은
            별도로 점검해야 합니다.
          </p>
        </div>
      </Accordion>
    </div>
  );
}
