"use client";

import { useState } from "react";
import { ChevronDown, Droplets, Snowflake, Radio } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LearnTopic {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  content: React.ReactNode;
  ctaLabel: string;
  ctaTab: string;
}

function Quote({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="my-4 border-l-4 border-amber-500/50 pl-4 text-sm font-medium italic text-foreground">
      {children}
    </blockquote>
  );
}

function buildTopics(onNavigate?: (tab: string) => void): LearnTopic[] {
  return [
    {
      id: "money-flows-down",
      title: "💧 돈은 위에서 아래로 흐릅니다",
      description: "Fed가 돈을 풀면, 누가 제일 먼저 받을까요?",
      icon: <Droplets className="size-5" />,
      color: "text-blue-400",
      ctaLabel: "👉 1~6번의 움직임 보기",
      ctaTab: "players",
      content: (
        <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            비가 산꼭대기에 내리면, 물은 계곡을 타고 강으로, 강에서 들판으로,
            들판에서 마을로 흘러갑니다. 꼭대기가 먼저 젖고, 마을은 가장 나중에
            젖어요.
          </p>

          <p>
            <strong className="text-foreground">돈도 똑같습니다.</strong>
          </p>

          <p>
            미국 중앙은행(Fed)이 돈을 풀면, 모든 사람에게 동시에 가는 게
            아닙니다. 순서가 있어요.
          </p>

          <div className="rounded-lg border bg-muted/30 p-4">
            <ol className="space-y-1.5 text-xs">
              <li className="flex gap-2">
                <span className="font-mono font-semibold text-foreground">①</span>
                <span>Fed (돈을 만드는 곳)</span>
              </li>
              <li className="flex gap-2">
                <span className="font-mono font-semibold text-foreground">②</span>
                <span>대형 금융기관 (JP모건, 블랙록 — 제일 먼저 받음)</span>
              </li>
              <li className="flex gap-2">
                <span className="font-mono font-semibold text-foreground">③</span>
                <span>정부 (국채 발행으로 돈을 받음)</span>
              </li>
              <li className="flex gap-2">
                <span className="font-mono font-semibold text-foreground">④</span>
                <span>대형 기업 (은행에서 대출)</span>
              </li>
              <li className="flex gap-2">
                <span className="font-mono font-semibold text-foreground">⑤</span>
                <span>투기 자본/헤지펀드 (기회를 잡아 뛰어듦)</span>
              </li>
              <li className="flex gap-2">
                <span className="font-mono font-semibold text-foreground">⑥</span>
                <span>규제기관 (흐름의 규칙을 정하는 심판)</span>
              </li>
              <li className="flex gap-2">
                <span className="font-mono font-semibold text-foreground">⑦</span>
                <span><strong className="text-foreground">개인 투자자 — 우리 (제일 마지막에 도착)</strong></span>
              </li>
            </ol>
          </div>

          <p>
            문제는 이겁니다.{" "}
            <strong className="text-foreground">
              돈이 위에서부터 흘러내려오는 동안, 자산 가격은 이미 오르기 시작합니다.
            </strong>{" "}
            ②번(금융기관)이 받았을 때 집값이 1억이었다면, ⑦번(우리)이 받을
            때쯤이면 이미 1억 3천이 되어 있을 수 있어요.
          </p>

          <p>
            같은 돈인데, 먼저 받은 쪽이 무조건 유리합니다. 이걸 경제학에서는{" "}
            <strong className="text-foreground">
              &quot;칸티용 효과(Cantillon Effect)&quot;
            </strong>
            라고 부릅니다.
          </p>

          <p>
            <strong className="text-foreground">
              이 페이지가 존재하는 이유가 바로 이겁니다.
            </strong>{" "}
            ①~⑥번이 지금 뭘 하고 있는지 관찰하면, ⑦번인 우리도 미리 준비할 수
            있습니다.
          </p>

          <Quote>
            우리는 7번입니다. 바꿀 수는 없지만, 위에서 물이 내려오는 걸 보고
            미리 준비할 수는 있습니다.
          </Quote>
        </div>
      ),
    },
    {
      id: "melting-ice",
      title: "🧊 현금은 천천히 녹는 얼음입니다",
      description: "가만히 있는 것이 가장 위험한 선택인 이유",
      icon: <Snowflake className="size-5" />,
      color: "text-cyan-400",
      ctaLabel: "👉 지금 돈이 어디로 흐르는지 보기",
      ctaTab: "ai",
      content: (
        <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            전 세계 가계 순자산은{" "}
            <strong className="text-foreground">
              약 400~500조 달러(약 600경 원)
            </strong>
            입니다. 이 안을 들여다보면:
          </p>

          <div className="rounded-lg border bg-muted/30 p-4">
            <ul className="space-y-1.5 text-xs">
              <li className="flex justify-between">
                <span>부동산 (집, 건물, 땅)</span>
                <span className="font-mono text-foreground">약 40~50%</span>
              </li>
              <li className="flex justify-between">
                <span>금융자산 (주식, 채권, 예금, 연금)</span>
                <span className="font-mono text-foreground">약 40~50%</span>
              </li>
              <li className="flex justify-between">
                <span>기타 (금, 비상장 기업 등)</span>
                <span className="font-mono text-foreground">나머지</span>
              </li>
            </ul>
          </div>

          <p>
            여기서 중요한 건 이겁니다.
          </p>

          <p>
            <strong className="text-foreground">
              Fed가 돈을 찍으면 화폐량이 늘어납니다.
            </strong>{" "}
            화폐량이 늘면:
          </p>

          <ul className="space-y-1 text-sm">
            <li>— 부동산 가진 사람 → 집값이 따라 올라갑니다</li>
            <li>— 주식 가진 사람 → 기업 가치가 따라 올라갑니다</li>
            <li>— 채권 가진 사람 → 이자라도 받습니다</li>
          </ul>

          <p>
            그런데{" "}
            <strong className="text-foreground">
              현금만 들고 있는 사람은? 아무 일도 안 일어납니다.
            </strong>{" "}
            물가가 오르는데 돈의 양은 그대로니까, 구매력이 조용히 줄어듭니다.
          </p>

          <p>
            미국 달러 기준으로, 1913년의 1달러는 오늘날 약 30달러의 구매력에
            해당합니다.{" "}
            <strong className="text-foreground">
              110년간 가치가 약 97% 녹아내린 겁니다.
            </strong>
          </p>

          <p>
            녹은 가치는 사라진 게 아닙니다.{" "}
            <strong className="text-foreground">
              자산을 가진 쪽으로 조용히 이동한 겁니다.
            </strong>
          </p>

          <Quote>
            현금은 천천히 녹는 얼음입니다. 가만히 있는 것이 가장 위험한
            선택입니다.
          </Quote>
        </div>
      ),
    },
    {
      id: "read-signals",
      title: "📡 신호를 읽는 자가 살아남습니다",
      description: "금리가 바뀐 뒤에 보면 이미 늦습니다",
      icon: <Radio className="size-5" />,
      color: "text-amber-400",
      ctaLabel: "👉 21개 신호 확인하기",
      ctaTab: "players",
      content: (
        <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            <strong className="text-foreground">
              Fed가 기준금리를 정합니다.
            </strong>{" "}
            이 금리가 세상 모든 이자의 바닥이 됩니다.
          </p>

          <ul className="space-y-1 text-sm">
            <li>— 기준금리 5%면 → 주택대출 8%, 기업대출 7%</li>
            <li>— 기준금리 2%면 → 주택대출 5%, 기업대출 4%</li>
          </ul>

          <p>
            금리가 내려가면 대출이 쉬워지고, 그 돈이 부동산과 주식으로
            흘러갑니다. 자산 가격이 올라가요.
          </p>

          <p>
            그런데 핵심은 이겁니다.{" "}
            <strong className="text-foreground">
              자산 가격은 금리가 실제로 내려간 뒤에 오르는 게 아닙니다.
            </strong>{" "}
            &quot;곧 내릴 것 같다&quot;는 신호가 나올 때 이미 오르기 시작합니다.
          </p>

          <p>
            왜냐하면 ②번(대형 금융기관)과 ⑤번(헤지펀드)은 전문가 수백 명이 Fed를
            분석하고 있거든요. &quot;곧 내리겠다&quot;를 미리 판단하고 먼저
            삽니다. 그래서 가격이 먼저 올라요.
          </p>

          <p>
            ⑦번(우리)이 뉴스에서 &quot;금리 인하!&quot; 보고 들어갈 때쯤이면,{" "}
            <strong className="text-foreground">
              이미 가격이 올라있는 경우가 많습니다.
            </strong>
          </p>

          <p>
            그래서{" "}
            <strong className="text-foreground">
              금리 자체보다 &quot;앞으로 올릴지 내릴지&quot;가 더 중요합니다.
            </strong>{" "}
            이걸 알려주는 게 FOMC 점도표, 파월 의장 발언, 경제 지표 같은
            것들입니다.
          </p>

          <p>
            이 페이지의 &quot;주체별 지표&quot; 탭에 있는{" "}
            <strong className="text-foreground">21개 지표</strong>가 바로 그
            신호들입니다. ①~⑥번이 지금 뭘 하고 있는지 보여주는 계기판이에요.
          </p>

          <Quote>
            금리가 바뀐 뒤에 보면 이미 늦습니다. 바뀌기 전 신호를 읽어야 합니다.
          </Quote>
        </div>
      ),
    },
  ];
}

