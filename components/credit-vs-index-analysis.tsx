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

export function CreditVsIndexAnalysis() {
  return (
    <div className="mt-4 rounded-lg border border-border">
      <div className="px-4 py-3 text-sm font-semibold text-foreground">
        TockTock 데이터 분석 (2021-11 ~ 2026-02, 1,036영업일)
      </div>

      {/* 1. 피어슨 상관계수 */}
      <Accordion title="1. 상관계수 분석">
        <p className="mb-3 font-medium text-foreground">
          수준(level) 상관 vs 일별 변화율 상관
        </p>
        <Table
          headers={["비교 대상", "수준 상관", "일별 변화율 상관"]}
          rows={[
            [
              "코스피 ↔ 융자잔고",
              <strong key="k" className="text-foreground">0.8911</strong>,
              "0.0518",
            ],
            [
              "코스닥 ↔ 융자잔고",
              <strong key="q" className="text-foreground">0.7830</strong>,
              "0.0077",
            ],
          ]}
        />
        <div className="mt-3 space-y-1.5">
          <p>
            수준 상관이 매우 높음 (0.89, 0.78) &rarr; 장기적으로 지수와
            융자잔고는 같은 방향으로 움직입니다.
          </p>
          <p>
            일별 변화율 상관은 거의 0 &rarr;{" "}
            <strong className="text-foreground">
              같은 날 동시에 움직이지는 않음
            </strong>{" "}
            (시차가 있다는 뜻).
          </p>
        </div>
      </Accordion>

      {/* 2. 선행/후행 분석 */}
      <Accordion title="2. 선행/후행 분석 (누가 먼저 움직이나?)">
        <p className="mb-3 font-medium text-foreground">
          lag별 일변화율 상관계수
        </p>
        <Table
          headers={["lag (영업일)", "코스피↔융자", "코스닥↔융자"]}
          rows={[
            ["-10", "0.0214", "0.0193"],
            ["-5", "0.0030", "0.0000"],
            ["-3", "0.0569", "0.0365"],
            ["-2", "-0.0025", "-0.0489"],
            ["-1", "-0.0199", "-0.0471"],
            [
              <strong key="l" className="text-foreground">0</strong>,
              "0.0518",
              "0.0077",
            ],
            ["+1", "0.0295", "-0.0040"],
            ["+2", "0.1399", "0.2558"],
            [
              <strong key="l3" className="text-foreground">+3</strong>,
              <strong key="k3" className="text-blue-400">0.4992</strong>,
              <strong key="q3" className="text-green-400">0.5428</strong>,
            ],
            ["+5", "0.1636", "0.1774"],
            ["+10", "0.1047", "0.0934"],
          ]}
        />
        <p className="mt-2 text-[11px] text-muted-foreground/70">
          양수 lag = 지수 변화 후 N일 뒤 융자 변화 / 음수 = 융자 변화 후 N일
          뒤 지수 변화
        </p>
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="font-semibold text-foreground">
            핵심 발견: lag +3에서 상관계수가 급격히 높아짐 (0.50, 0.54)
          </p>
          <p className="mt-1">
            &rarr;{" "}
            <strong className="text-foreground">
              지수가 먼저 움직이고, 약 3영업일 후에 융자잔고가 따라갑니다.
            </strong>{" "}
            지수가 오르면 3일 뒤 빚을 내서 매수하고, 지수가 떨어지면 3일 뒤
            청산(반대매매)이 발생합니다.
          </p>
        </div>
      </Accordion>

      {/* 3. 이상 구간 탐지 */}
      <Accordion title="3. 이상 구간 탐지 (30영업일 변화율 괴리)">
        <p className="mb-3 font-medium text-red-400">
          위험 구간: 융자↑ & 코스피↓
        </p>
        <Table
          headers={["날짜", "코스피", "코스닥", "융자잔고", "괴리"]}
          rows={[
            [
              "2023-03-14",
              "-4.1%",
              "+2.6%",
              "+13.4%",
              <strong key="g1" className="text-red-400">+17.6%</strong>,
            ],
            ["2023-03-13", "-3.0%", "+6.4%", "+14.0%", "+17.0%"],
            ["2023-03-10", "-3.0%", "+6.7%", "+13.8%", "+16.8%"],
            ["2022-12-23", "-6.8%", "-5.5%", "+4.5%", "+11.3%"],
          ]}
        />
        <p className="mb-4 mt-2">
          &rarr;{" "}
          <strong className="text-foreground">
            2023년 3월이 가장 위험했던 구간.
          </strong>{" "}
          코스피는 하락하는데 융자잔고는 급증.
        </p>

        <p className="mb-3 font-medium text-green-400">
          회복 구간: 융자↓ & 코스피↑
        </p>
        <Table
          headers={["날짜", "코스피", "코스닥", "융자잔고", "괴리"]}
          rows={[
            [
              "2022-11-15",
              "+11.7%",
              "+7.6%",
              "-12.5%",
              <strong key="g2" className="text-green-400">-24.2%</strong>,
            ],
            ["2022-11-16", "+11.4%", "+6.4%", "-10.8%", "-22.2%"],
            ["2024-09-20", "+6.2%", "+8.3%", "-11.4%", "-17.6%"],
          ]}
        />
        <p className="mt-2">
          &rarr;{" "}
          <strong className="text-foreground">
            2022년 11월이 대표적 회복 구간.
          </strong>{" "}
          공포 매도 후 바닥 반등.
        </p>
      </Accordion>

      {/* 4. 변곡점 분석 */}
      <Accordion title="4. 변곡점 분석 (고점/저점 시차)">
        <p className="mb-3 font-medium text-foreground">
          지수 극값 vs 융자 극값 평균 시차 (40영업일 윈도우)
        </p>
        <Table
          headers={["비교", "평균 차이", "해석"]}
          rows={[
            ["코스피 고점 vs 융자 고점", "-13.1일", "노이즈 큼"],
            ["코스피 저점 vs 융자 저점", "-9.1일", "노이즈 큼"],
            [
              "코스닥 고점 vs 융자 고점",
              <strong key="p1" className="text-foreground">+1.9일</strong>,
              "거의 동시",
            ],
            [
              "코스닥 저점 vs 융자 저점",
              <strong key="p2" className="text-foreground">+6.7일</strong>,
              "융자가 약 1주 후행",
            ],
          ]}
        />
        <p className="mt-2 text-[11px] text-muted-foreground/70">
          양수 = 융자가 후행 / 음수 = 융자가 선행
        </p>
        <div className="mt-3 space-y-1.5">
          <p>
            <strong className="text-foreground">고점</strong>: 코스닥과 융자가
            거의 동시에 고점 (차이 2일).
          </p>
          <p>
            <strong className="text-foreground">저점</strong>: 코스닥이 바닥
            찍은 후{" "}
            <strong className="text-foreground">약 7영업일 뒤</strong>{" "}
            융자잔고가 저점 &rarr; 지수가 먼저 바닥을 찍고, 이후
            반대매매/청산이 마무리됩니다.
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
              "코스피",
              "+0.068%",
              "1.24%",
              "+6.84% (2026-02-03)",
              "-8.77% (2024-08-05)",
            ],
            [
              "코스닥",
              "+0.021%",
              "1.55%",
              "+7.34% (2023-11-06)",
              "-11.30% (2024-08-05)",
            ],
            [
              "융자잔고",
              "+0.029%",
              "0.71%",
              "+2.15% (2025-06-25)",
              "-7.01% (2024-08-07)",
            ],
          ]}
        />
        <p className="mt-2">
          코스닥이 코스피보다 변동성이 25% 더 큼. 융자잔고 최대 하락(-7.01%)은
          2024-08-05 블랙먼데이{" "}
          <strong className="text-foreground">2일 후</strong> 발생 (lag+3 패턴
          확인).
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          융자잔고 극단 변화일 &rarr; 지수 반응
        </p>
        <Table
          headers={["트리거", "같은 날", "다음 날", "3일 후"]}
          rows={[
            [
              "융자 급증(상위 5%) → 코스피",
              "+0.26%",
              "+0.25%",
              "+0.49%",
            ],
            [
              "융자 급증(상위 5%) → 코스닥",
              "+0.26%",
              "+0.11%",
              "+0.36%",
            ],
            [
              "융자 급감(하위 5%) → 코스피",
              "+0.36%",
              "+0.22%",
              "-0.09%",
            ],
            [
              "융자 급감(하위 5%) → 코스닥",
              "+0.28%",
              "+0.19%",
              "-0.31%",
            ],
          ]}
        />
        <p className="mt-2">
          융자 급증일은 지수도 양호. 융자 급감일은 당일은 반등하지만 3일 후
          다시 하락 경향.
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          지수 급락일 &rarr; 융자 반응
        </p>
        <Table
          headers={["트리거", "같은 날", "다음 날", "3일 후"]}
          rows={[
            [
              "코스피 급락(하위 5%) → 융자",
              "-0.37%",
              "-0.18%",
              <strong key="r1" className="text-red-400">-0.96%</strong>,
            ],
            [
              "코스닥 급락(하위 5%) → 융자",
              "-0.45%",
              "-0.53%",
              <strong key="r2" className="text-red-400">-1.16%</strong>,
            ],
          ]}
        />
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="font-semibold text-foreground">
            지수 급락 3일 후 융자잔고가 크게 감소
          </p>
          <p className="mt-1">
            &rarr; 반대매매는 T+3일에 집중됩니다. 급락 직후보다 3일 후가 진짜
            청산일입니다.
          </p>
        </div>
      </Accordion>

      {/* 6. 추세 구간 분류 */}
      <Accordion title="6. 추세 구간 분류">
        <Table
          headers={["구간", "기간", "코스피", "코스닥", "융자잔고", "추세"]}
          rows={[
            ["2022-02 ~ 04", "46일", "-1.1%", "+5.9%", "+3.7%", "횡보"],
            ["2022-04 ~ 05", "24일", "-1.3%", "-3.9%", "-3.5%", "횡보"],
            [
              "2022-06 ~ 08",
              "43일",
              <strong key="s1" className="text-red-400">-7.4%</strong>,
              "-8.5%",
              <strong key="s2" className="text-red-400">-13.1%</strong>,
              <span key="s3" className="text-red-400">하락</span>,
            ],
            [
              "2022-09 ~ 11",
              "31일",
              "-2.6%",
              "-11.4%",
              <strong key="s4" className="text-red-400">-15.9%</strong>,
              "횡보",
            ],
            ["2022-11 ~ 12", "30일", "-0.8%", "+2.4%", "+5.8%", "횡보"],
            [
              "2023-01 ~ 03",
              "38일",
              "+2.5%",
              "+14.0%",
              <strong key="s5" className="text-foreground">+14.6%</strong>,
              "횡보",
            ],
            [
              "2023-03 ~ 07",
              "71일",
              "+6.7%",
              "+9.6%",
              "+6.6%",
              <span key="s6" className="text-green-400">상승</span>,
            ],
            [
              "2023-09 ~ 11",
              "28일",
              <strong key="s7" className="text-red-400">-7.5%</strong>,
              "-11.5%",
              <strong key="s8" className="text-red-400">-17.5%</strong>,
              <span key="s9" className="text-red-400">하락</span>,
            ],
            ["2023-11 ~ 2024-01", "41일", "+0.4%", "+5.6%", "+8.5%", "횡보"],
            [
              "2024-02 ~ 04",
              "48일",
              "+5.0%",
              "+6.7%",
              "+8.7%",
              <span key="s10" className="text-green-400">상승</span>,
            ],
            ["2024-06 ~ 07", "33일", "+1.3%", "-6.0%", "+1.0%", "횡보"],
            [
              "2024-08 ~ 2025-01",
              "102일",
              <strong key="s11" className="text-red-400">-6.9%</strong>,
              "-7.8%",
              <strong key="s12" className="text-red-400">-19.0%</strong>,
              <span key="s13" className="text-red-400">하락</span>,
            ],
            ["2025-02 ~ 03", "36일", "+1.9%", "-5.1%", "+5.3%", "횡보"],
            [
              "2025-04 ~ 2026-02",
              "196일",
              <strong key="s14" className="text-green-400">+116.3%</strong>,
              "+51.6%",
              <strong key="s15" className="text-green-400">+81.0%</strong>,
              <span key="s16" className="text-green-400">상승</span>,
            ],
          ]}
        />
        <div className="mt-3 space-y-1.5">
          <p>
            <strong className="text-foreground">하락 구간</strong>: 융자잔고
            감소폭이 지수 하락폭의{" "}
            <strong className="text-foreground">1.7~2.7배</strong> (레버리지
            효과).
          </p>
          <p>
            <strong className="text-foreground">2025년 대상승장</strong>: 코스피
            +116%에 융자 +81% &mdash; 역대급 동반 상승.
          </p>
        </div>
      </Accordion>

      {/* 7. 반복 패턴 탐지 */}
      <Accordion title="7. 반복 패턴 탐지">
        <p className="mb-3 font-medium text-foreground">
          융자 급증(상위 10%) 후 지수 성과
        </p>
        <Table
          headers={["기간", "코스피 평균", "하락 확률", "코스닥 평균", "하락 확률"]}
          rows={[
            ["5일 후", "+0.76%", "42.7%", "+0.27%", "41.7%"],
            ["10일 후", "+1.17%", "41.6%", "+0.58%", "40.6%"],
            ["20일 후", "+2.16%", "36.7%", "+1.30%", "36.7%"],
            [
              "30일 후",
              "+3.25%",
              <strong key="p1" className="text-foreground">29.9%</strong>,
              "+1.60%",
              "37.1%",
            ],
          ]}
        />
        <p className="mt-2">
          &rarr; 융자 급증 후 30일 코스피 하락 확률 30%. 급증 자체는 단기적으로
          위험 신호가 아닙니다.
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          융자 급감(하위 10%) 후 지수 성과
        </p>
        <Table
          headers={["기간", "코스피 평균", "상승 확률", "코스닥 평균", "상승 확률"]}
          rows={[
            ["5일 후", "+0.37%", "59.2%", "+0.27%", "52.4%"],
            ["10일 후", "+0.90%", "62.1%", "+0.90%", "58.3%"],
            ["20일 후", "+2.45%", "68.9%", "+2.74%", "72.8%"],
            [
              "30일 후",
              "+3.32%",
              <strong key="p2" className="text-green-400">72.8%</strong>,
              "+3.74%",
              <strong key="p3" className="text-green-400">72.8%</strong>,
            ],
          ]}
        />
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="font-semibold text-green-400">
            융자 급감 후 30일 상승 확률 73% &mdash; 강한 반등 신호
          </p>
          <p className="mt-1">
            공포 매도 후 바닥 형성 패턴입니다. 단, 거시경제 충격기에는 예외.
          </p>
        </div>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">기타 패턴</p>
        <Table
          headers={["패턴", "결과"]}
          rows={[
            [
              "융자 최장 연속 증가",
              <strong key="c1" className="text-foreground">18일</strong>,
            ],
            [
              "융자 최장 연속 감소",
              <strong key="c2" className="text-foreground">15일</strong>,
            ],
            [
              "코스피 급락 후 3일 내 융자 감소 확률",
              <strong key="c3" className="text-foreground">65.4%</strong>,
            ],
          ]}
        />
      </Accordion>

      {/* 8. 예외/이상치 */}
      <Accordion title="8. 예외/이상치">
        <p className="mb-3 font-medium text-foreground">
          예외1: 융자 급증인데 지수도 크게 상승 (+5% 이상)
        </p>
        <Table
          headers={["기간", "특징", "사례 수"]}
          rows={[
            ["2023-03 / 2023-11", "AI 테마 랠리, 연말 산타랠리", "4건"],
            [
              "2025-04 ~ 06",
              <strong key="e1" className="text-foreground">
                대상승장 초입
              </strong>,
              "10건",
            ],
            [
              "2025-08 ~ 2026-02",
              <strong key="e2" className="text-foreground">
                상승장 지속 &mdash; 모멘텀 매수세
              </strong>,
              "13건",
            ],
          ]}
        />
        <p className="mt-2">
          &rarr; 강한 상승장에서는 융자 급증이 위험이 아닌{" "}
          <strong className="text-foreground">추세 확인 신호</strong>입니다.
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          예외2: 융자 급감인데 계속 하락
        </p>
        <Table
          headers={["날짜", "융자 변화", "30일 후 코스피", "당시 상황"]}
          rows={[
            [
              "2022-01",
              "-1.0~1.2%",
              "-6~8%",
              "미 금리인상 시작, 우크라 전쟁 임박",
            ],
            ["2022-05", "-0.9~1.1%", "-6~11%", "루나/테라 사태, 글로벌 긴축"],
            ["2024-07-29", "-1.0%", "-8.8%", "블랙먼데이 직전"],
            ["2024-10-25", "-0.8%", "-6.0%", "미 대선 불확실성"],
          ]}
        />
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="font-semibold text-yellow-400">
            거시경제 충격(전쟁, 긴축, 시스템 리스크) 구간에서는 융자 급감이
            바닥 신호가 되지 않습니다.
          </p>
        </div>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          예외3: 코스피 급등인데 3일 후 융자 감소
        </p>
        <Table
          headers={["날짜", "코스피", "3일 후 융자", "해석"]}
          rows={[
            ["2022-10-04", "+2.50%", "-1.02%", "데드캣 바운스 (일시 반등)"],
            ["2025-10-16", "+2.49%", "-0.54%", "차익실현 매도"],
            ["2025-11-20", "+1.92%", "-0.35%", "단기 조정 구간"],
          ]}
        />
        <p className="mt-2">
          &rarr; 반등 시 추가 매수 대신 기존 빚을 갚는 패턴 &mdash;{" "}
          <strong className="text-foreground">신뢰도 낮은 반등 신호</strong>.
        </p>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          예외4: 코스피 급락인데 같은 날 융자 증가 (18건)
        </p>
        <Table
          headers={["주요 사례", "코스피", "융자", "해석"]}
          rows={[
            ["2024-09-04", "-3.15%", "+0.35%", "물타기 매수"],
            ["2025-11-14", "-3.81%", "+0.58%", "저가 매수 시도"],
            [
              "2026-02-02",
              <strong key="e3" className="text-red-400">-5.26%</strong>,
              "+0.64%",
              <strong key="e4" className="text-red-400">
                급락 중 빚투 진입
              </strong>,
            ],
          ]}
        />
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="font-semibold text-red-400">
            급락일에 융자 증가 = &ldquo;물타기&rdquo; 투자자 존재
          </p>
          <p className="mt-1">
            후속 하락 시 반대매매 폭탄이 될 수 있는 가장 위험한 투자자
            행동입니다.
          </p>
        </div>

        <hr className="my-4 border-border" />

        <p className="mb-3 font-medium text-foreground">
          극단 이상치 (상위/하위 1%)
        </p>
        <Table
          headers={["날짜", "융자 변화", "코스피", "코스닥", "비고"]}
          rows={[
            [
              "2022-01-28",
              <strong key="x1" className="text-red-400">-5.42%</strong>,
              "-4.61%",
              "-4.65%",
              "금리인상 공포 동반 폭락",
            ],
            [
              "2022-06-27",
              <strong key="x2" className="text-red-400">-4.49%</strong>,
              "+1.49%",
              "+2.71%",
              "공포 청산 후 반등 (전형적)",
            ],
            [
              "2024-08-07",
              <strong key="x3" className="text-red-400">-7.01%</strong>,
              "+1.83%",
              "+2.14%",
              "역대 최대 감소 (블랙먼데이)",
            ],
            [
              "2025-06-25",
              <strong key="x4" className="text-green-400">+2.15%</strong>,
              "+0.15%",
              "-0.34%",
              "역대 최대 증가 (대상승장 FOMO)",
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
              "장기 상관 0.89 / 일별 상관 0.05",
              "같은 방향이지만 동시에는 안 움직임 — 시차 활용 가능",
            ],
            [
              "2",
              <strong key="s1" className="text-foreground">
                지수가 3영업일 선행
              </strong>,
              "지수 급변 후 3일 뒤 융자 데이터 확인하면 후속 흐름 예측 가능",
            ],
            [
              "3",
              "2023-03 최대 위험, 2022-11 최대 회복",
              "괴리가 극단적인 구간이 전환점",
            ],
            [
              "4",
              "저점은 융자가 ~7일 후행",
              "지수 바닥 후 1~2주 기다리면 융자 바닥 확인 가능",
            ],
            [
              "5",
              <strong key="s5" className="text-foreground">
                지수 급락 3일 후 융자 -1%
              </strong>,
              "반대매매는 T+3일에 집중 — 급락 직후보다 3일 후가 진짜 청산일",
            ],
            [
              "6",
              "하락기 융자 감소 = 지수의 2배",
              "레버리지 효과로 융자 변동이 더 극단적",
            ],
            [
              "7",
              <strong key="s7" className="text-green-400">
                융자 급감 후 30일 상승 확률 73%
              </strong>,
              "가장 강력한 매수 신호 — 단, 거시 충격기에는 예외",
            ],
            [
              "7",
              "융자 급증 후 30일 하락 확률 30%",
              "급증 자체는 경고가 아님 — 과열지수와 함께 봐야 함",
            ],
            [
              "8",
              <strong key="s8" className="text-red-400">
                급락일 융자 증가 = 물타기
              </strong>,
              "후속 하락 시 반대매매 폭탄 위험",
            ],
            [
              "8",
              "거시 충격기에는 모든 패턴 무효",
              "전쟁/긴축/시스템 리스크에서는 융자 급감도 바닥 아님",
            ],
          ]}
        />
        <div className="mt-4 rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
          <p className="text-sm font-semibold text-blue-400">한 줄 요약</p>
          <p className="mt-1 text-sm text-foreground">
            지수가 먼저 움직이고 융자가 3일 뒤 따라간다. 융자 급감 후 반등
            확률 73%가 가장 신뢰할 수 있는 신호지만, 거시경제 충격기에는
            작동하지 않는다.
          </p>
        </div>
      </Accordion>
    </div>
  );
}
