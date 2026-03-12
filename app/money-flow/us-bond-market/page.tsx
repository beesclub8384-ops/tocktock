"use client";

import { useState } from "react";
import Link from "next/link";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

/* ── 데이터 ── */

const BOND_DATA = [
  {
    id: "ust",
    name: "재무부 채권(UST)",
    pct: 45,
    color: "#1E40AF",
    short: "미 연방정부의 직접 채무",
    detail:
      "연방 예산·재정지출을 위한 재원. 미국이 돈이 필요할 때 발행하는 채권입니다. 뉴스에서 \"미국 이자비 폭증\"이라고 할 때 이야기하는 이자가 거의 다 이것입니다. 만기에 따라 T-Bill(1년 이하), T-Note(2~10년), T-Bond(20~30년)로 나뉩니다.",
  },
  {
    id: "corp",
    name: "회사채·크레딧",
    pct: 26,
    color: "#DC2626",
    short: "기업이 자금을 조달하기 위해 발행하는 채권",
    detail:
      "3가지로 나뉩니다. ① 회사채(Corporate Bond): 기업이 직접 채권 시장에서 발행 ② 사모대출(Private Credit): 은행·채권시장 거치지 않고 투자자가 기업에 직접 빌려주는 돈 ③ 구조화 크레딧: ABS(카드대금·자동차대출 묶음), MBS(주택담보대출 묶음), CLO(기업대출 묶음)",
  },
  {
    id: "gse",
    name: "GSE·에이전시·MBS",
    pct: 20,
    color: "#059669",
    short: "정부가 만든 기관이 보증하는 채권",
    detail:
      "정부 채권은 아니지만 정부 지원이 있는 준정부 채권입니다. GSE(Government-Sponsored Enterprise)는 정부가 만든 민간회사로 Fannie Mae, Freddie Mac이 대표적입니다. Agency는 Ginnie Mae 같은 정부기관입니다. 이들이 발행하거나 보증하는 MBS(주택담보대출 묶음)가 여기 포함됩니다.",
  },
  {
    id: "muni",
    name: "지방채(Municipals)",
    pct: 7,
    color: "#D97706",
    short: "주·시·카운티 등 지방정부가 발행하는 채권",
    detail:
      "도로, 학교, 공공시설 건설 등 지방 재정을 위한 채권입니다. 이자소득이 연방세 면제되는 경우가 많아 고소득 투자자에게 인기가 있습니다.",
  },
  {
    id: "other",
    name: "기타 단기증권(CP 등)",
    pct: 2,
    color: "#6B7280",
    short: "기업이 단기 운영자금 조달에 쓰는 초단기 어음",
    detail:
      "상업어음(Commercial Paper, CP)이 대표적입니다. 만기가 270일 이하인 단기 채무증권으로, 기업이 급히 현금이 필요할 때 발행합니다.",
  },
];

const GLOSSARY = [
  {
    term: "MBS",
    full: "Mortgage-Backed Securities",
    desc: "주택담보대출을 묶어서 만든 채권. 은행이 대출을 한 뒤 이를 증권화해서 투자자에게 판매합니다.",
  },
  {
    term: "ABS",
    full: "Asset-Backed Securities",
    desc: "자동차 대출, 카드 대금, 학자금 대출 등을 묶어 만든 채권입니다.",
  },
  {
    term: "GSE",
    full: "Government-Sponsored Enterprise",
    desc: "정부가 설립한 민간 기업. Fannie Mae, Freddie Mac이 대표적이며, 주택 시장 안정을 위해 만들어졌습니다.",
  },
  {
    term: "CLO",
    full: "Collateralized Loan Obligation",
    desc: "기업 대출을 묶어서 만든 구조화 채권. 위험도에 따라 여러 등급(트랜치)으로 나뉩니다.",
  },
  {
    term: "T-Bill / T-Note / T-Bond",
    full: "Treasury Securities",
    desc: "미국 재무부 채권의 만기별 구분. T-Bill(1년 이하), T-Note(2~10년), T-Bond(20~30년)입니다.",
  },
  {
    term: "CP",
    full: "Commercial Paper",
    desc: "기업이 단기 자금을 조달하기 위해 발행하는 무담보 어음. 만기 270일 이하입니다.",
  },
];

