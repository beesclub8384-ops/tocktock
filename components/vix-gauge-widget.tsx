"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HelpCircle, X } from "lucide-react";

const VIX_MAX = 50;
const REFRESH_MS = 60_000;

// SVG gauge geometry
const CX = 100;
const CY = 100;
const R = 80;
const SW = 14;
const NEEDLE_R = R - SW / 2 - 4;

const SEGMENTS = [
  { min: 0, max: 15, color: "#22c55e", label: "안정" },
  { min: 15, max: 25, color: "#eab308", label: "경계" },
  { min: 25, max: 35, color: "#f97316", label: "공포" },
  { min: 35, max: VIX_MAX, color: "#ef4444", label: "극도의 공포" },
];

function vixToAngle(v: number) {
  return 180 - (Math.max(0, Math.min(VIX_MAX, v)) / VIX_MAX) * 180;
}

function polar(deg: number, r: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) };
}

function arcD(fromAngle: number, toAngle: number) {
  const s = polar(fromAngle, R);
  const e = polar(toAngle, R);
  const large = fromAngle - toAngle > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${R} ${R} 0 ${large} 1 ${e.x} ${e.y}`;
}

function statusOf(vix: number) {
  if (vix < 15) return { text: "안정", cls: "text-green-500" };
  if (vix < 25) return { text: "경계", cls: "text-yellow-500" };
  if (vix < 35) return { text: "공포", cls: "text-orange-500" };
  return { text: "극도의 공포", cls: "text-red-500" };
}

/* ────────────────────────────────────────────
   가이드 모달
   ──────────────────────────────────────────── */
function VixGuideModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

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
      <div className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl sm:p-8">
        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X size={20} />
        </button>

        <h2 className="mb-6 text-xl font-bold">공포지수(VIX) 보는 법</h2>

        {/* 1. 공포지수가 뭔가요? */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">
            공포지수가 뭔가요?
          </h3>
          <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            <li>
              공포지수의 정식 이름은 VIX(Volatility Index)입니다. 미국
              시카고옵션거래소(CBOE)에서 만든 지표입니다.
            </li>
            <li>
              쉽게 말하면: &ldquo;앞으로 30일 동안 주식시장이 얼마나
              출렁일지&rdquo;를 숫자로 나타낸 것입니다.
            </li>
            <li>
              투자자들이 불안해할수록 숫자가 올라갑니다. 그래서
              &ldquo;공포지수&rdquo;라는 별명이 붙었습니다.
            </li>
          </ul>
        </section>

        <hr className="my-5 border-border" />

        {/* 2. 어떻게 계산되나요? */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">
            어떻게 계산되나요?
          </h3>
          <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            <li>보험료를 떠올리면 이해하기 쉽습니다.</li>
            <li>
              태풍이 올 것 같으면 보험료가 올라가죠? 마찬가지입니다.
              투자자들이 &ldquo;주가가 크게 떨어질 것 같다&rdquo;고 느끼면,
              주식 보험(옵션)을 많이 사려고 합니다.
            </li>
            <li>
              보험을 사려는 사람이 많아지면 &rarr; 보험료(옵션 가격)가 올라가고
              &rarr; VIX도 올라갑니다.
            </li>
            <li>
              반대로 시장이 안정적이면 보험 수요가 줄고 &rarr; VIX가
              내려갑니다.
            </li>
          </ul>
        </section>

        <hr className="my-5 border-border" />

        {/* 3. 숫자별 의미 */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">
            숫자별 의미 — 신호등처럼 읽으세요
          </h3>
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="mb-1 text-sm font-semibold text-green-500">
                0~20 — 안정
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                시장이 평화로운 상태입니다. 투자자들이 큰 걱정 없이 투자하고
                있습니다.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="mb-1 text-sm font-semibold text-yellow-500">
                20~30 — 불안
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                무언가 불확실한 요소가 생겼습니다. 금리 결정, 선거, 국제 갈등
                같은 이벤트가 다가올 때 이 구간에 오는 경우가 많습니다.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="mb-1 text-sm font-semibold text-orange-500">
                30~40 — 공포
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                시장에 뚜렷한 위험 신호가 있습니다. 투자자들이 적극적으로 방어
                태세를 취하고 있습니다.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="mb-1 text-sm font-semibold text-red-500">
                40 이상 — 극심한 공포
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                시장이 패닉 상태입니다. 역사적으로 매우 드문 수준입니다.
              </p>
            </div>
          </div>
        </section>

        <hr className="my-5 border-border" />

        {/* 4. 과거 주요 사례 */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">과거 주요 사례</h3>
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
            <ul className="space-y-1.5">
              <li>
                <strong className="text-foreground">2008년 금융위기</strong>:
                VIX가 80까지 치솟았습니다. 리먼 브라더스 파산 직후입니다.
              </li>
              <li>
                <strong className="text-foreground">2020년 코로나19</strong>:
                VIX가 82.69를 기록했습니다. 역대 최고 수준이었습니다.
              </li>
              <li>
                <strong className="text-foreground">
                  2024년 8월 블랙먼데이
                </strong>
                : VIX가 65까지 급등했습니다. 일본 엔캐리 트레이드 청산
                때문이었습니다.
              </li>
              <li>
                <strong className="text-foreground">평상시</strong>: 보통
                12~20 사이에서 움직입니다.
              </li>
            </ul>
          </div>
        </section>

        <hr className="my-5 border-border" />

        {/* 5. VIX 높으면 나쁜 건가요? */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">
            VIX가 높으면 무조건 나쁜 건가요?
          </h3>
          <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            <li>꼭 그렇지는 않습니다.</li>
            <li>
              VIX가 급등한 시점은 역사적으로 &ldquo;좋은 매수 기회&rdquo;인
              경우가 많았습니다. 모두가 공포에 빠져 팔 때가 오히려 싸게 살 수
              있는 시점이기 때문입니다.
            </li>
            <li>
              워런 버핏의 유명한 말: &ldquo;남들이 공포에 떨 때 탐욕을
              부려라&rdquo;
            </li>
            <li>
              다만 VIX가 높다고 무조건 매수하면 안 됩니다. 공포에는 이유가
              있을 수 있습니다.
            </li>
          </ul>
        </section>

        <hr className="my-5 border-border" />

        {/* 6. VIX 낮으면 안심? */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">
            VIX가 낮으면 안심해도 되나요?
          </h3>
          <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            <li>
              VIX가 낮다고 &ldquo;위험이 없다&rdquo;는 뜻은 아닙니다.
            </li>
            <li>
              오히려 VIX가 너무 낮으면(12 이하) &ldquo;투자자들이 너무 안심하고
              있다&rdquo;는 경고일 수 있습니다.
            </li>
            <li>
              과도한 안심 &rarr; 레버리지(빚투) 증가 &rarr; 갑작스러운 충격에
              취약
            </li>
            <li>
              역사적으로 VIX가 극도로 낮은 시기 이후에 급등한 사례가 여러 번
              있습니다.
            </li>
          </ul>
        </section>

        <hr className="my-5 border-border" />

        {/* 7. 다른 지표와 함께 */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">
            TockTock의 다른 지표와 함께 보세요
          </h3>
          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              <strong className="text-red-500">
                VIX 낮음 + 빚투 과열지수 높음
              </strong>{" "}
              &rarr; 가장 위험한 조합. 안심하면서 빚투가 늘어나는 상태
            </p>
            <p>
              <strong className="text-green-500">
                VIX 높음 + 빚투 과열지수 하락
              </strong>{" "}
              &rarr; 공포 속에서 빚투가 줄고 있는 상태. 바닥 신호일 수 있음
            </p>
            <p>
              <strong className="text-blue-500">
                VIX 낮음 + 빚투 과열지수 낮음
              </strong>{" "}
              &rarr; 가장 건강한 시장 상태
            </p>
          </div>
        </section>

        <hr className="my-5 border-border" />

        {/* 8. 주의할 점 */}
        <section className="mb-6">
          <h3 className="mb-2 text-base font-semibold">주의할 점</h3>
          <ul className="list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-muted-foreground">
            <li>
              VIX는 미국 S&amp;P 500 기준입니다. 한국 시장(KOSPI)과 반드시
              일치하지는 않습니다.
            </li>
            <li>
              다만 미국 시장이 흔들리면 한국 시장도 영향을 받기 때문에 참고
              지표로 매우 유용합니다.
            </li>
            <li>
              VIX는 &ldquo;예측&rdquo;이 아니라 &ldquo;현재 투자자들의
              심리&rdquo;를 보여주는 지표입니다.
            </li>
            <li>
              실시간으로 변동하며, TockTock에서는 Yahoo Finance API를 통해
              데이터를 제공합니다.
            </li>
          </ul>
        </section>

        <hr className="my-5 border-border" />

        {/* 9. 한 줄 정리 */}
        <section>
          <h3 className="mb-2 text-base font-semibold">한 줄 정리</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            VIX는 <strong className="text-foreground">&ldquo;시장의
            체온계&rdquo;</strong>입니다. 체온이 높으면 몸에 이상이 있다는
            신호이고, 너무 낮아도 무감각한 상태일 수 있습니다. 정기적으로
            체크하면서 시장의 건강 상태를 확인하세요.
          </p>
        </section>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────
   메인 위젯
   ──────────────────────────────────────────── */
export function VixGaugeWidget() {
  const [vix, setVix] = useState<number | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchVix() {
      try {
        const res = await fetch("/api/stock/%5EVIX/quote");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.price != null) setVix(data.price);
      } catch {
        /* keep existing data */
      }
    }

    fetchVix();
    const id = setInterval(fetchVix, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const angle = vix != null ? vixToAngle(vix) : 90;
  const status = vix != null ? statusOf(vix) : null;

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      {guideOpen && <VixGuideModal onClose={() => setGuideOpen(false)} />}

      <div className="mb-2 flex items-center justify-center gap-2">
        <Link
          href="/stock/%5EVIX"
          className="text-lg font-semibold hover:text-muted-foreground transition-colors"
        >
          공포지수 (VIX)
        </Link>
        <button
          onClick={() => setGuideOpen(true)}
          className="guide-btn inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs transition-all"
        >
          <HelpCircle size={12} />
          보는 법
        </button>
      </div>

      <Link href="/stock/%5EVIX" className="block transition-colors hover:opacity-80">
        <svg viewBox="0 0 200 110" className="mx-auto w-full max-w-[280px]">
          {/* Colored arc segments */}
          {SEGMENTS.map((seg) => (
            <path
              key={seg.min}
              d={arcD(vixToAngle(seg.min), vixToAngle(seg.max))}
              stroke={seg.color}
              strokeWidth={SW}
              fill="none"
            />
          ))}

          {/* Needle — drawn pointing right then rotated */}
          <g transform={`rotate(${-angle} ${CX} ${CY})`}>
            <polygon
              points={`${CX + 6},${CY - 3} ${CX + NEEDLE_R},${CY} ${CX + 6},${CY + 3}`}
              className="fill-foreground"
            />
          </g>
          <circle cx={CX} cy={CY} r={5} className="fill-foreground" />

          {/* Scale labels at endpoints */}
          <text
            x={CX - R - SW / 2 - 2}
            y={CY + 4}
            textAnchor="end"
            className="fill-muted-foreground"
            fontSize={9}
          >
            0
          </text>
          <text
            x={CX + R + SW / 2 + 2}
            y={CY + 4}
            textAnchor="start"
            className="fill-muted-foreground"
            fontSize={9}
          >
            50
          </text>
        </svg>

        {/* Value + status */}
        <div className="-mt-1 text-center">
          {vix != null ? (
            <>
              <p className="text-3xl font-extrabold tabular-nums">
                {vix.toFixed(2)}
              </p>
              <p className={`text-sm font-medium ${status!.cls}`}>
                {status!.text}
              </p>
            </>
          ) : (
            <p className="text-lg text-muted-foreground">—</p>
          )}
        </div>
      </Link>

      {/* Zone legend */}
      <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        {SEGMENTS.map((seg) => (
          <span key={seg.min} className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: seg.color }}
            />
            {seg.label}
          </span>
        ))}
      </div>
    </div>
  );
}