interface LearnSectionProps {
  onNavigate?: (tab: string) => void;
}

export function LearnSection({ onNavigate }: LearnSectionProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const topics = buildTopics(onNavigate);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        돈의 흐름을 이해하기 위한 핵심 스토리 3가지를 준비했습니다. 카드를
        클릭해 펼쳐보세요.
      </p>

      {topics.map((topic) => {
        const isOpen = openId === topic.id;
        return (
          <Collapsible
            key={topic.id}
            open={isOpen}
            onOpenChange={(val) => setOpenId(val ? topic.id : null)}
          >
            <Card>
              <CollapsibleTrigger className="w-full text-left">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <span className={topic.color}>{topic.icon}</span>
                    <div className="flex-1">
                      <CardTitle className="text-base">
                        {topic.title}
                      </CardTitle>
                      <CardDescription className="mt-1 text-xs">
                        {topic.description}
                      </CardDescription>
                    </div>
                    <ChevronDown
                      className={cn(
                        "size-4 text-muted-foreground transition-transform",
                        isOpen && "rotate-180"
                      )}
                    />
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent>
                  {topic.content}
                  {onNavigate && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigate(topic.ctaTab);
                      }}
                    >
                      {topic.ctaLabel}
                    </Button>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}
    </div>
  );
}