/* ── 차트 툴팁 ── */

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: (typeof BOND_DATA)[0] }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-md">
      <p className="text-sm font-semibold">{d.name}</p>
      <p className="text-xs text-muted-foreground">{d.pct}%</p>
    </div>
  );
}

/* ── 카테고리 카드 ── */

function CategoryCard({ item }: { item: (typeof BOND_DATA)[0] }) {
  const [open, setOpen] = useState(false);

  return (
    <button
      onClick={() => setOpen(!open)}
      className="w-full rounded-xl border bg-card p-5 text-left transition-colors hover:bg-accent/50"
    >
      <div className="flex items-center gap-3">
        <span
          className="inline-block size-4 shrink-0 rounded"
          style={{ backgroundColor: item.color }}
        />
        <span className="text-base font-semibold">{item.name}</span>
        <span className="ml-auto font-mono text-lg font-bold" style={{ color: item.color }}>
          {item.pct}%
        </span>
        <span className="text-muted-foreground text-sm">{open ? "▲" : "▼"}</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{item.short}</p>
      {open && (
        <p className="mt-3 text-sm leading-relaxed border-t border-border pt-3">
          {item.detail}
        </p>
      )}
    </button>
  );
}

/* ── 메인 페이지 ── */

export default function UsBondMarketPage() {
  return (
    <div className="max-w-3xl px-6 py-16 sm:px-8">
      {/* 뒤로가기 */}
      <nav className="mb-10">
        <Link
          href="/money-flow"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; 돈의 흐름
        </Link>
      </nav>

      {/* 헤더 */}
      <header className="mb-12">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          미국 채권시장의 구조
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          돈이 어디에 얼마나 쌓여 있는가
        </p>
      </header>

      {/* 도넛 차트 */}
      <section className="mb-12">
        <div className="mx-auto" style={{ maxWidth: 320 }}>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={BOND_DATA}
                dataKey="pct"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={110}
                paddingAngle={2}
                strokeWidth={0}
              >
                {BOND_DATA.map((d) => (
                  <Cell key={d.id} fill={d.color} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* 범례 */}
        <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2">
          {BOND_DATA.map((d) => (
            <div key={d.id} className="flex items-center gap-1.5 text-sm">
              <span
                className="inline-block size-3 rounded-sm"
                style={{ backgroundColor: d.color }}
              />
              <span>
                {d.name} {d.pct}%
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 카테고리 카드 */}
      <section className="mb-12 flex flex-col gap-3">
        {BOND_DATA.map((item) => (
          <CategoryCard key={item.id} item={item} />
        ))}
      </section>

      {/* 핵심 인사이트 */}
      <section className="mb-12 rounded-xl border-l-4 border-blue-500 bg-blue-500/10 px-5 py-4">
        <p className="text-sm font-semibold text-blue-400 mb-1">핵심 인사이트</p>
        <p className="text-base leading-relaxed">
          <strong>&ldquo;이자비 폭증&rdquo;이라고 얘기하는 건 거의 다 재무부 국채 이자</strong>입니다.
          미국 채권시장의 45%를 차지하는 재무부 채권(UST)의 이자 부담이 연방 예산을 압박하고 있습니다.
        </p>
      </section>

      {/* 용어 설명 */}
      <section>
        <h2 className="text-xl font-bold mb-5">주요 용어 정리</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {GLOSSARY.map((g) => (
            <div key={g.term} className="rounded-lg border bg-card p-4">
              <p className="font-semibold">{g.term}</p>
              <p className="text-xs text-muted-foreground mb-1.5">{g.full}</p>
              <p className="text-sm leading-relaxed">{g.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-12 text-xs text-muted-foreground text-center">
        본 페이지의 모든 내용은 참고용이며, 투자 권유가 아닙니다.
      </p>
    </div>
  );
}
