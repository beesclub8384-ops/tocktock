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

export function CreditBalanceAnalysis() {
  return (
    <div className="mt-4 rounded-lg border border-border">
      <div className="px-4 py-3 text-sm font-semibold text-foreground">
        TockTock 데이터 분석 (1998-07 ~ 2026-02, 6,794영업일)
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
              "KOSPI 지수 ↔ KOSPI 융자잔고",
              <strong key="lv" className="text-foreground">0.8987</strong>,
              "0.0002",
            ],
          ]}
        />
        <div className="mt-3 space-y-1.5">
          <p>
            수준 상관이 <strong className="text-foreground">0.90</strong>으로
            매우 높음 &rarr; 장기적으로 지수와 융자잔고는 같은 방향입니다.
          </p>
          <p>
            일별 변화율 상관은 사실상 0 &rarr;{" "}
            <strong className="text-foreground">
              같은 날 동시에 움직이지 않음
            </strong>{" "}
            (시차가 있다는 뜻).
          </p>
        </div>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">롤링 상관계수</p>
        <Table
          headers={["윈도우", "평균", "최소", "최대"]}
          rows={[
            [
              "60일",
              "0.37",
              <span key="r1">
                <strong className="text-red-400">-0.95</strong>{" "}
                <span className="text-[11px]">(2013-01)</span>
              </span>,
              <span key="r2">
                0.98 <span className="text-[11px]">(2007-06)</span>
              </span>,
            ],
            [
              "120일",
              "0.52",
              <span key="r3">
                <strong className="text-red-400">-0.86</strong>{" "}
                <span className="text-[11px]">(2013-04)</span>
              </span>,
              <span key="r4">
                0.98 <span className="text-[11px]">(2007-06)</span>
              </span>,
            ],
            [
              "250일",
              "0.62",
              <span key="r5">
                <strong className="text-red-400">-0.73</strong>{" "}
                <span className="text-[11px]">(2013-05)</span>
              </span>,
              <span key="r6">
                <strong className="text-green-400">0.98</strong>{" "}
                <span className="text-[11px]">(2026-02)</span>
              </span>,
            ],
          ]}
        />

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">구간별 수준 상관</p>
        <Table
          headers={["구간", "상관계수", "데이터"]}
          rows={[
            ["1998-2003 (IMF 이후)", "0.60", "1,345일"],
            ["2004-2007 (상승장)", <strong key="p1" className="text-foreground">0.82</strong>, "990일"],
            ["2008-2009 (금융위기)", <strong key="p2" className="text-foreground">0.86</strong>, "501일"],
            [
              "2010-2016 (횡보)",
              <strong key="p3" className="text-red-400">0.19</strong>,
              "1,732일",
            ],
            ["2017-2019 (변동)", "0.36", "731일"],
            [
              "2020-2021 (코로나·동학)",
              <strong key="p4" className="text-green-400">0.96</strong>,
              "496일",
            ],
            [
              "2022-현재",
              <strong key="p5" className="text-green-400">0.96</strong>,
              "999일",
            ],
          ]}
        />
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="font-semibold text-foreground">
            2010-2016 횡보기에 상관 0.19로 급락
          </p>
          <p className="mt-1">
            지수가 2,000 부근에서 횡보하는 동안 융자잔고는 독자적으로 등락했습니다.
            상관이 높다고 항상 믿으면 안 됩니다.
          </p>
        </div>
      </Accordion>

      {/* 2. 선행/후행 분석 */}
      <Accordion title="2. 선행/후행 분석 (누가 먼저 움직이나?)">
        <p className="mb-3 font-medium text-foreground">
          일별 변화율 교차상관
        </p>
        <Table
          headers={["lag (영업일)", "상관계수"]}
          rows={[
            ["-20", "0.0068"],
            ["-10", "0.0028"],
            ["-5", "-0.0064"],
            ["-3", "-0.0154"],
            ["-1", "-0.0016"],
            [
              <strong key="l0" className="text-foreground">0</strong>,
              "0.0002",
            ],
            ["+1", "0.0053"],
            [
              <strong key="l2" className="text-foreground">+2</strong>,
              <strong key="v2" className="text-blue-400">0.2167</strong>,
            ],
            ["+3", "0.1032"],
            ["+5", "0.1618"],
            ["+10", "0.0849"],
            ["+20", "0.0389"],
          ]}
        />
        <p className="mt-2 text-[11px] text-muted-foreground/70">
          양수 lag = 지수 변화 후 N일 뒤 융자 변화 / 음수 = 융자 변화 후 N일
          뒤 지수 변화
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          30일 변화율 교차상관
        </p>
        <Table
          headers={["lag (영업일)", "상관계수"]}
          rows={[
            ["-20", "0.1749"],
            ["-10", "0.2941"],
            ["-5", "0.3638"],
            ["0", "0.4433"],
            ["+5", "0.5122"],
            [
              <strong key="l10" className="text-foreground">+10</strong>,
              <strong key="v10" className="text-blue-400">0.5260</strong>,
            ],
            ["+20", "0.4689"],
          ]}
        />

        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="font-semibold text-foreground">
            핵심 발견: lag +2에서 일별 상관 최고 (0.22), lag +5~+10에서 30일
            상관 최고 (0.51~0.53)
          </p>
          <p className="mt-1">
            &rarr;{" "}
            <strong className="text-foreground">
              지수가 먼저 움직이고, 약 2~10영업일 후에 융자잔고가 따라갑니다.
            </strong>{" "}
            단기(일별)로는 2일, 중기(30일 추세)로는 5~10일의 시차가 있습니다.
          </p>
        </div>
      </Accordion>

      {/* 3. 다이버전스 감지 */}
      <Accordion title="3. 다이버전스 감지 (60영업일 변화율 괴리)">
        <p className="mb-3 font-medium text-red-400">
          위험 구간: 융자↑ & 지수↓
        </p>
        <Table
          headers={["날짜", "지수", "융자잔고", "괴리"]}
          rows={[
            [
              "2001-04-10",
              "-16.7%",
              "+21.4%",
              <strong key="g1" className="text-red-400">+38.1%</strong>,
            ],
            ["2001-04-09", "-15.2%", "+19.1%", "+34.3%"],
            ["2020-03-13", "-18.4%", "+9.2%", "+27.6%"],
            ["1999-10-05", "-23.0%", "+5.8%", "+28.8%"],
            ["2002-05-31", "-5.5%", "+21.8%", "+27.3%"],
          ]}
        />
        <p className="mt-2">
          &rarr;{" "}
          <strong className="text-foreground">
            2001년 4월(IT 버블 붕괴)이 역대 최대 위험 구간.
          </strong>{" "}
          코로나 폭락(2020-03)도 상위권.
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-green-400">
          회복 구간: 융자↓ & 지수↑
        </p>
        <Table
          headers={["날짜", "지수", "융자잔고", "괴리"]}
          rows={[
            [
              "2001-01-16",
              "+17.7%",
              "-35.9%",
              <strong key="g2" className="text-green-400">-53.6%</strong>,
            ],
            ["2004-09-06", "+11.6%", "-41.7%", "-53.3%"],
            ["2001-01-12", "+12.1%", "-39.8%", "-51.8%"],
          ]}
        />
        <p className="mt-2">
          &rarr;{" "}
          <strong className="text-foreground">
            2001년 1월과 2004년 9월이 역대 최대 회복 구간.
          </strong>{" "}
          빚투 청산 후 지수가 강하게 반등한 구간입니다.
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          같은 방향이지만 크기 차이 극단
        </p>
        <Table
          headers={["날짜", "지수", "융자잔고", "괴리"]}
          rows={[
            [
              "2007-06-13",
              "+20.6%",
              <strong key="g3" className="text-foreground">+585.6%</strong>,
              "+565.0%",
            ],
            ["2007-05-15", "+10.7%", "+563.9%", "+553.3%"],
          ]}
        />
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="font-semibold text-yellow-400">
            2007년 상반기: 역대 최악의 빚투 버블
          </p>
          <p className="mt-1">
            지수는 20% 오르는 동안 융자잔고는 580% 폭증. 이후 금융위기로
            이어졌습니다.
          </p>
        </div>
      </Accordion>

      {/* 4. 변곡점 분석 */}
      <Accordion title="4. 변곡점 분석 (고점/저점 시차)">
        <p className="mb-3 font-medium text-foreground">
          지수 극값 vs 융자 극값 시차 (120영업일 윈도우)
        </p>
        <Table
          headers={["비교", "평균 시차", "해석"]}
          rows={[
            [
              "지수 고점 → 융자 고점",
              <strong key="p1" className="text-foreground">+36.1일</strong>,
              "융자가 약 7주 후행",
            ],
            [
              "지수 저점 → 융자 저점",
              <strong key="p2" className="text-foreground">+49.8일</strong>,
              "융자가 약 10주 후행",
            ],
          ]}
        />
        <p className="mt-2 text-[11px] text-muted-foreground/70">
          양수 = 융자가 후행 / 음수 = 융자가 선행
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">주요 변곡점 사례</p>
        <Table
          headers={["지수 고점", "융자 고점", "시차"]}
          rows={[
            ["2007-10-31", "2007-06-25", "-86일 (융자 선행)"],
            ["2011-05-02", "2011-05-19", "+11일"],
            ["2021-07-06", "2021-08-18", "+30일"],
            ["2024-07-11", "2024-07-17", "+4일"],
          ]}
        />
        <Table
          headers={["지수 저점", "융자 저점", "시차"]}
          rows={[
            ["2008-10-24", "2008-10-31", "+5일 (거의 동시)"],
            ["2020-03-19", "2020-03-27", "+6일"],
            ["2003-03-17", "2003-03-19", "+2일"],
            ["2022-09-30", "2023-01-31", "+78일"],
          ]}
        />
        <div className="mt-3 space-y-1.5">
          <p>
            <strong className="text-foreground">고점</strong>: 2007년처럼 융자가
            먼저 고점을 찍는 예외도 있지만, 대체로 융자가 후행합니다.
          </p>
          <p>
            <strong className="text-foreground">저점</strong>: 급락기에는 거의
            동시(2~6일), 완만한 하락기에는 10주 이상 후행. 지수 바닥 확인 후
            1~2주면 융자 바닥도 확인 가능합니다.
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
              "KOSPI 지수",
              "+0.054%",
              "1.54%",
              "+11.95% (2008-10-30)",
              "-12.02% (2001-09-12)",
            ],
            [
              "KOSPI 융자잔고",
              "+0.073%",
              "1.24%",
              "+11.13% (2000-10-02)",
              <strong key="mn" className="text-red-400">-16.74% (2008-10-29)</strong>,
            ],
          ]}
        />
        <p className="mt-2">
          융자잔고 최대 하락(-16.74%)은 2008년 금융위기 때 발생. 하루 만에
          전체의 1/6이 청산되었습니다.
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          융자잔고 극단 변화일 &rarr; 지수 반응
        </p>
        <Table
          headers={["트리거", "같은 날", "다음 날", "3일 후", "5일 후"]}
          rows={[
            [
              "융자 급증(상위 5%)",
              "+0.18%",
              "+0.26%",
              "+0.08%",
              "+0.06%",
            ],
            [
              "융자 급감(하위 5%)",
              "+0.19%",
              "+0.10%",
              "+0.25%",
              "+0.25%",
            ],
          ]}
        />
        <p className="mt-2">
          융자 급증/급감 모두 지수 반응은 미미합니다. 융자 변화가 지수를
          움직이지는 않습니다.
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          지수 극단 변화일 &rarr; 융자 반응
        </p>
        <Table
          headers={["트리거", "같은 날", "다음 날", "3일 후", "5일 후"]}
          rows={[
            [
              "지수 급등(상위 5%)",
              "-0.23%",
              "-0.21%",
              "-0.12%",
              "+0.39%",
            ],
            [
              "지수 급락(하위 5%)",
              "-0.25%",
              "-0.25%",
              <strong key="r1" className="text-red-400">-0.56%</strong>,
              <strong key="r2" className="text-red-400">-0.48%</strong>,
            ],
          ]}
        />
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="font-semibold text-foreground">
            지수 급락 3~5일 후 융자잔고가 본격 감소
          </p>
          <p className="mt-1">
            &rarr; 반대매매는 T+2~3일에 집중됩니다. 급락 직후보다{" "}
            <strong className="text-foreground">3일 후가 진짜 청산일</strong>.
          </p>
          <p className="mt-1">
            지수 급등 후에는 오히려 융자가 감소 &mdash; 차익실현(빚 상환)이
            먼저 발생하고, 5일 후에야 새로운 빚투가 유입됩니다.
          </p>
        </div>
      </Accordion>

      {/* 6. 추세 구간 분류 */}
      <Accordion title="6. 추세 구간 분류">
        <p className="mb-3 text-[11px] text-muted-foreground/70">
          250일 이동평균 기준. 지수·융자 모두 MA 위 = 상승, 모두 아래 = 하락,
          불일치 = 괴리
        </p>
        <Table
          headers={["구간", "기간", "추세", "지수", "융자잔고"]}
          rows={[
            [
              "2000-04 ~ 2001-06",
              "291일",
              <span key="t1" className="text-red-400">하락</span>,
              <strong key="i1" className="text-red-400">-28.1%</strong>,
              "-56.3%",
            ],
            [
              "2005-01 ~ 2006-07",
              "374일",
              <span key="t2" className="text-green-400">상승</span>,
              "+39.8%",
              <strong key="c2" className="text-green-400">+105.3%</strong>,
            ],
            [
              "2007-02 ~ 2008-01",
              "240일",
              <span key="t3" className="text-green-400">상승</span>,
              "+14.1%",
              <strong key="c3" className="text-yellow-400">+753.8%</strong>,
            ],
            [
              "2008-06 ~ 2009-04",
              "225일",
              <span key="t4" className="text-red-400">하락</span>,
              "-26.0%",
              "-22.8%",
            ],
            [
              "2010-05 ~ 2011-08",
              "302일",
              <span key="t5" className="text-green-400">상승</span>,
              "+12.1%",
              "+38.6%",
            ],
            [
              "2017-03 ~ 2018-06",
              "297일",
              <span key="t6" className="text-green-400">상승</span>,
              "+13.3%",
              "+97.2%",
            ],
            [
              "2020-06 ~ 2021-11",
              "362일",
              <span key="t7" className="text-green-400">상승</span>,
              "+32.8%",
              <strong key="c7" className="text-green-400">+122.0%</strong>,
            ],
            [
              "2021-12 ~ 2023-04",
              "339일",
              <span key="t8" className="text-red-400">하락</span>,
              "-14.3%",
              "-21.5%",
            ],
            [
              "2025-05 ~ 2026-02",
              "179일",
              <span key="t9" className="text-green-400">상승</span>,
              <strong key="i9" className="text-green-400">+108.3%</strong>,
              "+99.0%",
            ],
          ]}
        />
        <div className="mt-3 space-y-1.5">
          <p>
            <strong className="text-foreground">상승기</strong>: 융자잔고
            증가폭이 지수 상승폭의{" "}
            <strong className="text-foreground">2~7배</strong> (레버리지 효과).
            2007년은 54배로 역대 최고.
          </p>
          <p>
            <strong className="text-foreground">하락기</strong>: 융자잔고
            감소폭이 지수 하락폭의 1.5~2배.
          </p>
          <p>
            <strong className="text-foreground">2025년 대상승장</strong>: 지수
            +108%에 융자 +99% &mdash; 거의 동일한 비율로 동반 상승.
          </p>
        </div>
      </Accordion>

      {/* 7. 반복 패턴 탐지 */}
      <Accordion title="7. 반복 패턴 탐지">
        <p className="mb-3 font-medium text-foreground">
          융자 급증(상위 10%) 후 지수 성과
        </p>
        <Table
          headers={["기간", "지수 평균", "하락 확률", "사례"]}
          rows={[
            ["5일 후", "+0.64%", "38.9%", "679건"],
            ["10일 후", "+1.47%", "36.0%", "678건"],
            ["20일 후", "+2.89%", "34.4%", "674건"],
            [
              "30일 후",
              "+4.24%",
              <strong key="d1" className="text-foreground">30.6%</strong>,
              "673건",
            ],
            [
              "60일 후",
              <strong key="a1" className="text-green-400">+8.13%</strong>,
              <strong key="d2" className="text-green-400">25.6%</strong>,
              "671건",
            ],
          ]}
        />
        <p className="mt-2">
          &rarr; 융자 급증 후 60일 평균 +8.13%, 하락 확률 25.6%.{" "}
          <strong className="text-foreground">
            급증 자체는 위험 신호가 아닙니다.
          </strong>
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          융자 급감(하위 10%) 후 지수 성과
        </p>
        <Table
          headers={["기간", "지수 평균", "하락 확률", "사례"]}
          rows={[
            ["5일 후", "+0.44%", "45.1%", "679건"],
            ["10일 후", "+0.81%", "40.9%", "679건"],
            ["20일 후", "+1.45%", "39.9%", "679건"],
            ["30일 후", "+2.15%", "40.6%", "679건"],
            [
              "60일 후",
              "+3.24%",
              "34.2%",
              "679건",
            ],
          ]}
        />
        <p className="mt-2">
          융자 급감 후 성과가 급증 후보다 낮음. 28년 전체로 보면 급감은
          반등보다{" "}
          <strong className="text-foreground">
            추가 하락의 시작
          </strong>
          인 경우도 많았습니다.
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">기타 패턴</p>
        <Table
          headers={["패턴", "결과"]}
          rows={[
            [
              "융자 최장 연속 증가",
              <span key="c1">
                <strong className="text-foreground">42일</strong>{" "}
                <span className="text-[11px]">(2007-05-16, 버블기)</span>
              </span>,
            ],
            [
              "융자 최장 연속 감소",
              <span key="c2">
                <strong className="text-foreground">24일</strong>{" "}
                <span className="text-[11px]">(2000-03-10, IT버블 붕괴)</span>
              </span>,
            ],
            [
              "지수 급락 후 3일 내 융자 감소 확률",
              <strong key="c3" className="text-foreground">91.5%</strong>,
            ],
          ]}
        />
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="font-semibold text-foreground">
            지수 급락 후 3일 내 융자 감소 확률 91.5%
          </p>
          <p className="mt-1">
            28년간 340건의 급락 중 311건에서 3일 내 융자 감소 &mdash; 거의
            확실한 패턴입니다.
          </p>
        </div>
      </Accordion>

      {/* 8. 예외/이상치 */}
      <Accordion title="8. 예외/이상치">
        <p className="mb-3 font-medium text-foreground">
          예외1: 융자 급증 + 지수 급등 (동시 폭등)
        </p>
        <Table
          headers={["날짜", "융자 변화", "지수 변화", "당시 상황"]}
          rows={[
            ["1998-12-07", "+3.21%", "+10.33%", "IMF 이후 초기 반등"],
            ["2000-11-01", "+3.39%", "+6.66%", "IT버블 중간 반등"],
            ["2001-12-05", "+3.01%", "+5.91%", "9.11 이후 회복"],
            ["2009-01-28", "+1.28%", "+5.91%", "금융위기 바닥 반등"],
          ]}
        />
        <p className="mt-2">
          &rarr; 극단적 위기 후 초기 반등기에 집중.{" "}
          <strong className="text-foreground">
            공포 후 강한 반등 = 빚투 동시 유입
          </strong>
          .
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          예외2: 융자 급감 후에도 30일 지수 하락 &gt;5%
        </p>
        <Table
          headers={["기간", "대표 날짜", "30일 후 지수", "당시 상황"]}
          rows={[
            [
              "2000년",
              "2000-03-02",
              <strong key="e1" className="text-red-400">-20.9%</strong>,
              "IT버블 본격 붕괴",
            ],
            [
              "2002년",
              "2002-12-11",
              <strong key="e2" className="text-red-400">-14.0%</strong>,
              "카드대란 시작",
            ],
            [
              "2008년",
              "2008-09-24",
              <strong key="e3" className="text-red-400">-27.0%</strong>,
              "리먼브라더스 파산",
            ],
            [
              "2011년",
              "2011-08-10",
              "-8.5%",
              "유럽 재정위기",
            ],
          ]}
        />
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="font-semibold text-yellow-400">
            시스템 위기(IT버블, 카드대란, 금융위기)에서는 융자 급감이 바닥
            신호가 되지 않습니다.
          </p>
        </div>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          예외3: 지수 급락 + 같은 날 융자 증가 (물타기)
        </p>
        <Table
          headers={["날짜", "지수", "융자", "특징"]}
          rows={[
            [
              "2000-09-18",
              <strong key="i1" className="text-red-400">-8.06%</strong>,
              "+1.49%",
              "IT버블 폭락 중 물타기",
            ],
            [
              "2000-10-02",
              "-3.91%",
              <strong key="c1" className="text-foreground">+11.13%</strong>,
              "역대 최대 일일 융자 증가",
            ],
            [
              "2008-11-06",
              "-7.56%",
              "+5.90%",
              "금융위기 중 물타기",
            ],
            [
              "2026-02-02",
              <strong key="i3" className="text-red-400">-5.26%</strong>,
              "+1.23%",
              "최근 급락 중 빚투 진입",
            ],
          ]}
        />
        <p className="mt-2">
          28년간 127건 발생.{" "}
          <strong className="text-red-400">
            급락일에 융자 증가 = 물타기 투자자
          </strong>
          . 후속 하락 시 반대매매 폭탄이 됩니다.
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          극단 이상치 (상하위 1%)
        </p>
        <Table
          headers={["날짜", "융자 변화", "지수", "비고"]}
          rows={[
            [
              "2008-10-29",
              <strong key="x1" className="text-red-400">-16.74%</strong>,
              "-3.02%",
              "역대 최대 하루 감소 (금융위기)",
            ],
            [
              "2008-10-28",
              <strong key="x2" className="text-red-400">-14.71%</strong>,
              "+5.57%",
              "금융위기 청산",
            ],
            [
              "2000-10-02",
              <strong key="x3" className="text-green-400">+11.13%</strong>,
              "-3.91%",
              "역대 최대 하루 증가 (물타기)",
            ],
            [
              "2007-02-08",
              "+7.10%",
              "-0.19%",
              "버블기 빚투 폭증 시작",
            ],
            [
              "2020-03-23",
              <strong key="x4" className="text-red-400">-9.70%</strong>,
              "-5.34%",
              "코로나 바닥일 대규모 청산",
            ],
          ]}
        />
      </Accordion>

      {/* 종합 시사점 */}
      <Accordion title="종합 시사점">
        <Table
          headers={["#", "발견", "투자 시사점"]}
          rows={[
            [
              "1",
              "28년 장기 상관 0.90 / 일별 상관 0.00",
              "같은 방향이지만 동시에 안 움직임 — 시차 활용 가능",
            ],
            [
              "1",
              <strong key="s1b" className="text-red-400">
                2010-2016 상관 0.19로 급락
              </strong>,
              "횡보기에는 상관관계 자체가 무너짐. 상관을 맹신하면 안 됨",
            ],
            [
              "2",
              <strong key="s2" className="text-foreground">
                지수가 2~10영업일 선행
              </strong>,
              "지수 급변 후 2~3일 뒤 융자 데이터 확인하면 후속 흐름 예측 가능",
            ],
            [
              "3",
              "2001-04 역대 최대 위험, 2001-01 역대 최대 회복",
              "괴리가 극단적인 구간이 시장 전환점",
            ],
            [
              "3",
              <strong key="s3b" className="text-yellow-400">
                2007년 융자 +580% vs 지수 +20%
              </strong>,
              "역대 최악 버블 — 불균형이 극단적이면 위기의 전조",
            ],
            [
              "4",
              "고점 시차 +36일, 저점 시차 +50일",
              "지수 고점 후 7주, 저점 후 10주 기다리면 융자 전환 확인 가능",
            ],
            [
              "5",
              <strong key="s5" className="text-foreground">
                지수 급락 3~5일 후 융자 본격 감소
              </strong>,
              "반대매매는 T+2~3 집중 — 급락 당일이 아닌 3일 후가 진짜 청산일",
            ],
            [
              "6",
              "상승기 융자 레버리지 2~7배, 하락기 1.5~2배",
              "빚투는 상승장에서 훨씬 공격적으로 증가",
            ],
            [
              "7",
              "융자 급증 후 60일 하락 확률 25.6%",
              <span key="s7">
                <strong className="text-foreground">
                  급증 ≠ 위험 신호
                </strong>
                . 과열지수와 함께 봐야 함
              </span>,
            ],
            [
              "7",
              <strong key="s7b" className="text-foreground">
                지수 급락 → 3일 내 융자 감소 91.5%
              </strong>,
              "28년간 가장 확실한 패턴",
            ],
            [
              "8",
              <strong key="s8" className="text-red-400">
                급락일 융자 증가 = 물타기 (127건)
              </strong>,
              "후속 하락 시 반대매매 폭탄 위험",
            ],
            [
              "8",
              "시스템 위기에서는 모든 패턴 무효",
              "IT버블, 금융위기, 카드대란에서는 융자 급감도 바닥이 아님",
            ],
          ]}
        />
        <div className="mt-4 rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
          <p className="text-sm font-semibold text-blue-400">한 줄 요약</p>
          <p className="mt-1 text-sm text-foreground">
            28년간 지수가 먼저 움직이고 융자가 2~10일 뒤 따라간다. 급락 후
            3일 내 91.5% 확률로 융자가 줄어들지만, 시스템 위기에서는 이
            패턴도 작동하지 않는다. 융자 급증 자체보다{" "}
            <strong>지수와의 괴리 크기</strong>가 진짜 위험 신호다.
          </p>
        </div>
      </Accordion>
    </div>
  );
}
